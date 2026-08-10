-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 018 — FOTOĞRAF MODERASYONU (şikayet + yumuşak gizleme)
--
-- Supabase SQL Editor'da elle çalıştırılır.
-- ÖNCE migration 013 (place_photos) çalışmış olmalı.
--
-- ⚠️ ÇALIŞTIRMA SIRASI: bu migration UYGULAMA GÜNCELLEMESİNDEN (OTA) ÖNCE
--    çalıştırılmalı. Yeni kolon ve tablo olmadan istemci "Bildir" eylemini
--    çağıramaz. Bu yönde kırılma YOK: mevcut APK `hidden` kolonunu bilmiyor,
--    `select *` ile geliyor ve görmezden geliyor.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── NEDEN GEREKLİ ────────────────────────────────────────────────────────────
-- Bugün `place_photos` okuması HERKESE AÇIK ve silme YALNIZCA SAHİBİNE. Yani
-- başkasının uygunsuz/alakasız fotoğrafını bildirmenin, gizlemenin veya
-- sildirmenin HİÇBİR YOLU YOK. Bu, Kademe 2'nin (davetli çevreye açılmak)
-- engelleyici koşullarından biri: tanımadığın kişiler içerik yüklemeye
-- başladığı anda gerekiyor.
--
-- ── ALINAN KARARLAR (kullanıcı onaylı) ───────────────────────────────────────
--   Kim şikayet eder   → giriş yapmış herkes, KENDİ fotoğrafı hariç
--   Kim karar verir    → yalnızca proje sahibi, SUPABASE PANELİNDEN
--                        (uygulamada yönetici arayüzü YOK, rol sistemi YOK)
--   Gizleme            → YUMUŞAK ve GERİ ALINABİLİR (`hidden` kolonu)
--   Otomatik gizleme   → YOK, hep elle karar
--   Yükleyiciye yaptırım → YOK (bugün kayda geçiyor, mekanizma yok)
--   Şikayet edene bildirim → YOK ("şikayetin alındı" onayı yeterli)
--
-- ── ⚠️ SINIR: YUMUŞAK GİZLEME DOSYAYI İNTERNETTEN KALDIRMIYOR ────────────────
-- `place-photos` bucket'ı PUBLIC (migration 014, gerekçe: imzalı URL egress'i
-- artırıyor ve bu projenin ücretsiz katmandaki asıl darboğazı egress).
-- Sonucu: `hidden = true` fotoğrafı UYGULAMADAN gizler, ama DOĞRUDAN URL'İ
-- BİLEN biri dosyayı görmeye devam eder.
--
-- Pratikte kimse o URL'i bilmiyor — uygulama artık göstermiyor. Ama GERÇEKTEN
-- YASA DIŞI içerik için gizleme YETMEZ: Storage'dan dosyayı da elle silmen
-- gerekiyor. Aşağıdaki 5. bölümde o adım da yazılı.
-- ════════════════════════════════════════════════════════════════════════════

-- ----------------------------------------------------
-- 1. place_photos.hidden
-- ----------------------------------------------------
--
-- `not null default false`: mevcut satırların hepsi görünür kalıyor, veri
-- göçü gerekmiyor.

alter table place_photos add column if not exists hidden boolean not null default false;

-- ----------------------------------------------------
-- 2. ⚠️ KULLANILMAYAN UPDATE POLİTİKASI DÜŞÜYOR — bu bir GÜVENLİK DÜZELTMESİ
-- ----------------------------------------------------
--
-- Migration 013 şunu kurmuştu:
--     "Users can update own place photos" using (auth.uid() = user_id)
--
-- RLS KOLON BAZLI DEĞİL. `hidden` kolonu eklendiği anda bu politika,
-- moderasyon edilen kullanıcının kendi fotoğrafını GERİ AÇMASINA izin verirdi
-- (`update place_photos set hidden = false where id = ...`). Yani gizleme
-- kararı tek taraflı olarak iptal edilebilirdi.
--
-- DOĞRULANDI: uygulama `place_photos`'a HİÇ UPDATE atmıyor — yalnızca
-- `insert` (`src/lib/placePhotos.ts`), `select` ve `delete`
-- (`src/hooks/usePlacePhotos.ts`). Politika kullanılmıyor, düşürmenin
-- işlevsel etkisi SIFIR.
--
-- Yükleyicinin kendi fotoğrafını "gizlemesi" zaten gereksiz: silme hakkı var.
-- Moderatör panelden yazıyor ve `service_role` RLS'i baypas ediyor.
--
-- Kolon bazlı izin (`grant update (caption)`) alternatifi vardı ama bugün
-- güncellenen hiçbir kolon yok — kullanılmayan bir yüzeyi korumaya çalışmak
-- gereksiz karmaşıklık olurdu.

drop policy if exists "Users can update own place photos" on place_photos;

-- ----------------------------------------------------
-- 3. SELECT politikası — gizlenen fotoğraf YÜKLEYİCİSİNE görünmeye devam
-- ----------------------------------------------------
--
-- `not hidden or auth.uid() = user_id`
--
-- İkinci dal bilinçli: yükleyici kendi fotoğrafını görmeye devam etsin ki
-- arayüz "gizlendi" etiketi gösterebilsin. Aksi halde fotoğrafı sessizce
-- KAYBOLMUŞ görünürdü ve kullanıcı bir hata olduğunu sanardı.
--
-- İstemcinin etiketi çizebilmesi için `hidden` kolonunun okunabilir olması
-- gerekiyor — kolon olduğu için `select *` ile zaten geliyor.

drop policy if exists "Place photos are viewable by everyone" on place_photos;
create policy "Place photos are viewable by everyone"
  on place_photos for select
  using (not hidden or auth.uid() = user_id);

-- ----------------------------------------------------
-- 4. photo_reports
-- ----------------------------------------------------
--
-- ŞEMA `entry_likes`'ın (migration 016) BİREBİR AYNI DESENİ: iki yabancı
-- anahtardan oluşan BİLEŞİK BİRİNCİL ANAHTAR, ayrı `id` kolonu YOK.
--   • "Aynı kişi aynı fotoğrafı iki kez şikayet edemez" kısıtı PK'dan BEDAVA.
--   • İstemci ikinci denemede `23505` alıyor ve onu "Bu fotoğrafı zaten
--     bildirdin." metnine çeviriyor — `addPlaceToList`'in aynı deseni.
--     Böylece "bildirdim mi" diye AYRI BİR SORGU atmaya gerek kalmıyor
--     (ızgarada N+1 demekti).

create table if not exists photo_reports (
  photo_id   uuid not null references place_photos(id) on delete cascade,
  user_id    uuid not null references profiles(id)     on delete cascade,

  -- SABİT KÜME, serbest metin YOK. Serbest açıklama yeni bir kötüye kullanım
  -- yüzeyi olurdu (şikayet kutusuna hakaret yazılabilir) ve onu da modere
  -- etmek gerekirdi. Kategori triyaj için yeterli.
  -- Değerler İngilizce, arayüz Türkçe — `place_photos.kind` ile aynı kural.
  reason     text not null,

  created_at timestamptz not null default now(),

  primary key (photo_id, user_id)
);

-- Kısıt ayrı ALTER'da ve açık isimli: `create table if not exists` tabloyu
-- bulursa inline tanımı UYGULAMAZ (migration 005/009/013'ün aynı gerekçesi).
alter table photo_reports drop constraint if exists photo_reports_reason_valid;
alter table photo_reports add constraint photo_reports_reason_valid
  check (reason in ('inappropriate', 'irrelevant', 'spam', 'other'));

-- MİGRATION 003'ÜN DERSİ: Postgres FK'nın referans EDEN tarafına otomatik
-- indeks açmaz. PK zaten `photo_id` ile başlıyor, yani o yön karşılanıyor.
-- Bu indeks TERS YÖN için: "bir kullanıcı silinince şikayetleri de gitsin"
-- (`on delete cascade`) kontrolü onsuz tablo taraması yapardı.
create index if not exists idx_photo_reports_user on photo_reports(user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table photo_reports enable row level security;

-- YALNIZCA INSERT POLİTİKASI VAR.
--   • SELECT yok  → kullanıcılar birbirinin şikayetlerini göremez. Moderatör
--                   panelden bakıyor ve `service_role` RLS'i baypas ediyor.
--                   İstemcinin "bildirdim mi" bilgisine ihtiyacı yok: ikinci
--                   deneme `23505` ile karşılanıyor.
--   • UPDATE yok  → bir şikayette güncellenecek bir şey yok.
--   • DELETE yok  → şikayet GERİ ÇEKİLEMİYOR, bilinçli. Şikayet moderatöre
--                   giden bir sinyal; geri çekme kimsenin istemediği bir
--                   özellik ve sinyali zayıflatırdı. Yanlış dokunuşa karşı
--                   koruma arayüzdeki ONAY DİYALOĞU.
-- Politikası olmayan işlem RLS altında reddedilir (016'nın aynı kararı).

drop policy if exists "Users can report others photos" on photo_reports;
create policy "Users can report others photos"
  on photo_reports for insert
  with check (
    auth.uid() = user_id
    -- ⚠️ "KENDİ FOTOĞRAFINI ŞİKAYET EDEMEZSİN" BURADA GERÇEKTEN ZORLANIYOR.
    -- `entry_likes`'ta bu YAPILAMAMIŞTI: tablo CHECK kısıtı başka bir tabloya
    -- bakamıyor, o yüzden orada "veritabanı serbest, arayüz kapalı" demek
    -- zorunda kalınmıştı. RLS politika ifadeleri ise ALT SORGU kabul ediyor.
    and exists (
      select 1 from place_photos p
      where p.id = photo_id
        and p.user_id <> auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 5. MODERASYON — panelde kullanacağın sorgular (migration'ın parçası DEĞİL)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── A) BEKLEYEN ŞİKAYETLER (ana ekranın) ────────────────────────────────────
--   Gizlenmemiş ama şikayet almış fotoğraflar, en çok şikayet alan üstte.
--
--   select p.id                          as photo_id,
--          count(r.*)                    as sikayet,
--          array_agg(distinct r.reason)  as sebepler,
--          pr.username                   as yukleyen,
--          pl.name                       as mekan,
--          p.kind,
--          p.storage_path,
--          max(r.created_at)             as son_sikayet
--     from photo_reports r
--     join place_photos p  on p.id = r.photo_id
--     join profiles     pr on pr.id = p.user_id
--     left join places  pl on pl.place_id = p.place_id
--    where not p.hidden
--    group by p.id, pr.username, pl.name, p.kind, p.storage_path
--    order by sikayet desc, son_sikayet desc;
--
-- ── B) FOTOĞRAFA BAKMAK ─────────────────────────────────────────────────────
--   Bucket public olduğu için doğrudan URL ile açabilirsin:
--     https://<PROJE-REF>.supabase.co/storage/v1/object/public/place-photos/<storage_path>
--   (<PROJE-REF> panelin adresinde yazılı. Ya da Storage → place-photos
--    altında yolu elle bul.)
--
-- ── C) GİZLE ────────────────────────────────────────────────────────────────
--   update place_photos set hidden = true where id = '<PHOTO_ID>';
--
-- ── D) GERİ AL (yanlış karar verdiysen) ─────────────────────────────────────
--   update place_photos set hidden = false where id = '<PHOTO_ID>';
--
-- ── E) ⚠️ KALICI SİLME — yalnızca gerçekten yasa dışı içerik için ───────────
--   İKİ ADIM, ikisi de gerekli. Yalnızca satırı silmek DOSYAYI BIRAKIR ve
--   dosya public URL'den erişilebilir olmaya devam eder.
--
--   1) Storage → place-photos → `storage_path` VE `thumb_path`'teki iki
--      nesneyi de panelden sil. (Her fotoğraf İKİ nesne, bkz. migration 013.)
--   2) delete from place_photos where id = '<PHOTO_ID>';
--      (Şikayetleri `on delete cascade` ile birlikte gider.)
--
--   ⚠️ Sıra önemli: önce yolları oku, sonra sil. Satır gidince yolları
--      bulmanın yolu kalmaz.
--
-- ── F) BİR KULLANICININ TÜM ŞİKAYET GEÇMİŞİ (yaptırım mekanizması YOK, ama
--       tekrar eden ihlalleri görmek istersen) ─────────────────────────────
--
--   select pr.username, count(*) as sikayet_alan_fotograf
--     from place_photos p
--     join profiles pr on pr.id = p.user_id
--    where exists (select 1 from photo_reports r where r.photo_id = p.id)
--    group by pr.username
--    order by sikayet_alan_fotograf desc;


-- ════════════════════════════════════════════════════════════════════════════
-- DOĞRULAMA — aşağıdakileri AYRI AYRI çalıştır
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── 1) Kolon eklendi mi, varsayılanı doğru mu? ──────────────────────────────
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'place_photos' and column_name = 'hidden';
--
--   ✅ Beklenen: boolean · NO · false
--
--   select count(*) filter (where hidden) as gizli,
--          count(*)                       as toplam
--     from place_photos;
--
--   ✅ Beklenen: gizli = 0 (mevcut fotoğrafların hiçbiri etkilenmedi)
--
-- ── 2) ⚠️ UPDATE POLİTİKASI GERÇEKTEN DÜŞTÜ MÜ? (en kritik kontrol) ────────
--
--   select policyname, cmd from pg_policies
--    where tablename = 'place_photos' order by cmd;
--
--   ✅ Beklenen ÜÇ satır: DELETE · INSERT · SELECT
--   ❌ UPDATE görürsen düşürme çalışmamış — politika adı migration 013'tekiyle
--      birebir aynı olmalı; farklıysa elle düşür:
--        drop policy "<gördüğün ad>" on place_photos;
--      Düşmezse moderasyon ettiğin kullanıcı fotoğrafını geri açabilir.
--
-- ── 3) SELECT politikası doğru mu? ──────────────────────────────────────────
--
--   select policyname, qual from pg_policies
--    where tablename = 'place_photos' and cmd = 'SELECT';
--
--   ✅ Beklenen qual: ((NOT hidden) OR (auth.uid() = user_id))
--
-- ── 4) photo_reports kurulumu ───────────────────────────────────────────────
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'photo_reports'::regclass;
--
--   ✅ Beklenen: PRIMARY KEY (photo_id, user_id) · iki FOREIGN KEY (ikisi de
--      ON DELETE CASCADE) · reason CHECK (dört değer)
--
--   select policyname, cmd, with_check from pg_policies
--    where tablename = 'photo_reports';
--
--   ✅ Beklenen: TEK satır, INSERT. SELECT/UPDATE/DELETE OLMAMALI.
--
-- ── 5) Çift şikayet gerçekten engelleniyor mu? ──────────────────────────────
--    (SQL Editor'da `auth.uid()` null döner, o yüzden RLS'i değil KISITI test
--     ediyoruz. Tek işlemde deneyip geri alıyoruz.)
--
--   begin;
--     insert into photo_reports (photo_id, user_id, reason)
--     select id, user_id, 'spam' from place_photos limit 1;
--
--     -- Aynısı `duplicate key value violates unique constraint
--     -- "photo_reports_pkey"` VERMELİ:
--     insert into photo_reports (photo_id, user_id, reason)
--     select id, user_id, 'spam' from place_photos limit 1;
--   rollback;
--
--   ⚠️ İkinci insert HATA VERMELİ. Vermezse PK yanlış kurulmuş.
--
-- ── 6) Geçersiz kategori reddediliyor mu? ───────────────────────────────────
--
--   begin;
--     insert into photo_reports (photo_id, user_id, reason)
--     select id, user_id, 'uydurma_kategori' from place_photos limit 1;
--   rollback;
--
--   ⚠️ HATA VERMELİ (`photo_reports_reason_valid`).
--
-- ── 7) Gizleme okumayı gerçekten kesiyor mu? ────────────────────────────────
--    `auth.uid()` null olduğu için politikanın ikinci dalı (`= user_id`)
--    sağlanmıyor; yani bu test SADECE "gizli olan görünmüyor" tarafını
--    doğruluyor — doğru olan da bu.
--
--   begin;
--     update place_photos set hidden = true
--      where id = (select id from place_photos limit 1);
--
--     -- Politikayı devreye sokan bir rolle bakmak gerekir; panelde
--     -- `service_role` RLS'i baypas ettiği için satır YİNE görünür.
--     -- Gerçek doğrulama 8. maddede, UYGULAMADAN.
--     select id, hidden from place_photos where hidden;
--   rollback;
--
-- ── 8) ⚠️ ASIL DOĞRULAMA UYGULAMADAN, İKİ HESAPLA ──────────────────────────
--    RLS SQL Editor'dan test EDİLEMEZ (migration 006/007/008/016'daki aynı
--    not). Uygulamadan kontrol edilecekler:
--      • A kullanıcısı B'nin fotoğrafını bildirebiliyor
--      • A kendi fotoğrafını bildiremiyor (buton hiç görünmemeli; görünse
--        bile politika reddetmeli)
--      • Aynı fotoğrafı ikinci kez bildirmek "zaten bildirdin" veriyor
--      • Panelden gizlenen fotoğraf A'da KAYBOLUYOR, B'de (yükleyici)
--        "gizlendi" etiketiyle DURUYOR
-- ════════════════════════════════════════════════════════════════════════════
