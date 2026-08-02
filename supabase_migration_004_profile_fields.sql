-- ====================================================
-- Migration 004 — profiles: full_name, bio, updated_at
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ====================================================
--
-- NEDEN:
-- `profiles` tablosu yalnızca (id, username, avatar_url, created_at) içeriyordu.
-- Ama kod bu üç kolonun VAR OLDUĞUNU varsayıyordu:
--   • `Profile` TS tipi `full_name?` ve `bio?` ilan ediyor (opsiyonel olduğu
--     için tsc şikayet etmiyordu, sessizce hep undefined geliyordu)
--   • `useProfile.updateProfile` var olmayan `updated_at` kolonuna yazıyor —
--     ilk çağrıldığında "column updated_at does not exist" ile patlayacaktı
--     (henüz çağıran yok, o yüzden canlı bir hata değildi)
--   • Faz 1b'de eklenen `ProfileHeader` isim ve bio satırlarını çiziyor
--
-- Bu migration şemayı kodun beklentisine hizalıyor.
--
-- RLS NOTU: politika değişikliği GEREKMİYOR. `profiles` üzerindeki
-- "Users can update own profile" politikası satır seviyesinde çalışıyor
-- (`auth.uid() = id`), kolon listesine bakmıyor — yeni kolonlar otomatik
-- olarak aynı korumanın altında.

-- ----------------------------------------------------
-- 1. full_name ve bio
-- ----------------------------------------------------

alter table profiles
  add column if not exists full_name text,
  add column if not exists bio       text;

-- Uzunluk sınırları: ProfileHeader ismi tek satırda, bio'yu 3 satırda
-- gösteriyor. Sınırsız metin arayüzü bozar.
alter table profiles drop constraint if exists profiles_full_name_length;
alter table profiles add constraint profiles_full_name_length
  check (full_name is null or length(full_name) <= 100);

alter table profiles drop constraint if exists profiles_bio_length;
alter table profiles add constraint profiles_bio_length
  check (bio is null or length(bio) <= 300);

-- ----------------------------------------------------
-- 2. updated_at
-- ----------------------------------------------------
--
-- Üç adımda ekleniyor, çünkü doğrudan `default now()` ile eklemek mevcut
-- satırların hepsine BUGÜNÜN tarihini yazar — oysa o profiller bugün
-- güncellenmedi. Mevcut satırlarda `created_at` daha doğru bir değer.
-- Bu sıralama aynı zamanda tekrar çalıştırılabilir: `update` yalnızca
-- null olanlara dokunuyor.

alter table profiles
  add column if not exists updated_at timestamptz;

update profiles
   set updated_at = coalesce(created_at, now())
 where updated_at is null;

alter table profiles alter column updated_at set default now();
alter table profiles alter column updated_at set not null;

-- ----------------------------------------------------
-- 3. updated_at TRIGGER
-- ----------------------------------------------------
-- Fonksiyon supabase_schema.sql ve migration 002'de zaten var; `create or
-- replace` ile birebir aynısını yazmak bu migration'ı tek başına
-- çalıştırılabilir yapar.

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on profiles;
create trigger set_updated_at
  before update on profiles
  for each row execute procedure update_updated_at_column();

-- ====================================================
-- KONTROL — bu üç sorguyu çalıştır:
--
--   -- 1) Kolonlar geldi mi?
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'profiles'
--   order by ordinal_position;
--   -- full_name (text, YES), bio (text, YES), updated_at (timestamptz, NO, now())
--
--   -- 2) Mevcut satırların updated_at'i created_at ile aynı mı?
--   select username, created_at, updated_at,
--          (created_at = updated_at) as ayni
--   from profiles;
--
--   -- 3) Trigger çalışıyor mu? Kendi satırına bir bio yaz, updated_at
--   --    now()'a atlamalı (created_at değişmemeli):
--   update profiles set bio = 'Test bio' where id = auth.uid();
--   select username, bio, created_at, updated_at from profiles where id = auth.uid();
-- ====================================================
