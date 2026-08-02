-- ====================================================
-- Migration 009 — diary_entries (Faz 2, ikinci ayak)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 002 (places) çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- Letterboxd'un diary'si: "ne zaman gittim, ne düşündüm". Restoranlar
-- filmlerden farklı olarak TEKRAR TEKRAR ziyaret edilir — bu yüzden:
--
--   diary_entries → mekan başına SINIRSIZ satır (her ziyaret bir satır)
--   user_rankings → mekan başına TEK satır (kanonik puan + sıra)
--
-- İkisi farklı soruları cevaplıyor: "geçen ay nerelere gittim" ile "en
-- sevdiğim mekanlar hangileri". Aynı tabloda tutmak ikisinden birini bozardı.
--
-- PUAN ZORUNLU DEĞİL (nullable `rating`): "gittim" demek için puan vermek
-- gerekmiyor. Puansız log yalnızca günlükte görünür, sıralamaya girmez.
-- Puanlı log `user_rankings`'i günceller — ama o iş bu migration'ın değil,
-- migration 010'daki `log_diary_entry()` RPC'sinin işi.

-- ----------------------------------------------------
-- 1. TABLO
-- ----------------------------------------------------
--
-- `user_id` → `profiles(id)`, `auth.users` DEĞİL: şemadaki diğer üç tablo
-- (user_rankings, follows, lists) de profiles'a bağlı, tutarlılık korunuyor.

create table if not exists diary_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,

  place_id   text not null,

  -- `date`, `timestamptz` DEĞİL — bilinçli.
  -- Kullanıcı "1 Ağustos'ta gittim" diyor; saat bilgisi gürültü. Üstelik
  -- timestamptz'de zaman dilimi kayması ziyareti bir gün öteleyebilirdi
  -- (23:30'da girilen kayıt UTC'ye çevrilince ertesi gün görünür).
  visited_at date not null default current_date,

  -- NULLABLE — diary'nin ana kararı. Aralık user_rankings ile birebir aynı.
  rating     numeric(2,1),

  note       text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kısıtlar ayrı ALTER'larda ve açık isimli: `create table if not exists`
-- tabloyu bulursa inline tanımları UYGULAMAZ, bu blok ise tekrar
-- çalıştırılabilir (migration 002/005'teki aynı gerekçe).

alter table diary_entries drop constraint if exists diary_entries_rating_range;
alter table diary_entries add constraint diary_entries_rating_range
  check (rating is null or (rating >= 0.5 and rating <= 5.0));

alter table diary_entries drop constraint if exists diary_entries_note_length;
alter table diary_entries add constraint diary_entries_note_length
  check (note is null or length(note) <= 1000);

-- Migration 003/005'teki FK ile AYNI davranış:
--   on update cascade  → Google place_id değişirse tek UPDATE her yere yayılır
--   on delete restrict → cache satırını silmek günlüğü sessizce bozmasın
-- Yani bir günlük girişi yazmadan önce mekanın `places` satırı OLMAK ZORUNDA
-- (uygulama tarafında: önce `resolvePlace()`).
alter table diary_entries drop constraint if exists diary_entries_place_fk;
alter table diary_entries add constraint diary_entries_place_fk
  foreign key (place_id) references places (place_id)
  on update cascade
  on delete restrict;

-- GELECEK TARİH KONTROLÜ BURADA YOK — YAPILAMIYOR.
-- Postgres CHECK kısıtları IMMUTABLE olmayan fonksiyon çağıramaz;
-- `check (visited_at <= current_date)` "functions in check constraint must be
-- marked IMMUTABLE" hatası verir. Doğrulama istemcide: tarih seçici bugünden
-- ileri seçtirmiyor. DB seviyesinde garanti istenirse yol trigger'dır —
-- v1'de gerekmiyor, yanlış tarih veri kaybı değil düzeltilebilir bir hata.

-- ----------------------------------------------------
-- 2. updated_at TRIGGER'ı
-- ----------------------------------------------------
-- Fonksiyon schema.sql / 002 / 004 / 005'te zaten var; `create or replace` ile
-- birebir aynısını yazmak bu migration'ı tek başına çalıştırılabilir yapıyor.

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on diary_entries;
create trigger set_updated_at
  before update on diary_entries
  for each row execute procedure update_updated_at_column();

-- ----------------------------------------------------
-- 3. İNDEKSLER
-- ----------------------------------------------------

-- "Günlük" sekmesinin TEK sorgusu: kullanıcının girişleri, en yeni ziyaret
-- üstte. İkinci anahtar `created_at`: aynı güne birden çok giriş girilebilir
-- (`visited_at` bir tarih, saat yok), o durumda son yazılan üstte olsun.
create index if not exists idx_diary_entries_user_visited
  on diary_entries (user_id, visited_at desc, created_at desc);

-- MİGRATION 003'ÜN DERSİ: Postgres, FK'nın referans EDEN tarafına otomatik
-- indeks AÇMAZ. Bu indeks olmadan iki şey tablo taraması yapar:
--   - `on delete restrict` kontrolü (bir places satırı silinmeye çalışıldığında)
--   - PostgREST'in `places(*)` gömülü sorgusu
create index if not exists idx_diary_entries_place_id
  on diary_entries (place_id);

-- (user_id, place_id) indeksi BİLİNÇLİ OLARAK YOK: onu isteyen tek şey mekan
-- sayfasındaki "bu mekana N kez gittin" ve o ekran v1'de yapılmıyor.
-- Kullanılmayan indeks, her yazmada güncellenen ölü yüktür.

-- ----------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------
--
-- DİKKAT — BURADA KONVANSİYONDAN BİLİNÇLİ SAPMA VAR.
--
-- profiles / user_rankings / follows / places / lists / list_items hepsinde
-- SELECT politikası `using (true)` (okuma herkese açık). diary_entries'te
-- SELECT DE SAHİPLİK İSTİYOR.
--
-- Gerekçe: `note` bugüne kadarki en kişisel veri ("yanımdakiyle tartıştık,
-- bir daha gelmem"). Faz 3'ün sosyal katmanı arkadaş günlüğünü göstermek
-- isterse politikayı gevşetmek TEK SATIR; sızmış bir notu geri almak mümkün
-- değil. Asimetrik risk, kapalı taraf varsayılan.
--
-- Bu, listelerdeki `is_public` kararıyla da tutarlı: gizlilik Faz 3'ün UI+RLS
-- işi, ama varsayılanı açık bırakmıyoruz.

alter table diary_entries enable row level security;

drop policy if exists "Users can view own diary entries" on diary_entries;
create policy "Users can view own diary entries"
  on diary_entries for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own diary entries" on diary_entries;
create policy "Users can insert own diary entries"
  on diary_entries for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own diary entries" on diary_entries;
create policy "Users can update own diary entries"
  on diary_entries for update using (auth.uid() = user_id)
  -- `with check` de gerekli (005'in dersi): `using` HANGİ satırın
  -- güncellenebileceğini, `with check` satırın YENİ halini denetliyor.
  -- Olmadan kullanıcı kendi girişini başkasının üstüne atayabilirdi.
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own diary entries" on diary_entries;
create policy "Users can delete own diary entries"
  on diary_entries for delete using (auth.uid() = user_id);

-- ----------------------------------------------------
-- 5. POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
-- `diary_entries → places` gömülü sorgusu ancak cache yenilendikten sonra
-- çalışır; o aralıkta FK var olduğu halde "Could not find a relationship" döner.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- 1) Kolonlar geldi mi? `rating` ve `note` NULLABLE olmalı,
--   --    `visited_at` tipi `date` olmalı.
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'diary_entries'
--   order by ordinal_position;
--
--   -- 2) FK doğru davranışta mı?
--   select conname, confupdtype, confdeltype
--   from pg_constraint where conname = 'diary_entries_place_fk';
--   -- confupdtype = 'c' (cascade), confdeltype = 'r' (restrict)
--
--   -- 3) İndeksler:
--   select indexname from pg_indexes
--   where tablename = 'diary_entries' order by indexname;
--
--   -- 4) PUANSIZ GİRİŞ yazılabiliyor mu? (diary'nin ana kararı)
--   insert into diary_entries (user_id, place_id, visited_at, note)
--   select auth.uid(), ur.place_id, current_date - 3, 'Puansız test girişi'
--   from user_rankings ur where ur.user_id = auth.uid() limit 1;
--
--   -- 5) PUANLI GİRİŞ de yazılabiliyor mu?
--   insert into diary_entries (user_id, place_id, visited_at, rating, note)
--   select auth.uid(), ur.place_id, current_date, 4.5, 'Puanlı test girişi'
--   from user_rankings ur where ur.user_id = auth.uid() limit 1;
--
--   -- 6) AYNI MEKANA İKİNCİ ZİYARET serbest mi? (list_items'ın tersine
--   --    burada unique kısıt YOK — 4 ve 5 aynı mekana yazdıysa bu zaten kanıt)
--   select place_id, count(*) as ziyaret_sayisi
--   from diary_entries where user_id = auth.uid()
--   group by place_id;
--
--   -- 7) GEÇERSİZ PUAN reddediliyor mu? HATA VERMELİ
--   --    ("violates check constraint diary_entries_rating_range")
--   insert into diary_entries (user_id, place_id, rating)
--   select auth.uid(), ur.place_id, 7.5
--   from user_rankings ur where ur.user_id = auth.uid() limit 1;
--
--   -- 8) FK koruyor mu? HATA VERMELİ ("violates foreign key constraint")
--   insert into diary_entries (user_id, place_id)
--   values (auth.uid(), 'BOYLE_BIR_PLACE_ID_YOK');
--
--   -- 9) Okuma sırası doğru mu? (en yeni ziyaret üstte)
--   select d.visited_at, d.rating, d.note, p.name
--   from diary_entries d
--   join places p on p.place_id = d.place_id
--   where d.user_id = auth.uid()
--   order by d.visited_at desc, d.created_at desc;
--
--   -- 10) TEMİZLİK
--   delete from diary_entries
--    where user_id = auth.uid()
--      and note in ('Puansız test girişi', 'Puanlı test girişi');
--
-- NOT: RLS'in "başkasının günlüğünü göremez" tarafı SQL Editor'dan test
-- EDİLEMEZ (orada `auth.uid()` hep senin kullanıcın) — 006/007/008'deki aynı
-- boşluk. İkinci bir hesapla uygulamada denenebilir.
-- ====================================================
