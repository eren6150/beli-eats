-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 016 — ZİYARET BEĞENİLERİ (`entry_likes`)
--
-- Supabase SQL Editor'da elle çalıştırılır. Yeni bir tablo + RLS ekler;
-- mevcut hiçbir şeye dokunmaz.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── NE İŞE YARIYOR ───────────────────────────────────────────────────────────
-- Faz 3 / Diff E: bir günlük girişinin ("ziyaret") kendi detay ekranı var ve
-- kullanıcılar başkasının ziyaretine tepki verebiliyor. Yorum YOK — bilinçli
-- olarak kapsam dışı; beğeni tek etkileşim.
--
-- ── ŞEMA `follows` TABLOSUNUN BİREBİR AYNI DESENİ ────────────────────────────
-- Yeni bir yüzey uydurulmadı, bu projede zaten kanıtlanmış desen kopyalandı:
-- iki yabancı anahtardan oluşan BİLEŞİK BİRİNCİL ANAHTAR, ayrı bir `id`
-- kolonu YOK.
--   • "Aynı kişi aynı girişi iki kez beğenemez" kısıtı PK'dan BEDAVA geliyor;
--     ayrı bir unique kısıt yazmaya gerek yok.
--   • İstemci "beğendim mi" sorusunu tam PK ile soruyor → indeks araması.
--   • Ayrı `id` eklemek her yazma öncesi çözümleme gerektirirdi (aynı gerekçe
--     `places` tablosunun `place_id`'yi PK yapmasında da yazılı).
--
-- ── SİLME DAVRANIŞI ──────────────────────────────────────────────────────────
-- İki taraf da `on delete cascade`: giriş silinince beğenileri de gider,
-- kullanıcı silinince beğenileri gider. Öksüz beğeni diye bir durum yok.
-- `on delete restrict` YANLIŞ olurdu — beğeni aldı diye bir kullanıcının kendi
-- girişini silememesi saçma olurdu.
--
-- ── KENDİ GİRİŞİNİ BEĞENME: DB'DE SERBEST, ARAYÜZDE KAPALI ───────────────────
-- `follows`'taki `check (follower_id != following_id)` gibi bir tablo CHECK'i
-- BURADA YAZILAMIYOR: kısıt başka bir tabloya (`diary_entries.user_id`)
-- bakmayı gerektiriyor ve CHECK bunu yapamaz. Trigger yazmak mümkün ama
-- kazandıracağı şey kozmetik.
-- Karar: veritabanı serbest bırakıyor, ARAYÜZ kendi girişinde butonu hiç
-- göstermiyor (`useFollow`'un `isSelf` deseniyle aynı).
--
-- ── SAYAÇ NASIL OKUNUYOR — DENORMALİZE KOLON YOK ─────────────────────────────
-- `diary_entries`'e `like_count` eklenmedi. İstemci PostgREST'in gömülü
-- sayımını kullanıyor (`select('*, entry_likes(count)')`) — `useLists`'in
-- liste öğe sayısını aldığı yolun aynısı, N+1 sorgu YOK.
-- Denormalize kolon + trigger bu ölçekte erken optimizasyon olurdu ve
-- senkronizasyon hatası sınıfını bedavaya satın almak demekti.
--
-- ── GİZLİLİKLE İLİŞKİSİ ──────────────────────────────────────────────────────
-- Migration 015 günlüğü herkese açtı, yani beğenilebilir her giriş zaten
-- görünür durumda. İleride `diary_entries.is_private` eklenirse (015'te tam
-- SQL'i yazılı) beğeni okuması da o filtreye tabi olmalı; bugün böyle bir
-- kolon YOK, o yüzden burada da bir şey yapılmıyor.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists entry_likes (
  entry_id   uuid not null references diary_entries(id) on delete cascade,
  user_id    uuid not null references profiles(id)      on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- PK zaten `(entry_id, user_id)` ile başlıyor, yani "bu girişin beğenileri" ve
-- "bu kişi bu girişi beğendi mi" sorguları karşılanıyor.
-- Bu indeks TERS YÖN için: "bu kullanıcının beğendikleri". `follows`'un iki
-- indeksi de aynı gerekçeyle var. Bugün onu okuyan ekran yok ama indeks tek
-- satır ve ters yön sorgusu indekssiz tablo taraması demek.
create index if not exists idx_entry_likes_user on entry_likes(user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table entry_likes enable row level security;

-- Okuma herkese açık: sayaç ve "beğendim mi" bilgisi herkesin görebildiği
-- girişlere ait. profiles / user_rankings / lists / follows / diary_entries
-- ile aynı hizada.
drop policy if exists "Entry likes are viewable by everyone" on entry_likes;
create policy "Entry likes are viewable by everyone"
  on entry_likes for select using (true);

-- Yazma YALNIZCA kendi adına. `with check` şart: onsuz kullanıcı başkasının
-- adına beğeni satırı yazabilirdi.
drop policy if exists "Users can like as themselves" on entry_likes;
create policy "Users can like as themselves"
  on entry_likes for insert with check (auth.uid() = user_id);

-- Silme de yalnızca kendi satırın — başkasının beğenisi kaldırılamaz.
drop policy if exists "Users can remove own likes" on entry_likes;
create policy "Users can remove own likes"
  on entry_likes for delete using (auth.uid() = user_id);

-- UPDATE politikası BİLİNÇLİ OLARAK YOK: bir beğenide güncellenecek bir şey
-- yok (var ya da yok). Politika olmayan işlem RLS altında reddedilir.


-- ════════════════════════════════════════════════════════════════════════════
-- DOĞRULAMA — aşağıdakileri ayrı ayrı çalıştır
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) Tablo ve birincil anahtar doğru mu?
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'entry_likes'
--    order by ordinal_position;
--
--   Beklenen: entry_id (uuid, NO), user_id (uuid, NO), created_at (timestamptz, NO)
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'entry_likes'::regclass;
--
--   Beklenen: PRIMARY KEY (entry_id, user_id) + iki FOREIGN KEY (ikisi de
--   ON DELETE CASCADE).
--
-- 2) Politikalar doğru mu? ÜÇ satır beklenir, UPDATE OLMAMALI:
--
--   select policyname, cmd, qual, with_check
--     from pg_policies where tablename = 'entry_likes' order by cmd;
--
--   Beklenen:
--     DELETE → qual: (auth.uid() = user_id)
--     INSERT → with_check: (auth.uid() = user_id)
--     SELECT → qual: true
--
-- 3) Çift beğeni gerçekten engelleniyor mu? (SQL Editor'da `auth.uid()` null
--    döner, o yüzden RLS'i değil KISITI test ediyoruz. Geçici satır bırakmamak
--    için tek işlemde deneyip geri alıyoruz.)
--
--   begin;
--     insert into entry_likes (entry_id, user_id)
--     select id, user_id from diary_entries limit 1;
--
--     -- Aynısını tekrar denemek `duplicate key value violates unique
--     -- constraint "entry_likes_pkey"` vermeli:
--     insert into entry_likes (entry_id, user_id)
--     select id, user_id from diary_entries limit 1;
--   rollback;
--
--   ⚠️ İkinci insert HATA VERMELİ. Vermezse PK yanlış kurulmuş demektir.
--   `rollback` sayesinde tabloda hiçbir şey kalmıyor.
--
-- 4) Cascade çalışıyor mu? (Yine geri alınıyor — gerçek veri silinmiyor.)
--
--   begin;
--     insert into entry_likes (entry_id, user_id)
--     select id, user_id from diary_entries limit 1;
--
--     delete from diary_entries
--      where id = (select entry_id from entry_likes limit 1);
--
--     select count(*) as kalan_begeni from entry_likes;   -- 0 olmalı
--   rollback;
--
-- 5) ⚠️ RLS'in kendisi SQL EDITOR'DAN TEST EDİLEMEZ (orada oturum yok, bkz.
--    migration 006/007/008'deki aynı not). "Başkasının beğenisini silemiyor
--    muyum" sorusu ancak uygulamadan, iki gerçek hesapla denenebilir.
-- ════════════════════════════════════════════════════════════════════════════
