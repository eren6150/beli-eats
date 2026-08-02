-- ====================================================
-- Migration 008 — move_list_items() artık KOPYALAYABİLİYOR
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 007 çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- "Başka listeye taşı" mekanı kaynak listeden siliyor. Bazen istenen bu değil:
-- mekan hem "Kahvaltı" hem "Ankara" listesinde kalmalı. Arayüze "Kaynak
-- listeden de kaldır" anahtarı geliyor (varsayılan AÇIK); kapalıyken bu
-- fonksiyon yalnızca ekleme yapıyor, yani fiilen KOPYALAMA.
--
-- ── NEDEN İSTEMCİ DÖNGÜSÜ DEĞİL ──────────────────────────────────────────────
-- Alternatif, anahtar kapalıyken RPC'yi hiç çağırmayıp `addPlaceToList`'i seçili
-- her mekan için ayrı ayrı çağırmaktı. Reddedildi:
--
--   1. Mükerrer mekan: hedefte zaten var olan her mekan `23505` döndürür ve
--      toplu kopyalamada bu bir HATA DEĞİL, beklenen durum. Döngü kurmak yeni
--      bir "kısmi başarı" anlambilimi yazmak demekti — burada `on conflict do
--      nothing` ile ZATEN çözülmüş ve taşımayla birebir aynı davranıyor.
--   2. N ayrı istek: 10 mekanlık kopyalama mobil bağlantıda kısmen başarısız
--      olmaya açık. Tek çağrı bunu ortadan kaldırıyor.
--   3. Kullanıcının TEK bir anahtarla değiştirdiği şey kodda iki ayrı mekanizma
--      (RPC vs. istemci döngüsü) olmamalı; ikisi ayrı ayrı bakım isterdi.
--
-- Dürüstlük payı: kopyalama TOPLAMALI bir işlem, yarıda kalması veriyi bozmaz.
-- Yani atomiklik burada taşımadaki kadar kritik değil — karar (1) ve (2)'ye
-- dayanıyor, (3) ise kod tekrarı gerekçesi.
--
-- ── NEDEN `create or replace` YETMİYOR ───────────────────────────────────────
-- Yeni bir parametre eklemek fonksiyonu DEĞİŞTİRMEZ, AŞIRI YÜKLEME yaratır:
-- Postgres farklı argüman listesini farklı fonksiyon sayar. Veritabanında hem
-- 3 hem 4 argümanlı `move_list_items` kalır ve PostgREST hangisini çağıracağı
-- konusunda belirsizliğe düşebilir. Bu yüzden önce DROP.
--
-- ── SAHİPLİK: KOPYALAMA MODUNDA NE OLUYOR ────────────────────────────────────
-- Taşımada kaynak listenin sahipliği fiilen DELETE'in satır sayısından geliyor.
-- Kopyalamada DELETE yok, yani kaynak üzerinde sahiplik kontrolü de yok.
-- BU YENİ BİR AÇIK DEĞİL: `list_items` SELECT politikası zaten `using (true)`,
-- kullanıcı o satırları halihazırda okuyabiliyor. Kendi listesine kopyalamak
-- ona yeni bir yetki vermiyor — hedefteki INSERT politikası hâlâ sahiplik
-- istiyor, başkasının listesine kopyalamak 0 satır yazar ve aşağıdaki kontrol
-- onu hataya çevirir.

drop function if exists public.move_list_items(uuid, uuid, uuid[]);

create or replace function public.move_list_items(
  p_source_list_id     uuid,
  p_target_list_id     uuid,
  p_item_ids           uuid[],
  -- Varsayılan `true`: parametreyi göndermeyi unutan bir çağrı bugünkü
  -- (taşıma) davranışını korur.
  p_remove_from_source boolean default true
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_given    integer;
  v_distinct integer;
  v_matched  integer;
  v_inserted integer;
  v_deleted  integer;
begin
  -- ── Girdi doğrulama ───────────────────────────────────────────────────────

  if p_source_list_id is null or p_target_list_id is null then
    raise exception 'move_list_items: liste id''leri boş olamaz';
  end if;

  -- Kendi üstüne taşımak `unique` kısıtı yüzünden HER ŞEYİ atlar, sonra
  -- kaynaktan siler — yani sessizce toplu silmeye dönüşürdü.
  -- Kopyalama modunda ise tamamen anlamsız bir no-op olurdu.
  if p_source_list_id = p_target_list_id then
    raise exception 'move_list_items: kaynak ve hedef liste aynı olamaz';
  end if;

  v_given := coalesce(array_length(p_item_ids, 1), 0);

  if v_given = 0 then
    raise exception 'move_list_items: p_item_ids boş';
  end if;

  -- Mükerrer id: aynı satır iki kez işlenmeye çalışılır, sayım tutmaz ve hata
  -- mesajı kafa karıştırıcı olurdu. Baştan reddediyoruz.
  select count(distinct x) into v_distinct from unnest(p_item_ids) x;

  if v_distinct <> v_given then
    raise exception
      'move_list_items: p_item_ids mükerrer id içeriyor (% gönderildi, % benzersiz)',
      v_given, v_distinct;
  end if;

  -- Gönderilen id'lerin hepsi GERÇEKTEN kaynak listede mi? Değilse sessizce
  -- eksik iş yapmak yerine reddediyoruz. (SELECT politikası `using (true)`
  -- olduğu için bu sayım her listede çalışır; sahiplik aşağıdaki yazmalarda.)
  select count(*) into v_matched
    from list_items
   where list_id = p_source_list_id
     and id = any(p_item_ids);

  if v_matched <> v_given then
    raise exception
      'move_list_items: % id gönderildi ama % tanesi kaynak listede — id''ler bu listeye ait olmayabilir',
      v_given, v_matched;
  end if;

  -- ── 1. Hedefe ekle (her iki modda da) ─────────────────────────────────────
  --
  -- `position` GÖNDERİLMİYOR: `set_list_item_position` trigger'ı (migration 005)
  -- hedef listenin sonuna ekliyor. Sıra ne istemcide ne burada elle
  -- hesaplanıyor — `rank_index` dersi.
  --
  -- Hedefte zaten var olan mekanlar atlanıyor: kullanıcının istediği "bu
  -- mekanlar şu listede olsun" ve zaten oradaysa istek karşılanmış demektir.

  insert into list_items (list_id, place_id)
  select p_target_list_id, li.place_id
    from list_items li
   where li.list_id = p_source_list_id
     and li.id = any(p_item_ids)
  on conflict on constraint list_items_unique_place do nothing;

  get diagnostics v_inserted = row_count;

  -- ── 2. Kaynaktan sil (YALNIZCA taşıma modunda) ────────────────────────────

  if p_remove_from_source then
    delete from list_items
     where list_id = p_source_list_id
       and id = any(p_item_ids);

    get diagnostics v_deleted = row_count;

    -- Buraya iki şekilde düşülür:
    --   1. Kaynak liste ÇAĞIRANA AİT DEĞİL → RLS DELETE politikası satırları eledi
    --   2. Araya giren başka bir işlem satırları sildi
    -- Exception işlemi geri alır: hedefe eklenenler de geri alınır, yani
    -- mekanlar iki listede birden kalmaz.
    if v_deleted <> v_given then
      raise exception
        'move_list_items: % satır silinmeliydi, % silindi — liste sana ait olmayabilir',
        v_given, v_deleted;
    end if;
  end if;

  -- Dönüş: GERÇEKTEN eklenen satır sayısı. İki modda da aynı anlamı taşıyor
  -- ("kaç yeni satır oluştu") ve hedefte zaten var olanları saymıyor.
  -- Migration 007'de silinen sayı dönüyordu; kopyalama modunda o sayı yok.
  return v_inserted;
end;
$$;

-- ----------------------------------------------------
-- YETKİLER
-- ----------------------------------------------------
-- DROP eski imzanın yetkilerini de götürdü; yenisine tekrar veriliyor.
-- anon (giriş yapmamış istemci) çağıramaz — 002 / 006 / 007 ile aynı desen.

revoke execute on function public.move_list_items(uuid, uuid, uuid[], boolean)
  from anon, public;
grant  execute on function public.move_list_items(uuid, uuid, uuid[], boolean)
  to authenticated;

-- ----------------------------------------------------
-- POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
-- İmza değiştiği için cache yenilenmeden istemci eski 3 argümanlı çağrıyı
-- yapmaya çalışır ve 404 alır.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- 1) ESKİ İMZA GERÇEKTEN DÜŞTÜ MÜ?
--   --    Tek satır dönmeli ve pronargs = 4 olmalı.
--   select proname, pronargs
--     from pg_proc
--    where proname = 'move_list_items';
--
--   -- 2) HAZIRLIK: iki test listesi, kaynağa 3 mekan
--   insert into lists (user_id, title, is_ordered)
--   values (auth.uid(), 'Kopya kaynak', false),
--          (auth.uid(), 'Kopya hedef',  false);
--
--   insert into list_items (list_id, place_id)
--   select l.id, ur.place_id
--   from lists l, user_rankings ur
--   where l.title = 'Kopya kaynak' and l.user_id = auth.uid()
--     and ur.user_id = auth.uid()
--   limit 3;
--
--   -- Durum sorgusu (aşağıda birkaç kez kullanılacak):
--   select l.title, count(li.id) as adet
--   from lists l
--   left join list_items li on li.list_id = l.id
--   where l.title in ('Kopya kaynak','Kopya hedef') and l.user_id = auth.uid()
--   group by l.title order by l.title;
--   -- → kaynak 3, hedef 0
--
--   -- 3) KOPYALAMA (p_remove_from_source => false)
--   --    3 döndürmeli. Durum: kaynak 3 (DEĞİŞMEDİ), hedef 3.
--   select move_list_items(
--     (select id from lists where title = 'Kopya kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Kopya hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Kopya kaynak' and l.user_id = auth.uid()),
--     false
--   );
--   -- (Durum sorgusunu tekrar çalıştır: kaynak 3, hedef 3)
--
--   -- 4) AYNI KOPYALAMAYI TEKRARLA → hata YOK, 0 döndürmeli (hepsi çakıştı),
--   --    hedefte tek kopya kalmalı. Durum: kaynak 3, hedef 3.
--   select move_list_items(
--     (select id from lists where title = 'Kopya kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Kopya hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Kopya kaynak' and l.user_id = auth.uid()),
--     false
--   );
--
--   -- 5) VARSAYILAN HÂLÂ TAŞIMA MI? Parametre GÖNDERMEDEN çağır.
--   --    0 döndürmeli (hepsi hedefte zaten var) AMA kaynak boşalmalı.
--   --    Durum: kaynak 0, hedef 3.
--   select move_list_items(
--     (select id from lists where title = 'Kopya kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Kopya hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Kopya kaynak' and l.user_id = auth.uid())
--   );
--
--   -- 6) KENDİ ÜSTÜNE → HATA ("kaynak ve hedef liste aynı olamaz"),
--   --    kopyalama modunda da reddedilmeli.
--   select move_list_items(
--     (select id from lists where title = 'Kopya hedef' and user_id = auth.uid()),
--     (select id from lists where title = 'Kopya hedef' and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Kopya hedef' and l.user_id = auth.uid()),
--     false
--   );
--
--   -- 7) BOŞ DİZİ → HATA ("p_item_ids boş")
--   select move_list_items(
--     (select id from lists where title = 'Kopya hedef'  and user_id = auth.uid()),
--     (select id from lists where title = 'Kopya kaynak' and user_id = auth.uid()),
--     '{}'::uuid[],
--     false
--   );
--
--   -- 8) TEMİZLİK
--   delete from lists
--    where title in ('Kopya kaynak','Kopya hedef') and user_id = auth.uid();
--
-- NOT: "başkasının listesi" senaryosu SQL Editor'dan test EDİLEMEZ — orada
-- `auth.uid()` senin kullanıcın. 006 ve 007'deki aynı boşluk; uygulamada
-- ikinci bir hesapla denenebilir.
-- ====================================================
