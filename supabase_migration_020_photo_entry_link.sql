-- ====================================================
-- Migration 020 — fotoğrafları ziyarete (diary_entries) bağla
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- Bağımlılık: migration 013 (place_photos) ve 009 (diary_entries).
-- ====================================================
--
-- ── NEDEN ───────────────────────────────────────────────────────────────────
-- Ürün kararı (2026-08-11): fotoğraflar artık mekan sayfasından değil, bir
-- ZİYARET yazılırken ekleniyor. Mekanın fotoğraf sekmesinde görünmeye devam
-- ediyorlar ama dokununca ilgili ziyaret açılıyor (Hepsiburada deseni).
--
-- ── `entry_id` NULLABLE — ŞART ──────────────────────────────────────────────
-- Bugüne kadar yüklenmiş fotoğrafların hiçbirinin ziyareti yok. `not null`
-- yapmak mevcut satırları geçersiz kılardı. Nullable kalması aynı zamanda
-- okuma yolunu da belirliyor: `entry_id` varsa dokunma ziyarete gider, yoksa
-- bugünkü tam ekran görüntüleyici açılır. Eski fotoğraflar bozulmuyor.
--
-- ── `on delete cascade` — KULLANICI KARARI, ve bir bedeli var ───────────────
-- Ziyaret silinince ona bağlı fotoğraflar da gidiyor. Alternatif
-- (`set null` = fotoğraf kalsın, bağ kopsun) değerlendirildi ve REDDEDİLDİ:
-- kullanıcı ziyaretini sildiğinde o ziyarete ait fotoğrafların mekanda
-- kalmasını sürpriz buluyor.
--
-- ⚠️ CASCADE STORAGE'I TEMİZLEMEZ. Postgres yalnızca satırı siler; bucket'taki
-- iki nesne (`storage_path` + `thumb_path`) yerinde kalır. Bu, migration
-- 018'de zaten kayıtlı olan durumun aynısı. Temizlik İSTEMCİYE ait ve sırası
-- önemli:
--     1) girişin fotoğraf YOLLARINI oku   (silindikten sonra ulaşılamaz)
--     2) girişi sil                        (cascade satırları götürür)
--     3) Storage nesnelerini sil
-- Ters sıra — önce Storage — DB'de dosyasız satır bırakırdı; o da yeni
-- düzeltilen "eksik görselde sonsuz spinner" durumunu geri getirirdi.
-- 3. adım patlarsa öksüz dosya kalır: kabul edilmiş, DB tutarlılığı önce.
--
-- ── INSERT POLİTİKASI GENİŞLETİLİYOR — güvenlik boşluğu ─────────────────────
-- Mevcut politika yalnızca `auth.uid() = user_id` diyor. `entry_id` eklenip
-- politika olduğu gibi bırakılsaydı, kullanıcı kendi fotoğrafını BAŞKASININ
-- ziyaretine bağlayabilirdi — o kişinin ziyaret detayında ona ait olmayan bir
-- fotoğraf görünürdü. `with check` alt sorgu kabul ediyor; aynı teknik
-- migration 018'de "kendi fotoğrafını şikayet edememe" için kullanılmıştı.
--
-- ── ⚠️ PGRST201 KONTROLÜ YAPILDI (kural gereği) ─────────────────────────────
-- Bu migration `place_photos` ile `diary_entries` arasında yeni bir FK açıyor,
-- yani `places` ↔ `diary_entries` arasında İKİNCİ bir yol doğuyor
-- (doğrudan FK + `place_photos` üzerinden).
--
-- SONUÇ: `place_photos` ARA TABLO DEĞİL — birincil anahtarı kendi `id uuid`'si
-- (migration 013), iki FK'dan oluşan bileşik PK değil. `entry_likes` ve
-- `photo_reports` bileşik PK'lıydı, sahayı kıran da buydu. Yani tetiklenmesi
-- beklenmiyor.
--
-- AMA TAHMİNE DAYANILMADI: riskli iki sorgu (`useActivityFeed`, `useDiary` —
-- ikisi de `diary_entries`'ten `places(*)` gömüyor) AYNI DİFF'TE
-- `places!diary_entries_place_fk(*)` olarak ayrıştırıldı. Ayrıştırma tek yol
-- varken de geçerli, yani bedeli sıfır; karşılığında PostgREST ne karar
-- verirse versin sorgular ayakta.
--
-- 🔎 Tarama komutu (⚠️ `-A6` şart, `.from` ile `.select` ayrı satırlarda):
--     grep -rn -A6 "from('diary_entries')" src/ | grep "places("

-- ----------------------------------------------------
-- 1. Kolon + FK + indeks
-- ----------------------------------------------------
alter table place_photos
  add column if not exists entry_id uuid;

alter table place_photos drop constraint if exists place_photos_entry_fk;
alter table place_photos add constraint place_photos_entry_fk
  foreign key (entry_id) references diary_entries (id)
  on delete cascade;

-- Migration 003'ün dersi: Postgres FK'nın REFERANS EDEN tarafına indeks
-- açmıyor. Onsuz hem "bu ziyaretin fotoğrafları" sorgusu hem de ziyaret
-- silinirken cascade'in yaptığı arama tablo taraması yapar.
create index if not exists idx_place_photos_entry_id
  on place_photos (entry_id);

-- ----------------------------------------------------
-- 2. INSERT politikası — sahiplik artık girişi de kapsıyor
-- ----------------------------------------------------
-- `create policy` `or replace` desteklemiyor, o yüzden drop + create.
-- Burada drop güvenli: politika yalnızca INSERT'i etkiliyor ve migration
-- tek transaction'da çalışıyor.
drop policy if exists "Users can insert own place photos" on place_photos;

create policy "Users can insert own place photos"
  on place_photos for insert
  with check (
    auth.uid() = user_id
    and (
      entry_id is null
      or exists (
        select 1 from diary_entries d
        where d.id = entry_id
          and d.user_id = auth.uid()
      )
    )
  );

-- ----------------------------------------------------
-- 3. DOĞRULAMA — panelde çalıştır
-- ----------------------------------------------------
--
-- (a) Kolon, FK ve indeks yerinde mi?
--
-- select column_name, is_nullable, data_type
-- from information_schema.columns
-- where table_name = 'place_photos' and column_name = 'entry_id';
--   → entry_id | YES | uuid
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.place_photos'::regclass and conname = 'place_photos_entry_fk';
--   → FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
--
-- select indexname from pg_indexes
-- where tablename = 'place_photos' and indexname = 'idx_place_photos_entry_id';
--
-- (b) Politika gövdesi güncellendi mi?
--
-- select pg_get_expr(polwithcheck, polrelid)
-- from pg_policy
-- where polrelid = 'public.place_photos'::regclass and polcmd = 'a';
--   → içinde `diary_entries` alt sorgusu GÖRÜNMELİ.
--
-- (c) Cascade gerçekten çalışıyor mu? (geçici, rollback'li)
--     <ben> yerine kendi uuid'in. Fotoğrafı olan bir ziyaretin id'siyle:
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<ben>';
--   select count(*) from place_photos where entry_id = '<giris-id>';   -- önce
--   delete from diary_entries where id = '<giris-id>';
--   select count(*) from place_photos where entry_id = '<giris-id>';   -- 0 olmalı
-- rollback;   -- ⚠️ ROLLBACK: bu bir test
--
-- (d) "Başkasının ziyaretine fotoğraf bağlayamamalıyım" senaryosu SQL
--     Editor'dan güvenilir test EDİLEMEZ (orada kimlik hep biziz). Gerçek
--     kanıt ikinci bir hesapla uygulamadan denemek — ama bu yolun arayüzde
--     karşılığı yok (kullanıcı yalnızca kendi girişine ekliyor), yani
--     politika burada bir SAVUNMA katmanı; test listesinde değil.
