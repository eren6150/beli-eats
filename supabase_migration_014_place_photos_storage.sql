-- ====================================================
-- Migration 014 — place-photos bucket politikaları (Storage)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE bucket panelden oluşturulmuş olmalı (aşağıdaki ayarlarla).
-- ====================================================
--
-- Bu dosya YALNIZCA `storage.objects` politikalarını kuruyor. Bucket'ın
-- kendisi panelden oluşturuluyor çünkü boyut/MIME limitleri orada tek formda
-- ve görsel olarak doğrulanabiliyor. Ayarlar burada kayıtlı ki kurulum
-- yeniden yapılması gerekirse tek kaynak olsun:
--
--   Bucket adı        : place-photos
--   Public            : AÇIK
--   File size limit   : 2 MB
--   Allowed MIME types: image/jpeg
--
-- ── NEDEN PUBLIC BUCKET ──────────────────────────────────────────────────────
-- Özel bucket imzalı URL gerektirir: her render'da URL üretmek hem ek kod hem
-- gecikme, üstelik URL'ler süreli olduğu için önbellekleme bozulur ve
-- EGRESS ARTAR — ki bu projede ücretsiz katmanın asıl darboğazı egress.
-- Fotoğraflar zaten herkese açık içerik (`place_photos` SELECT `using (true)`).
--
-- ── ⚠️ BOYUT LİMİTİ NEDEN BURADA, İSTEMCİDE DEĞİL ────────────────────────────
-- İstemci tarafı sıkıştırma (1280px / kalite 0.7) bir MALİYET ve UX
-- optimizasyonudur, GÜVENLİK KONTROLÜ DEĞİLDİR: anon anahtar JS bundle'ında,
-- yani istemci değiştirilebilir. Gerçek tavan bucket ayarındaki 2 MB.
--
-- ── YOL DÜZENİ ───────────────────────────────────────────────────────────────
--   {place_id}/{user_id}/{uuid}.jpg          → tam boy (uzun kenar 1280)
--   {place_id}/{user_id}/{uuid}_thumb.jpg    → küçük  (uzun kenar 400)
--
-- `user_id`'nin YOLDA olması bilinçli: politikalar sahipliği yol parçasından
-- doğruluyor, ayrı bir tablo okumasına gerek kalmıyor.
-- `storage.foldername('abc/def/x.jpg')` → {abc,def} (Postgres dizileri
-- 1'den başlar), yani [1] = place_id, [2] = user_id.

-- ----------------------------------------------------
-- 1. OKUMA
-- ----------------------------------------------------
-- Bucket public olduğu için doğrudan URL zaten RLS'e uğramadan servis
-- ediliyor; bu politika API üzerinden LİSTELEME yapıldığında devreye giriyor.
-- `place_photos` tablosunun SELECT politikasıyla aynı hizada: herkese açık.

drop policy if exists "place-photos herkese açık okunur" on storage.objects;
create policy "place-photos herkese açık okunur"
  on storage.objects for select
  using (bucket_id = 'place-photos');

-- ----------------------------------------------------
-- 2. YAZMA — yalnızca kendi klasörüne
-- ----------------------------------------------------
-- `auth.uid()` anon kullanıcıda NULL; `null::text = ...` null döner, yani
-- "true değil" → reddedilir. Ayrıca `to authenticated` ile niyet açıkça
-- yazılıyor.

drop policy if exists "Kullanıcı kendi klasörüne yükler" on storage.objects;
create policy "Kullanıcı kendi klasörüne yükler"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'place-photos'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- ----------------------------------------------------
-- 3. SİLME — yalnızca kendi klasöründen
-- ----------------------------------------------------
-- `place_photos` tablosundaki DELETE politikasının Storage karşılığı. İkisi
-- ayrı ayrı gerekiyor: satırı silmek nesneyi silmiyor, nesneyi silmek satırı.

drop policy if exists "Kullanıcı kendi klasöründen siler" on storage.objects;
create policy "Kullanıcı kendi klasöründen siler"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'place-photos'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- UPDATE politikası BİLİNÇLİ OLARAK YOK: her yükleme benzersiz bir uuid ile
-- yeni nesne yaratıyor, üzerine yazma senaryosu yok. "Bugün kullanılanı inşa
-- et" — gerekirse yukarıdakinin aynısı `for update` olarak eklenir.

-- ====================================================
-- 4. DOĞRULAMA
-- ====================================================
--
-- 1) Bucket ayarları panelde girildiği gibi mi:
--      select id, public, file_size_limit, allowed_mime_types
--      from storage.buckets where id = 'place-photos';
--    → public = true · file_size_limit = 2097152 · {image/jpeg}
--    ⚠️ file_size_limit BAYT cinsinden. 2 MB = 2097152. Panel "2" yazıp
--       birim seçtirdiyse burada doğrulanmış olur.
--
-- 2) Üç politika yerinde mi:
--      select policyname, cmd, roles from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname like '%place-photos%' or policyname like 'Kullanıcı%'
--      order by cmd;
--    → SELECT · INSERT · DELETE (üç satır)
--
-- 3) ⚠️ ASIL TEST — SQL'DEN YAPILAMAZ, UYGULAMADAN YAPILACAK.
--    `auth.uid()` SQL Editor'da NULL olduğu için yol-sahiplik kontrolü
--    burada anlamlı çalışmıyor (bu projede birden çok kez düşülen not).
--    Adım 3'te yükleme akışı yazılınca Expo Go'da şunlar denenecek:
--      a) kendi klasörüne yükleme  → başarılı olmalı
--      b) başka bir user_id klasörüne yükleme → "new row violates
--         row-level security policy" ile REDDEDİLMELİ
--      c) 2 MB üstü dosya → bucket limiti reddetmeli
--      d) image/jpeg olmayan dosya → MIME kısıtı reddetmeli
--    (b) testi elle yol uydurarak yapılacak; geçerse politika iş görüyor.
