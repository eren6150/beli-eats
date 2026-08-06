-- ====================================================
-- Migration 013 — place_photos (Faz 2, ÜÇÜNCÜ ve son ayak)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 002 (places) çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- Referans listesindeki Beli'nin en beğenilen özelliği kullanıcı çekimi
-- MENÜ fotoğrafları. Mekan sayfasında tür bazlı sekmeler (Menü / Yemek /
-- Mekan / Diğer) bunun üzerine kuruluyor.
--
-- Bu tablo yalnızca ÜSTVERİ tutuyor; baytlar Supabase Storage'ın
-- `place-photos` bucket'ında. Bucket ve politikaları bu migration'ın DEĞİL,
-- bir sonraki adımın işi (panel + storage.objects politikaları).
--
-- ── HER FOTOĞRAF İKİ NESNE ───────────────────────────────────────────────────
-- `storage_path` (uzun kenar 1280) + `thumb_path` (uzun kenar 400).
-- Bu bir optimizasyon DEĞİL, ücretsiz katmana sığmanın koşulu. Hesap:
-- listelerde tam boy servis edilirse aylık egress ~11 GB (sınır 5 GB);
-- küçük kopyayla ~1,6 GB. Supabase'in sunucu tarafı görsel dönüştürmesi
-- ("Storage Image Transformations") Free planda YOK — panelde doğrulandı,
-- yani iki kopya İSTEMCİDE üretilip ikisi de yükleniyor.

-- ----------------------------------------------------
-- 1. TABLO
-- ----------------------------------------------------
--
-- `user_id` → `profiles(id)`, `auth.users` DEĞİL: şemadaki diğer tabloların
-- (user_rankings, follows, lists, diary_entries) hepsi profiles'a bağlı.

create table if not exists place_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,

  place_id     text not null,

  -- Değerler İNGİLİZCE, arayüz Türkçe. Şemanın geri kalanı da İngilizce
  -- (`restaurant_name`, `visited_at`, `is_ordered`); Türkçe etiket eşlemesi
  -- arayüzde duruyor (`SearchScreen`'in CUISINE_TR haritasıyla aynı desen).
  kind         text not null,

  -- İKİ AYRI KOLON, biri diğerinden TÜRETİLMİYOR.
  -- `thumb_path`'i `storage_path`'ten sonek kuralıyla üretmek cazipti ama
  -- bir adlandırma sözleşmesini koda gömmek demekti: sözleşme değişirse eski
  -- satırlar sessizce kırılırdı. Bunlar iki ayrı nesne; her satır kendi iki
  -- nesnesinin nerede olduğunu kendisi kaydediyor.
  storage_path text not null,
  thumb_path   text not null,

  caption      text,

  created_at   timestamptz not null default now()
);

-- `updated_at` YOK (`list_items` emsali): v1'de değiştirilebilir alan yok.
-- Açıklama düzenleme gelirse o zaman kolon + trigger birlikte eklenir.
--
-- `bytes` KOLONU DA YOK — bilinçli. Boyut zaten
-- `storage.objects.metadata->>'size'` içinde duruyor; ikinci bir kopya
-- tutmak bu projede tekrar tekrar pişmanlık üretmiş denormalizasyonun
-- aynısı olurdu. Kullanım raporu doğrudan oradan okuyor (bkz. bölüm 5).
--
-- `diary_entry_id` YOK — GİZLİLİK GEREKÇESİ, kapsam değil.
-- "Bu ziyaretin fotoğrafları" cazip bir bağ ama `diary_entries`'in SELECT
-- politikası SAHİPLİK istiyor (bilinçli sapma, migration 009), bu tablo ise
-- herkese açık olacak. Herkese açık bir satırın gizli bir satıra işaret
-- etmesi, o günlük girişinin VARLIĞINI sızdırır. Fotoğraf mekana bağlanıyor,
-- ziyarete değil.

-- ----------------------------------------------------
-- 2. KISITLAR
-- ----------------------------------------------------
-- Ayrı ALTER'larda ve açık isimli: `create table if not exists` tabloyu
-- bulursa inline tanımları UYGULAMAZ (migration 002/005/009 ile aynı gerekçe).

-- Sekmelerin sözleşmesi. Yeni bir tür eklemek bu kısıtı güncellemeyi
-- gerektiriyor — bilinçli: sessizce yeni tür yazılıp hiçbir sekmede
-- görünmemesi, hata vermesinden kötü.
alter table place_photos drop constraint if exists place_photos_kind_valid;
alter table place_photos add constraint place_photos_kind_valid
  check (kind in ('menu', 'food', 'venue', 'other'));

-- `profiles.bio`'nun 300'üyle aynı ölçek.
alter table place_photos drop constraint if exists place_photos_caption_length;
alter table place_photos add constraint place_photos_caption_length
  check (caption is null or length(caption) <= 300);

-- Yolların boş string olmaması: `not null` boş string'i engellemiyor ve
-- boş yol, dosyası olmayan bir satır demek.
alter table place_photos drop constraint if exists place_photos_paths_nonempty;
alter table place_photos add constraint place_photos_paths_nonempty
  check (length(btrim(storage_path)) > 0 and length(btrim(thumb_path)) > 0);

-- Migration 003/005/009'daki FK ile AYNI davranış:
--   on update cascade  → Google place_id değişirse tek UPDATE her yere yayılır
--   on delete restrict → cache satırını silmek fotoğrafları sessizce koparmasın
-- Yani fotoğraf yazmadan ÖNCE mekanın `places` satırı OLMAK ZORUNDA
-- (uygulama tarafında: `ensurePlaceCached()`, AddToListSheet'teki desen).
alter table place_photos drop constraint if exists place_photos_place_fk;
alter table place_photos add constraint place_photos_place_fk
  foreign key (place_id) references places (place_id)
  on update cascade
  on delete restrict;

-- ----------------------------------------------------
-- 3. İNDEKSLER
-- ----------------------------------------------------

-- Mekan sayfasının TEK sorgusu: bu mekanın şu türdeki fotoğrafları, en yeni
-- üstte. Sekme değiştirmek `kind`'ı değiştiriyor, `place_id` sabit kalıyor —
-- bileşik indeks ikisini de karşılıyor.
create index if not exists idx_place_photos_place_kind
  on place_photos (place_id, kind, created_at desc);

-- MİGRATION 003'ÜN DERSİ: Postgres FK'nın referans EDEN tarafına otomatik
-- indeks açmaz. Yukarıdaki bileşik indeksin ÖNDEKİ kolonu `place_id` olduğu
-- için `on delete restrict` kontrolü ve `places(*)` gömülü sorgusu onu
-- kullanabiliyor — bu yüzden AYRI bir `(place_id)` indeksi AÇILMIYOR.

-- (user_id) indeksi BİLİNÇLİ OLARAK YOK: onu isteyen tek şey "profilimdeki
-- fotoğraflarım" ekranı ve o v1'de yapılmıyor. Kullanılmayan indeks her
-- yazmada güncellenen ölü yüktür (migration 009'daki aynı karar).

-- ----------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------
--
-- ⚠️ DİKKAT — BU TABLO `diary_entries`'İN TERSİ.
--
-- diary_entries'te SELECT de sahiplik istiyordu, çünkü `note` bugüne kadarki
-- en kişisel veriydi. Burada tam tersi geçerli: bir menü fotoğrafının VARLIK
-- SEBEBİ paylaşılmak. Gizli bir menü fotoğrafı anlamsız olurdu.
--
-- Yani SELECT `using (true)` — profiles / places / lists / user_rankings ile
-- aynı hizada. Yazma yolları sahiplik istiyor.
--
-- ⚠️ SONUCU KABUL EDİLMİŞ BİR TAKAS: fotoğraflar herkese açık ve KALICI;
-- kullanıcı yalnızca kendi yüklediğini silebiliyor. Uygunsuz içerik için
-- şikayet/moderasyon mekanizması YOK. Arkadaş testi ölçeğinde sorun değil,
-- GENEL YAYIN ÖNCESİ ele alınmalı — CLAUDE.md → "Genel yayın öncesi
-- düşünülecekler" bölümünde kayıtlı.

alter table place_photos enable row level security;

drop policy if exists "Place photos are viewable by everyone" on place_photos;
create policy "Place photos are viewable by everyone"
  on place_photos for select using (true);

drop policy if exists "Users can insert own place photos" on place_photos;
create policy "Users can insert own place photos"
  on place_photos for insert with check (auth.uid() = user_id);

-- `using` HANGİ satırın güncellenebileceğini, `with check` satırın YENİ
-- halini denetliyor. İkisi birlikte olmazsa kullanıcı kendi fotoğrafının
-- `user_id`'sini başkasına devredebilirdi (migration 005'in dersi).
drop policy if exists "Users can update own place photos" on place_photos;
create policy "Users can update own place photos"
  on place_photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own place photos" on place_photos;
create policy "Users can delete own place photos"
  on place_photos for delete using (auth.uid() = user_id);

-- ====================================================
-- 5. DOĞRULAMA — sırayla çalıştır
-- ====================================================
--
-- ⚠️ SQL Editor'da `auth.uid()` NULL döner (orada oturum yok), yani RLS'e
-- dayanan her kontrol boşa çalışır. Sahiplik senaryolarını denemek için
-- işlemin başında geçici oturum simüle et (migration 009/010'daki yöntem):
--     set local request.jwt.claim.sub = '<kullanici-uuid>';
--
-- 1) Tablo ve kısıtlar yerinde mi:
--      select conname, pg_get_constraintdef(oid)
--      from pg_constraint where conrelid = 'public.place_photos'::regclass
--      order by conname;
--    → kind_valid · caption_length · paths_nonempty · place_fk · pkey
--
-- 2) İndeks:
--      select indexname, indexdef from pg_indexes
--      where tablename = 'place_photos';
--    → idx_place_photos_place_kind + pkey
--
-- 3) RLS açık ve 4 politika var mı:
--      select relrowsecurity from pg_class
--      where oid = 'public.place_photos'::regclass;              -- true
--      select policyname, cmd from pg_policies
--      where tablename = 'place_photos' order by cmd;            -- 4 satır
--
-- 4) `kind` kısıtı gerçekten tutuyor mu — HATA VERMESİ BEKLENİYOR:
--      begin;
--        set local request.jwt.claim.sub = '<kendi-uuid>';
--        insert into place_photos (user_id, place_id, kind, storage_path, thumb_path)
--        values ('<kendi-uuid>', '<mevcut-place_id>', 'gecersiz', 'a.jpg', 'b.jpg');
--      rollback;
--    → "violates check constraint place_photos_kind_valid"
--
-- 5) FK gerçekten tutuyor mu — HATA VERMESİ BEKLENİYOR:
--      begin;
--        set local request.jwt.claim.sub = '<kendi-uuid>';
--        insert into place_photos (user_id, place_id, kind, storage_path, thumb_path)
--        values ('<kendi-uuid>', 'olmayan_place_id', 'menu', 'a.jpg', 'b.jpg');
--      rollback;
--    → "violates foreign key constraint place_photos_place_fk"
--
-- 6) MUTLU YOL — geçerli satır girip geri al:
--      select place_id from places limit 1;   -- bir place_id al
--      begin;
--        set local request.jwt.claim.sub = '<kendi-uuid>';
--        insert into place_photos (user_id, place_id, kind, storage_path, thumb_path)
--        values ('<kendi-uuid>', '<yukaridaki-place_id>', 'menu',
--                'test/full.jpg', 'test/thumb.jpg')
--        returning id, kind, created_at;
--      rollback;
--    → bir satır döner, sonra geri alınır (kalıcı iz bırakmaz)
--
-- 7) Boş yol savunması — HATA VERMESİ BEKLENİYOR:
--      aynı insert'i storage_path olarak '   ' vererek dene
--    → "violates check constraint place_photos_paths_nonempty"
--
-- NOT: "başkasının fotoğrafını silme/güncelleme" senaryosu SQL Editor'dan
-- GÜVENİLİR ŞEKİLDE TEST EDİLEMEZ (bu projede birden çok kez not düşüldü).
-- İkinci bir gerçek hesapla uygulamadan denenmeli.
