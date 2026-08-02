-- ====================================================
-- Migration 001 — user_rankings'e koordinat cache'i
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ====================================================
--
-- Neden: MapScreen her açılışta her satır için ayrı bir Google Place
-- Details isteği atıyordu (N+1). Koordinat mekan puanlanırken zaten
-- elimizde olduğu için tabloya yazıp tekrar tekrar sormayı bırakıyoruz.
--
-- Kolonlar nullable — mevcut satırlarda koordinat yok, uygulama onlar
-- için eskisi gibi Place Details'e düşüp değeri geri yazacak (backfill).

alter table user_rankings
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Değer varsa geçerli aralıkta olsun (null serbest).
alter table user_rankings
  drop constraint if exists user_rankings_latitude_range;
alter table user_rankings
  add constraint user_rankings_latitude_range
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table user_rankings
  drop constraint if exists user_rankings_longitude_range;
alter table user_rankings
  add constraint user_rankings_longitude_range
  check (longitude is null or (longitude >= -180 and longitude <= 180));

-- Haritanın çektiği sorgu: koordinatı olan satırlar.
create index if not exists idx_user_rankings_coords
  on user_rankings (latitude, longitude)
  where latitude is not null and longitude is not null;

-- ====================================================
-- Kontrol:
--   select count(*) filter (where latitude is null) as koordinatsiz,
--          count(*) as toplam
--   from user_rankings;
-- ====================================================
