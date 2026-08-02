-- ====================================================
-- Migration 007 — move_list_items() RPC'si
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 005 ve 006 çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- "Seçili mekanları başka listeye taşı" iki yazma demek: hedefe INSERT,
-- kaynaktan DELETE. İstemciden iki ayrı çağrıyla yapılırsa arada kopan bir
-- bağlantı mekanları İKİ LİSTEDE BİRDEN veya HİÇBİRİNDE bırakır. İkisi de
-- sessiz veri hatası; kullanıcı farkı ancak çok sonra görür.
--
-- Fonksiyon tek transaction: ya hepsi taşınır ya hiçbiri.
--
-- ── HEDEFTE ZATEN VAR OLAN MEKANLAR ──────────────────────────────────────────
-- `list_items_unique_place` (list_id, place_id) kısıtı yüzünden hedefte aynı
-- mekan varsa INSERT patlar. Doğru davranış taşımayı iptal etmek DEĞİL:
-- kullanıcının istediği "bu mekanlar şu listede olsun" ve zaten oradaysa istek
-- karşılanmış demektir. `on conflict do nothing` ile atlanıyor, kaynaktan yine
-- de siliniyor.
--
-- DİKKAT — bu, migration 006'da REDDEDİLEN "toplu upsert" ile aynı şey DEĞİL.
-- Orada sorun `on conflict`'in kendisi değil, hatalı bir id'nin hata vermek
-- yerine YENİ SATIR YARATMASIydı. Burada `insert ... select` kaynağı gerçek
-- satırlardan okuyor; uydurma bir id yeni satır üretemez ve aşağıdaki sayım
-- bunu zaten yakalıyor.
--
-- ── NEDEN `security definer` DEĞİL ───────────────────────────────────────────
-- migration 006 ile aynı gerekçe: `list_items`'ın INSERT ve DELETE politikaları
-- sahipliği ebeveyn liste üzerinden zaten doğruluyor. Çağıranın haklarıyla
-- çalışmak ek bir güvenlik katmanı — başkasının listesine taşımak 0 satır
-- yazar, satır sayısı kontrolü onu hataya çevirir.
--
-- HEDEF listenin sahipliği AYRICA kontrol edilmiyor, gerek yok: INSERT
-- politikası hedef liste `auth.uid()`'e ait değilse satırı reddeder ve hata
-- işlemi geri alır. Fazladan bir `exists` sorgusu aynı işi ikinci kez yapardı.
--
-- `set search_path` yine sabitleniyor: security definer olmasa da fonksiyon
-- gövdesinin hangi şemayı gördüğü belirsiz bırakılmamalı.

create or replace function public.move_list_items(
  p_source_list_id uuid,
  p_target_list_id uuid,
  p_item_ids       uuid[]
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_given    integer;
  v_distinct integer;
  v_matched  integer;
  v_deleted  integer;
begin
  -- ── Girdi doğrulama ───────────────────────────────────────────────────────

  if p_source_list_id is null or p_target_list_id is null then
    raise exception 'move_list_items: liste id''leri boş olamaz';
  end if;

  -- Kendi üstüne taşımak `unique` kısıtı yüzünden HER ŞEYİ atlar, sonra
  -- kaynaktan siler — yani sessizce toplu silmeye dönüşürdü.
  if p_source_list_id = p_target_list_id then
    raise exception 'move_list_items: kaynak ve hedef liste aynı olamaz';
  end if;

  v_given := coalesce(array_length(p_item_ids, 1), 0);

  if v_given = 0 then
    raise exception 'move_list_items: p_item_ids boş';
  end if;

  -- Mükerrer id: aynı satır iki kez taşınmaya çalışılır, sayım tutmaz ve
  -- hata mesajı kafa karıştırıcı olurdu. Baştan reddediyoruz.
  select count(distinct x) into v_distinct from unnest(p_item_ids) x;

  if v_distinct <> v_given then
    raise exception
      'move_list_items: p_item_ids mükerrer id içeriyor (% gönderildi, % benzersiz)',
      v_given, v_distinct;
  end if;

  -- Gönderilen id'lerin hepsi GERÇEKTEN kaynak listede mi? Değilse sessizce
  -- eksik taşıma yapmak yerine reddediyoruz. (SELECT politikası `using (true)`
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

  -- ── 1. Hedefe ekle ────────────────────────────────────────────────────────
  --
  -- `position` GÖNDERİLMİYOR: `set_list_item_position` trigger'ı (migration 005)
  -- hedef listenin sonuna ekliyor. Sıra ne istemcide ne burada elle
  -- hesaplanıyor — `rank_index` dersi.

  insert into list_items (list_id, place_id)
  select p_target_list_id, li.place_id
    from list_items li
   where li.list_id = p_source_list_id
     and li.id = any(p_item_ids)
  on conflict on constraint list_items_unique_place do nothing;

  -- ── 2. Kaynaktan sil ──────────────────────────────────────────────────────

  delete from list_items
   where list_id = p_source_list_id
     and id = any(p_item_ids);

  get diagnostics v_deleted = row_count;

  -- ── Sonuç doğrulama ───────────────────────────────────────────────────────
  --
  -- Buraya iki şekilde düşülür:
  --   1. Kaynak liste ÇAĞIRANA AİT DEĞİL → RLS DELETE politikası satırları eledi
  --   2. Araya giren başka bir işlem satırları sildi
  -- Exception işlemi geri alır: hedefe eklenenler de geri alınır, yani mekanlar
  -- iki listede birden kalmaz.

  if v_deleted <> v_given then
    raise exception
      'move_list_items: % satır silinmeliydi, % silindi — liste sana ait olmayabilir',
      v_given, v_deleted;
  end if;

  return v_deleted;
end;
$$;

-- ----------------------------------------------------
-- YETKİLER
-- ----------------------------------------------------
-- anon (giriş yapmamış istemci) çağıramaz — migration 002 ve 006 ile aynı desen.

revoke execute on function public.move_list_items(uuid, uuid, uuid[]) from anon, public;
grant  execute on function public.move_list_items(uuid, uuid, uuid[]) to authenticated;

-- ----------------------------------------------------
-- POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
-- Yeni fonksiyon PostgREST'in `/rpc/move_list_items` uç noktası olarak görünene
-- kadar `supabase.rpc(...)` 404 döner.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- 0) HAZIRLIK: iki test listesi, kaynağa 3 mekan
--   insert into lists (user_id, title, is_ordered)
--   values (auth.uid(), 'Taşıma kaynak', false),
--          (auth.uid(), 'Taşıma hedef',  false);
--
--   insert into list_items (list_id, place_id)
--   select l.id, ur.place_id
--   from lists l, user_rankings ur
--   where l.title = 'Taşıma kaynak' and l.user_id = auth.uid()
--     and ur.user_id = auth.uid()
--   limit 3;
--
--   -- Durum (kaynak 3, hedef 0 olmalı):
--   select l.title, count(li.id) as adet
--   from lists l
--   left join list_items li on li.list_id = l.id
--   where l.title in ('Taşıma kaynak','Taşıma hedef') and l.user_id = auth.uid()
--   group by l.title order by l.title;
--
--   -- 1) MUTLU YOL: ilk 2 mekanı taşı → 2 döndürmeli, kaynak 1 / hedef 2 olmalı
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from (select li.id from list_items li
--                join lists l on l.id = li.list_id
--               where l.title = 'Taşıma kaynak' and l.user_id = auth.uid()
--               order by li.position limit 2) li)
--   );
--
--   -- (yukarıdaki "Durum" sorgusunu tekrar çalıştır: kaynak 1, hedef 2)
--
--   -- 2) HEDEFTE ZATEN VAR: hedefteki bir mekanı kaynağa geri ekle, sonra taşı.
--   --    Çakışan satır atlanmalı AMA kaynaktan yine de silinmeli.
--   --    Sonuç: kaynak 1 (geri eklenen gitti), hedef 2 (değişmedi).
--   insert into list_items (list_id, place_id)
--   select (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--          li.place_id
--     from list_items li
--     join lists l on l.id = li.list_id
--    where l.title = 'Taşıma hedef' and l.user_id = auth.uid()
--    limit 1;
--
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Taşıma kaynak' and l.user_id = auth.uid()
--         and li.place_id in (select li2.place_id
--                               from list_items li2
--                               join lists l2 on l2.id = li2.list_id
--                              where l2.title = 'Taşıma hedef'
--                                and l2.user_id = auth.uid()))
--   );
--
--   -- 3) KENDİ ÜSTÜNE TAŞIMA → HATA ("kaynak ve hedef liste aynı olamaz")
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Taşıma kaynak' and l.user_id = auth.uid())
--   );
--
--   -- 4) BAŞKA LİSTENİN ID'Sİ → HATA ("id'ler bu listeye ait olmayabilir")
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma hedef'  and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Taşıma hedef' and l.user_id = auth.uid())
--   );
--
--   -- 5) MÜKERRER ID → HATA ("mükerrer id içeriyor")
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma hedef'  and user_id = auth.uid()),
--     (select array[li.id, li.id]
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Taşıma kaynak' and l.user_id = auth.uid()
--       limit 1)
--   );
--
--   -- 6) BOŞ DİZİ → HATA ("p_item_ids boş")
--   select move_list_items(
--     (select id from lists where title = 'Taşıma kaynak' and user_id = auth.uid()),
--     (select id from lists where title = 'Taşıma hedef'  and user_id = auth.uid()),
--     '{}'::uuid[]
--   );
--
--   -- 7) TEMİZLİK
--   delete from lists
--    where title in ('Taşıma kaynak','Taşıma hedef') and user_id = auth.uid();
--
-- NOT: "başkasının listesi" senaryosu SQL Editor'dan test EDİLEMEZ — orada
-- `auth.uid()` senin kullanıcın ve ikinci bir hesabın oturumu yok. O yol RLS'in
-- INSERT/DELETE politikalarına ve yukarıdaki satır sayısı kontrolüne dayanıyor;
-- uygulamada ikinci bir hesapla denenebilir (migration 006'daki aynı boşluk).
-- ====================================================
