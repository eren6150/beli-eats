-- ====================================================
-- Migration 010 — log_diary_entry() + upsert_user_ranking() RPC'leri
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 009 çalışmış olmalı.
-- ====================================================
--
-- NEDEN RPC:
-- Puanlı bir günlük girişi TEK kullanıcı eylemi ama İKİ tabloya yazıyor:
-- `diary_entries` (yeni satır) + `user_rankings` (kanonik puan güncellenir,
-- sıra korunur). İki ayrı istemci çağrısında arada kopan bağlantı, günlükte
-- 4.5 yıldız görünürken sıralamada eski puanın kalmasına yol açar — kullanıcı
-- bunu fark etmez. `move_list_items`'ı doğuran argümanın aynısı.
--
-- İkinci ve daha önemli sebep: `rank_index` İSTEMCİDE HESAPLANMAZ.
-- Bu proje bu dersi iki kez öğrendi (rank_index veri kaybı, reorder_list_items).
--
-- ── İKİ FONKSİYON, ÇÜNKÜ ─────────────────────────────────────────────────────
-- `upsert_user_ranking` ayrı duruyor ki `rank_index` kuralının TEK SQL kaynağı
-- olsun. Bugün aynı kural bir de istemcide yaşıyor
-- (`useRankings.addOrUpdateRanking`) — bu BİLİNÇLİ ve GEÇİCİ bir ikilik:
-- doğrulanmış "Puanı Kaydet" akışını bu adımda ellemiyoruz. Sonraki küçük bir
-- diff `addOrUpdateRanking`'i de bu fonksiyona taşıyacak; o zaman kural tek
-- yerde kalır. CLAUDE.md'de açık iş olarak duruyor.
--
-- ── NEDEN `security definer` DEĞİL ───────────────────────────────────────────
-- migration 006/007/008 ile aynı gerekçe: `diary_entries` ve `user_rankings`
-- politikaları zaten `auth.uid() = user_id` istiyor. Çağıranın haklarıyla
-- çalışmak ek bir güvenlik katmanı.

-- ----------------------------------------------------
-- 1. upsert_user_ranking()
-- ----------------------------------------------------
--
-- Kural (istemcideki `addOrUpdateRanking` ile birebir aynı):
--   mevcut satır varsa → puan güncellenir, `rank_index` KORUNUR
--   yoksa              → sona eklenir (max + 1)
--
-- Denormalize kolonlar (`restaurant_name`, `photo_reference`, koordinatlar)
-- KANONİK KAYNAKTAN, yani `places`'ten dolduruluyor — istemcinin bayat
-- kopyasından değil. Bu kolonlar bir faz sonra düşürülecek ama bugün
-- `restaurant_name` hâlâ `not null`.
--
-- `updated_at` YAZILMIYOR: `user_rankings`'te `set_updated_at` trigger'ı var
-- (schema.sql). İstemcinin/RPC'nin saatine güvenmek gereksiz.

create or replace function public.upsert_user_ranking(
  p_place_id text,
  p_rating   numeric
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_place      places%rowtype;
  v_ranking_id uuid;
  v_next_index integer;
begin
  if v_user_id is null then
    raise exception 'upsert_user_ranking: oturum yok';
  end if;

  if p_rating is null then
    raise exception 'upsert_user_ranking: p_rating boş olamaz';
  end if;

  -- Aralık kontrolü tabloda da var; buradaki mesaj daha okunur ve hata
  -- INSERT'e kadar gitmeden dönüyor.
  if p_rating < 0.5 or p_rating > 5.0 then
    raise exception 'upsert_user_ranking: puan 0.5 ile 5.0 arasında olmalı (gelen: %)', p_rating;
  end if;

  -- ÖN KOŞUL: mekanın cache satırı olmalı. FK bunu zaten dayatıyor ama hata
  -- mesajı burada anlamlı: çağıran ekran `resolvePlace()` çağırmayı atlamış.
  select * into v_place from places where place_id = p_place_id;

  if not found then
    raise exception
      'upsert_user_ranking: places cache satırı yok (%) — önce resolvePlace çağrılmalı',
      p_place_id;
  end if;

  select id into v_ranking_id
    from user_rankings
   where user_id = v_user_id
     and place_id = p_place_id;

  if found then
    -- SIRA KORUNUYOR: `rank_index` HİÇ dokunulmuyor.
    update user_rankings
       set rating          = p_rating,
           restaurant_name = v_place.name,
           photo_reference = coalesce(v_place.photo_refs[1], photo_reference),
           latitude        = coalesce(v_place.latitude, latitude),
           longitude       = coalesce(v_place.longitude, longitude)
     where id = v_ranking_id;

    return v_ranking_id;
  end if;

  -- Yeni kayıt sona ekleniyor. Sayım VERİTABANINDAN, yerel state'ten değil —
  -- `rank_index`'in sessizce 0'a düştüğü hata tam olarak buydu.
  select coalesce(max(rank_index), -1) + 1
    into v_next_index
    from user_rankings
   where user_id = v_user_id;

  insert into user_rankings (
    user_id, place_id, restaurant_name, rating, rank_index,
    photo_reference, latitude, longitude
  )
  values (
    v_user_id, p_place_id, v_place.name, p_rating, v_next_index,
    v_place.photo_refs[1], v_place.latitude, v_place.longitude
  )
  returning id into v_ranking_id;

  return v_ranking_id;
end;
$$;

-- ----------------------------------------------------
-- 2. log_diary_entry()
-- ----------------------------------------------------
--
-- Tek transaction: günlük satırı + (puan verildiyse) sıralama güncellemesi.
-- Puan null ise `user_rankings`'e HİÇ dokunulmuyor — "puansız log yalnızca
-- günlükte görünür" kararının uygulanması burası.

create or replace function public.log_diary_entry(
  p_place_id   text,
  p_visited_at date    default current_date,
  p_rating     numeric default null,
  p_note       text    default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'log_diary_entry: oturum yok';
  end if;

  if p_place_id is null then
    raise exception 'log_diary_entry: p_place_id boş olamaz';
  end if;

  -- Gelecek tarih DB'de CHECK ile engellenemiyordu (migration 009'daki not:
  -- CHECK içinde `current_date` kullanılamaz). Kontrol buraya taşındı —
  -- fonksiyon gövdesinde non-immutable fonksiyon serbest.
  if p_visited_at > current_date then
    raise exception 'log_diary_entry: ziyaret tarihi gelecekte olamaz (%)', p_visited_at;
  end if;

  insert into diary_entries (user_id, place_id, visited_at, rating, note)
  values (
    v_user_id,
    p_place_id,
    coalesce(p_visited_at, current_date),
    p_rating,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_entry_id;

  -- PUANSIZ LOG SIRALAMAYA GİRMEZ.
  if p_rating is not null then
    perform public.upsert_user_ranking(p_place_id, p_rating);
  end if;

  return v_entry_id;
end;
$$;

-- ----------------------------------------------------
-- 3. YETKİLER
-- ----------------------------------------------------
-- anon (giriş yapmamış istemci) çağıramaz — 002/006/007/008 ile aynı desen.

revoke execute on function public.upsert_user_ranking(text, numeric) from anon, public;
grant  execute on function public.upsert_user_ranking(text, numeric) to authenticated;

revoke execute on function public.log_diary_entry(text, date, numeric, text) from anon, public;
grant  execute on function public.log_diary_entry(text, date, numeric, text) to authenticated;

-- ----------------------------------------------------
-- 4. POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- HAZIRLIK: elindeki bir place_id'yi not al
--   select place_id, name from places limit 5;
--
--   -- Sıralamanın BAŞLANGIÇ hali (rank_index'lerin korunduğunu görmek için)
--   select place_id, restaurant_name, rating, rank_index
--   from user_rankings where user_id = auth.uid() order by rank_index;
--
--   -- 1) PUANSIZ LOG → günlükte satır oluşmalı, user_rankings DEĞİŞMEMELİ
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() limit 1),
--     current_date - 5,
--     null,
--     'Puansız RPC testi'
--   );
--   -- (yukarıdaki user_rankings sorgusunu tekrar çalıştır: hiçbir şey değişmemeli)
--
--   -- 2) MEVCUT MEKANA PUANLI LOG → rating güncellenmeli, rank_index KORUNMALI
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() order by rank_index limit 1),
--     current_date,
--     2.5,
--     'Puanlı RPC testi — sıra korunmalı'
--   );
--   select place_id, rating, rank_index
--   from user_rankings where user_id = auth.uid() order by rank_index;
--   -- İlk satırın rating'i 2.5 olmalı, rank_index'i DEĞİŞMEMELİ (hâlâ en küçük).
--
--   -- 3) HİÇ PUANLANMAMIŞ bir mekana puanlı log → user_rankings'e YENİ satır,
--   --    rank_index = mevcut max + 1 olmalı.
--   --    (places'te olup user_rankings'te olmayan bir mekan seçiyor)
--   select log_diary_entry(
--     (select p.place_id from places p
--       where not exists (select 1 from user_rankings ur
--                          where ur.user_id = auth.uid() and ur.place_id = p.place_id)
--       limit 1),
--     current_date,
--     4.0,
--     'Yeni mekan RPC testi'
--   );
--   select place_id, restaurant_name, rating, rank_index
--   from user_rankings where user_id = auth.uid() order by rank_index;
--   -- Yeni satır EN SONDA olmalı ve restaurant_name places'ten dolmuş olmalı.
--
--   -- 4) GELECEK TARİH → HATA VERMELİ ("ziyaret tarihi gelecekte olamaz")
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() limit 1),
--     current_date + 1
--   );
--
--   -- 5) GEÇERSİZ PUAN → HATA VERMELİ ("puan 0.5 ile 5.0 arasında olmalı")
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() limit 1),
--     current_date,
--     9.0
--   );
--
--   -- 6) CACHE'TE OLMAYAN MEKAN → HATA VERMELİ (FK ihlali)
--   select log_diary_entry('BOYLE_BIR_PLACE_ID_YOK', current_date, 3.0);
--
--   -- 7) ATOMİKLİK: 5. adımdaki hata günlük satırı BIRAKMAMALI.
--   --    (insert önce çalışıyor, exception işlemi geri alıyor)
--   select count(*) as kalan_hatali_giris from diary_entries
--   where user_id = auth.uid() and rating = 9.0;
--   -- 0 dönmeli
--
--   -- 8) BOŞ NOT null'a çevriliyor mu?
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() limit 1),
--     current_date, null, '   '
--   );
--   select note from diary_entries where user_id = auth.uid()
--   order by created_at desc limit 1;
--   -- null dönmeli, boşluklu string değil
--
--   -- 9) TEMİZLİK — test girişlerini sil.
--   --    DİKKAT: 2 ve 3 user_rankings'i GERÇEKTEN değiştirdi; puanları elle
--   --    eski haline getirmek istersen yukarıdaki "BAŞLANGIÇ hali" çıktısını
--   --    kullan. 3. adım yeni bir sıralama satırı da yarattı.
--   delete from diary_entries where user_id = auth.uid()
--     and (note like '%RPC testi%' or note is null);
--
-- NOT: 9. adımdaki `note is null` filtresi 8. adımın satırını da siliyor.
-- Gerçek verin varsa bu filtreyi daraltmayı unutma.
-- ====================================================
