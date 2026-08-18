-- ====================================================
-- Migration 021 — metin uzunluğu tavanları (review_text + username)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- Bağımlılık: schema.sql (`user_rankings`, `profiles`). Migration 012'yi
--             OKUMADAN username tavanını değiştirme — gerekçe aşağıda.
-- ====================================================
--
-- ── ÇÖZÜLEN TUTARSIZLIK ─────────────────────────────────────────────────────
-- Projedeki serbest metinlerin hepsinin şemada uzunluk sınırı vardı:
--     diary_entries.note   1000   (009)
--     profiles.bio          300   (004)
--     profiles.full_name    100   (004)
--     lists.title         1-100   (005)
--     lists.description     500   (005)
-- İki tanesinin YOKTU ve ikisi de bu migration'la kapanıyor:
--     user_rankings.review_text   `text`                 → ≤ 1000
--     profiles.username           `text unique not null` → ≤ 100
--
-- İstemcide savunma zaten vardı (`REVIEW_MAX = 1000`, kullanıcı adı için
-- 3-30) ama istemci savunması GERÇEK TAVAN DEĞİL: anon key bundle'da, yani
-- API'ye doğrudan istek atan biri sınırı hiç görmüyor.
--
-- ── ⚠️ USERNAME NEDEN 100, İSTEMCİDEKİ GİBİ 30 DEĞİL ────────────────────────
-- Bu, migration'ın en önemli kararı ve sadeleştirilmemeli.
--
-- `handle_new_user` (migration 012) kullanıcı adını şöyle üretiyor:
--     v_base := coalesce(metadata.username, split_part(email, '@', 1))
-- ve `next_available_username` buna sonek ekliyor (`eren2`…`eren10000`), son
-- çare olarak `_` + uuid'nin 8 hanesi.
--
-- `length between 3 and 30` koysaydık üretimin şu yolları kısıtı İHLAL ederdi:
--     · e-posta öneki 35 karakter        → 35 > 30
--     · `ab@gmail.com` → taban `ab`      →  2 <  3
--     · taban 25 + son çare `_xxxxxxxx`  → 34 > 30
-- Trigger `security definer` ve kayıt yolunun ortasında: ihlal ettiği anda
-- exception atıyor, `auth.users` insert'i geri alınıyor ve kullanıcı
-- **"Database error saving new user"** görüp HİÇ KAYDOLAMIYOR.
--
-- Yani naif bir 30 kısıtı, migration 012'nin düzeltmek için yazıldığı hatanın
-- ta kendisini geri getirirdi. O dosyanın kendi ifadesiyle: "bu fonksiyondan
-- çıkan hiçbir yol kullanıcıyı 'kaydolamadın' ekranında bırakmamalı."
--
-- 100 ise meşru üretim yollarının hiçbiri tarafından erişilemiyor:
-- e-posta önekinin RFC tavanı 64, son çare +9 → en kötü 73 < 100.
-- Üreteç fonksiyonuna DOKUNMADAN güvenli olan tavan bu.
--
-- İki sayı iki farklı iş yapıyor ve karıştırılmamalı:
--     istemcideki 3-30 → KULLANICININ SEÇTİĞİ ad için ürün kuralı
--     şemadaki   ≤100  → SİSTEMİN ÜRETTİĞİ adı da kapsayan kötüye kullanım tavanı
--
-- 30'a sıkmak ayrı bir iş (migration 022): önce `next_available_username`
-- tabanı `left(v_base, 21)` ile kırpmalı ve kısa tabanı doldurmalı, SONRA
-- kısıt daraltılabilir. Sıra bu; tersi kayıt akışını kırar.
--
-- ── ALT SINIR YOK — bilinçli ────────────────────────────────────────────────
-- `>= 3` koymuyoruz: `ab@gmail.com` gibi iki karakterlik bir @ öncesi tamamen
-- meşru ve bugün de üretilebiliyor. Ölçüm de bunu destekliyor: mevcut en kısa
-- ad 3 karakter, yani kimse bugün ihlal etmiyor — ama gelecekteki bir kaydı
-- kilitlemenin karşılığı yok. Minimum, kullanıcının SEÇTİĞİ ad için istemcide
-- zaten zorlanıyor.
--
-- ── KARAKTER KÜMESİ / BÜYÜK-KÜÇÜK HARF KISITI DA YOK ────────────────────────
-- Mevcut adların bir kısmı e-postanın @ öncesinden türedi ve nokta/tire/büyük
-- harf taşıyabilir. Kısıtlamak veri göçü demek — ayrı bir ürün kararı.
--
-- ── ÖN KONTROL YAPILDI (2026-08-17) ─────────────────────────────────────────
-- Kısıt eklemeden önce mevcut veri tarandı; ihlal eden satır YOKTU:
--     review_ihlal=0   review_en_uzun=934
--     username_ihlal=0 username_en_uzun=23   username_en_kisa=3
-- Bu yüzden `not valid` KULLANILMADI — kısıtlar mevcut satırları da denetliyor.
-- ⚠️ Benzer bir kısıt eklemeden önce aynı taramayı yap; ihlal varsa migration
-- patlar ve `begin/commit` sayesinde yarım kısıt bırakmadan geri alınır.
--
-- NOT: `review_en_uzun=934` tavana yakın, yani 1000 teorik bir sayı değil —
-- kullanıcı fiilen o sınıra doğru yazıyor. Tavanın yükseltilmesi istenirse
-- İKİ yerde birden değişmeli: buradaki kısıt ve `REVIEW_MAX`
-- (src/screens/RestaurantDetailScreen.tsx).

begin;

-- ----------------------------------------------------
-- 1. user_rankings.review_text ≤ 1000
-- ----------------------------------------------------
-- İstemcideki `REVIEW_MAX` ile BİREBİR aynı: bu alanda üreteç yok, yani
-- şema ile istemcinin ayrışması için bir sebep de yok.

alter table user_rankings drop constraint if exists user_rankings_review_text_length;
alter table user_rankings add constraint user_rankings_review_text_length
  check (review_text is null or length(review_text) <= 1000);

-- ----------------------------------------------------
-- 2. profiles.username ≤ 100
-- ----------------------------------------------------
-- Gerekçe yukarıda. Bu sayıyı düşürmeden ÖNCE migration 012'nin üreteç
-- fonksiyonunu düzelt.

alter table profiles drop constraint if exists profiles_username_length;
alter table profiles add constraint profiles_username_length
  check (length(username) <= 100);

commit;

-- ----------------------------------------------------
-- 3. Doğrulama
-- ----------------------------------------------------
-- İki satır dönmeli:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname in ('user_rankings_review_text_length',
--                     'profiles_username_length');
--
-- Kısıtın gerçekten ısırdığını görmek için (hata vermeli, yani yazmaz):
--
--   update profiles set username = repeat('a', 101) where id = auth.uid();
--   -- ERROR: violates check constraint "profiles_username_length"
