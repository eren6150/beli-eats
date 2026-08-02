-- ====================================================
-- Migration 006 — reorder_list_items() RPC'si
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 005 çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- Bir listedeki mekanların sırasını değiştirmek N satırı birden günceller.
-- İstemciden yapılabilecek iki yol vardı, ikisi de kötü:
--
--   (a) N ayrı UPDATE  → atomik değil. Yarıda kalırsa liste yarı eski yarı yeni
--                        sırada kalır ve bunu fark eden kimse olmaz.
--   (b) Toplu upsert   → tek statement, atomik. AMA `upsert` bir
--                        `INSERT ... ON CONFLICT`: hatalı bir `id` hata vermek
--                        yerine YENİ SATIR YARATIR. Ayrıca `list_id`/`place_id`
--                        `not null` olduğu için istemci onları kendi bayat
--                        kopyasından geri göndermek zorunda kalırdı.
--
-- Bu fonksiyon üçüncü yol: istemci YALNIZCA sıralı id dizisini gönderiyor.
-- Sıra sunucuda hesaplanıyor, `place_id` hiç yola çıkmıyor, bilinmeyen id
-- sessizce satır yaratamıyor (`update` eşleşmezse hiçbir şey yapmaz — ve
-- aşağıdaki satır sayısı kontrolü bunu hataya çeviriyor).
--
-- Bu, `user_rankings.rank_index` dersinin doğrudan uygulaması:
-- SIRA İSTEMCİDE HESAPLANMAZ.
--
-- ── NEDEN `security definer` DEĞİL ────────────────────────────────────────────
-- migration 002'deki `upsert_place` security definer, çünkü `places` tablosunda
-- INSERT/UPDATE politikası HİÇ YOK — RLS'i bypass etmesi gerekiyordu.
-- Burada durum tersi: `list_items` üzerindeki UPDATE politikası zaten sahipliği
-- ebeveyn liste üzerinden doğruluyor. Fonksiyon çağıranın haklarıyla çalışırsa
-- o politika devreye girer ve BAŞKASININ listesini sıralamak 0 satır günceller —
-- aşağıdaki kontrol de bunu hataya çevirir.
-- RLS'i bypass etmek için hiçbir sebep yok; etmemek ek bir güvenlik katmanı.
--
-- `set search_path` yine de sabitleniyor: security definer olmasa da fonksiyon
-- gövdesinin hangi şemayı gördüğü belirsiz bırakılmamalı.

create or replace function public.reorder_list_items(
  p_list_id  uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_given    integer;
  v_distinct integer;
  v_expected integer;
  v_matched  integer;
begin
  -- ── Girdi doğrulama ───────────────────────────────────────────────────────

  if p_list_id is null then
    raise exception 'reorder_list_items: p_list_id boş olamaz';
  end if;

  v_given := coalesce(array_length(p_item_ids, 1), 0);

  if v_given = 0 then
    raise exception 'reorder_list_items: p_item_ids boş (liste: %)', p_list_id;
  end if;

  -- Mükerrer id gelirse sıra anlamsızlaşır: aynı satır iki farklı pozisyona
  -- yazılmaya çalışılır, sonuncusu kazanır ve bir öğe sırasız kalır.
  select count(distinct x) into v_distinct from unnest(p_item_ids) x;

  if v_distinct <> v_given then
    raise exception
      'reorder_list_items: p_item_ids mükerrer id içeriyor (% gönderildi, % benzersiz)',
      v_given, v_distinct;
  end if;

  -- Listenin GERÇEK öğe sayısı. SELECT politikası `using (true)` olduğu için bu
  -- sayım her listede çalışır — sahiplik kontrolü aşağıdaki UPDATE'te.
  select count(*) into v_expected from list_items where list_id = p_list_id;

  -- Eksik id gönderilirse gönderilmeyen öğeler eski pozisyonlarında kalır ve
  -- sıra bozulur. Kısmi sıralamayı sessizce kabul etmek yerine reddediyoruz.
  if v_given <> v_expected then
    raise exception
      'reorder_list_items: id sayısı listeyle uyuşmuyor — liste % öğe içeriyor, % id gönderildi',
      v_expected, v_given;
  end if;

  -- ── Sıralama ──────────────────────────────────────────────────────────────
  --
  -- Tek statement: ya hepsi ya hiçbiri. `with ordinality` dizideki sırayı
  -- 1'den başlayan bir sayaç olarak veriyor; `position` 0-tabanlı olduğu için
  -- 1 çıkarılıyor (trigger da 0'dan başlatıyor, tutarlı).
  --
  -- `li.list_id = p_list_id` koşulu ŞART: onsuz, başka bir listeye ait bir id
  -- gönderilirse o satır bu listenin sırasına göre güncellenirdi.

  update list_items li
     set position = t.ord - 1
    from unnest(p_item_ids) with ordinality as t(item_id, ord)
   where li.id = t.item_id
     and li.list_id = p_list_id;

  get diagnostics v_matched = row_count;

  -- ── Sonuç doğrulama ───────────────────────────────────────────────────────
  --
  -- Buraya iki şekilde düşülür:
  --   1. Gönderilen id'lerden biri bu listeye ait değil
  --   2. Liste ÇAĞIRANA AİT DEĞİL → RLS UPDATE politikası satırları eledi
  -- İkisi de sessizce yarım iş yapmak yerine hata vermeli. Exception işlemi
  -- geri alır, yani kısmen güncellenmiş bir sıra kalmaz.

  if v_matched <> v_expected then
    raise exception
      'reorder_list_items: % satır güncellenmeliydi, % güncellendi — id''ler bu listeye ait olmayabilir veya liste sana ait değil',
      v_expected, v_matched;
  end if;
end;
$$;

-- ----------------------------------------------------
-- YETKİLER
-- ----------------------------------------------------
-- anon (giriş yapmamış istemci) çağıramaz — migration 002'deki upsert_place
-- ile aynı desen.

revoke execute on function public.reorder_list_items(uuid, uuid[]) from anon, public;
grant  execute on function public.reorder_list_items(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------
-- POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
-- Yeni fonksiyon PostgREST'in `/rpc/reorder_list_items` uç noktası olarak
-- görünene kadar `supabase.rpc(...)` 404 döner.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- 0) HAZIRLIK: 3 mekanlı bir test listesi
--   insert into lists (user_id, title, is_ordered)
--   values (auth.uid(), 'Sıralama testi', true);
--
--   insert into list_items (list_id, place_id)
--   select l.id, ur.place_id
--   from lists l, user_rankings ur
--   where l.title = 'Sıralama testi' and l.user_id = auth.uid()
--     and ur.user_id = auth.uid()
--   limit 3;
--
--   -- Başlangıç sırası (0,1,2 olmalı):
--   select li.id, li.position, p.name
--   from list_items li
--   join lists l  on l.id = li.list_id
--   join places p on p.place_id = li.place_id
--   where l.title = 'Sıralama testi' and l.user_id = auth.uid()
--   order by li.position;
--
--   -- 1) TERSİNE ÇEVİR — sıra 2,1,0 olmalı (isimler ters sırada gelmeli)
--   select reorder_list_items(
--     (select id from lists where title = 'Sıralama testi' and user_id = auth.uid()),
--     (select array_agg(li.id order by li.position desc)
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Sıralama testi' and l.user_id = auth.uid())
--   );
--
--   select li.position, p.name
--   from list_items li
--   join lists l  on l.id = li.list_id
--   join places p on p.place_id = li.place_id
--   where l.title = 'Sıralama testi' and l.user_id = auth.uid()
--   order by li.position;
--
--   -- 2) EKSİK ID → HATA VERMELİ ("id sayısı listeyle uyuşmuyor")
--   select reorder_list_items(
--     (select id from lists where title = 'Sıralama testi' and user_id = auth.uid()),
--     (select array_agg(li.id)
--        from (select li.id from list_items li
--                join lists l on l.id = li.list_id
--               where l.title = 'Sıralama testi' and l.user_id = auth.uid()
--               limit 2) li)
--   );
--
--   -- 3) MÜKERRER ID → HATA VERMELİ ("mükerrer id içeriyor")
--   select reorder_list_items(
--     (select id from lists where title = 'Sıralama testi' and user_id = auth.uid()),
--     (select array[li.id, li.id, li.id]
--        from list_items li
--        join lists l on l.id = li.list_id
--       where l.title = 'Sıralama testi' and l.user_id = auth.uid()
--       limit 1)
--   );
--
--   -- 4) BOŞ DİZİ → HATA VERMELİ ("p_item_ids boş")
--   select reorder_list_items(
--     (select id from lists where title = 'Sıralama testi' and user_id = auth.uid()),
--     '{}'::uuid[]
--   );
--
--   -- 5) TEMİZLİK
--   delete from lists where title = 'Sıralama testi' and user_id = auth.uid();
--
-- NOT: "başkasının listesi" senaryosu SQL Editor'dan test EDİLEMEZ — orada
-- `auth.uid()` senin kullanıcın ve ikinci bir hesabın oturumu yok. O yol
-- RLS'in UPDATE politikasına ve yukarıdaki satır sayısı kontrolüne dayanıyor;
-- uygulamada ikinci bir hesapla denenebilir.
-- ====================================================
