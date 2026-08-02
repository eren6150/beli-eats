-- ====================================================
-- Migration 002 — paylaşılan `places` cache tablosu
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ====================================================
--
-- NEDEN:
-- Google'dan çekilen mekan bilgisi şu an hiçbir yerde paylaşılmıyor.
-- RestaurantDetailScreen'in cache'i YOK — aynı restoranı 10 kez açmak 10
-- Place Details çağrısı demek. MapScreen'in POI cache'i yalnızca bellekte,
-- uygulama yeniden başlayınca sıfırlanıyor. Üstelik POI dokunuşu ile detay
-- ekranı farklı alan maskeleri kullandığı için aynı mekan iki kez çekiliyor.
--
-- Bu tablo mekan başına tek satır tutar; Faz 2'nin diary_entries, lists,
-- list_items ve place_photos tabloları hep buna bağlanacak.
--
-- LİSANS NOTU:
-- Google Maps Platform hizmet şartları `place_id` dışındaki içeriğin süresiz
-- saklanmasına izin vermiyor (place_id açık istisna, diğerleri ~30 gün).
-- `fetched_at` kolonu bu yüzden var: uygulama 7 günden eski satırı okurken
-- arka planda yeniliyor. user_rankings.latitude/longitude bugün süresiz
-- saklanıyor ve hiç yenilenmiyor — bu tablo o boşluğu da kapatıyor.
--
-- FK NOTU:
-- user_rankings.place_id → places.place_id foreign key'i BU DOSYADA YOK.
-- Bilinçli: FK şimdi konsa, places'te satırı olmayan bir mekana puan vermek
-- anında kırılırdı (useRankings.addOrUpdateRanking doğrudan user_rankings'e
-- yazıyor). FK, her yazma yolu önce places'i doldurduktan sonra güvenli →
-- migration 003.

-- ----------------------------------------------------
-- 1. TABLO
-- ----------------------------------------------------
--
-- Primary key `place_id` (ayrı uuid değil): her yazma/okuma yolunda place_id
-- zaten elimizde (POI event'i, autocomplete prediction'ı, mevcut satırlar).
-- uuid ara katmanı her yazma öncesi bir çözümleme sorgusu demekti.
-- Place ID'lerin değişebilmesi riski çocuk FK'lardaki `on update cascade` ile
-- karşılanıyor: places üzerinde tek UPDATE her yere yayılır.

create table if not exists places (
  -- Google place_id. Uzunluk CHECK'i yok — Google uzunluk garantisi vermiyor.
  place_id           text primary key,

  name               text not null,
  formatted_address  text,

  latitude           double precision,
  longitude          double precision,

  -- Google `types` dizisi. Faz 3'ün içerik tabanlı önerileri buna bakacak.
  types              text[],

  -- Google'ın ortalama puanı. user_rankings.rating gibi numeric(2,1) DEĞİL:
  -- bizim puanımız 0.5 adımlı, Google'ınki değil. (2,1) beklenmedik bir ikinci
  -- ondalığı sessizce yuvarlardı.
  google_rating      numeric(3,2),
  user_ratings_total integer,
  price_level        smallint,

  -- Fotoğraf referansları. Tek kolon yetmiyordu: detay ekranı 8 fotoğraf
  -- gösteriyor. Kapak fotoğrafı = photo_refs[1].
  photo_refs         text[],

  -- Faz 3 (şehir değiştirici + şehir bazlı leaderboard) için slot.
  -- BU FAZDA NULL KALIYOR: doğru kaynağı address_components, formatted_address
  -- parse etmek güvenilmez. Alan maskesine address_components eklendiğinde dolar.
  city               text,

  -- Google verisi ne zaman çekildi. TTL kararı BUNA bakar.
  -- updated_at'ten ayrı: updated_at bizim satırımızın son değişimi, alakasız
  -- bir kolon güncellemesi cache'i "taze" göstermemeli.
  fetched_at         timestamptz not null default now(),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Kısıtlar ayrı ALTER'larda: `create table if not exists` tabloyu bulursa
-- inline kısıtları uygulamaz, bu blok ise tekrar çalıştırılabilir.
alter table places drop constraint if exists places_place_id_not_blank;
alter table places add constraint places_place_id_not_blank
  check (length(btrim(place_id)) > 0);

alter table places drop constraint if exists places_name_not_blank;
alter table places add constraint places_name_not_blank
  check (length(btrim(name)) > 0);

alter table places drop constraint if exists places_latitude_range;
alter table places add constraint places_latitude_range
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table places drop constraint if exists places_longitude_range;
alter table places add constraint places_longitude_range
  check (longitude is null or (longitude >= -180 and longitude <= 180));

alter table places drop constraint if exists places_google_rating_range;
alter table places add constraint places_google_rating_range
  check (google_rating is null or (google_rating >= 0 and google_rating <= 5));

alter table places drop constraint if exists places_price_level_range;
alter table places add constraint places_price_level_range
  check (price_level is null or (price_level >= 0 and price_level <= 4));

alter table places drop constraint if exists places_photo_refs_max;
alter table places add constraint places_photo_refs_max
  check (photo_refs is null or array_length(photo_refs, 1) <= 10);

-- ----------------------------------------------------
-- 2. İNDEKSLER
-- ----------------------------------------------------

-- Harita bbox sorguları (ileride "bu bölgede ara").
create index if not exists idx_places_coords
  on places (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Faz 3 içerik tabanlı öneri: "benzer types'a sahip mekanlar".
-- Şimdi eklemek bedava, sonra eklemek tablo yeniden taraması.
create index if not exists idx_places_types
  on places using gin (types);

-- Bayat satır taraması.
create index if not exists idx_places_fetched_at
  on places (fetched_at);

-- Faz 3 şehir filtresi.
create index if not exists idx_places_city
  on places (city)
  where city is not null;

-- ----------------------------------------------------
-- 3. updated_at TRIGGER
-- ----------------------------------------------------
-- Fonksiyon supabase_schema.sql'de zaten var; `create or replace` ile
-- birebir aynısını yazmak bu migration'ı tek başına çalıştırılabilir yapar.

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on places;
create trigger set_updated_at
  before update on places
  for each row execute procedure update_updated_at_column();

-- ----------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------
--
-- places PAYLAŞILAN bir tablo: herkes okur, herkes yazar. Anon key JS
-- bundle'ında gömülü olduğu için "authenticated herkes UPDATE edebilir"
-- politikası, bir mekanın adını çöple değiştirmeye açık bir yüzey olurdu.
--
-- Bu yüzden: SELECT serbest, ama INSERT/UPDATE/DELETE politikası HİÇ YOK.
-- RLS açıkken politikası olmayan işlem reddedilir → istemci doğrudan yazamaz.
-- Tek yazma yolu aşağıdaki upsert_place() fonksiyonu.

alter table places enable row level security;

-- Okuma serbest — profiles ve user_rankings'te de böyle, tutarlı.
drop policy if exists "Places are viewable by everyone" on places;
create policy "Places are viewable by everyone"
  on places for select using (true);

-- INSERT / UPDATE / DELETE politikası bilinçli olarak yok. Ekleme.

-- ----------------------------------------------------
-- 5. upsert_place() — tek yazma yolu
-- ----------------------------------------------------
--
-- `security definer`: RLS'i bypass eder, tabloya politika olmadan yazabilir.
-- `set search_path` ZORUNLU — sabitlenmezse security definer fonksiyonlar
-- search_path hijacking'e açık kalır (Supabase güvenlik denetiminin
-- işaretlediği bilinen bir yüzey).
--
-- Doğrulama felsefesi:
--   place_id / name boş  → RAISE. Saklanacak anlamlı bir şey yok, bu bir bug.
--   diğer alanlar bozuk  → NULL'a çevir + RAISE WARNING. Bozuk bir koordinat
--                          yüzünden puan kaydını düşürmek istemiyoruz;
--                          koordinat zaten nullable, harita bunu kaldırıyor.
--
-- p_price_level ve p_user_ratings_total `integer`: PostgREST'in JSON sayıyı
-- smallint'e çözmesine güvenmek yerine burada cast ediyoruz.

create or replace function upsert_place(
  p_place_id           text,
  p_name               text,
  p_formatted_address  text                  default null,
  p_latitude           double precision      default null,
  p_longitude          double precision      default null,
  p_types              text[]                default null,
  p_google_rating      numeric               default null,
  p_user_ratings_total integer               default null,
  p_price_level        integer               default null,
  p_photo_refs         text[]                default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_place_id text := btrim(coalesce(p_place_id, ''));
  v_name     text := btrim(coalesce(p_name, ''));
  v_lat      double precision := p_latitude;
  v_lng      double precision := p_longitude;
  v_rating   numeric := p_google_rating;
  v_price    smallint;
  v_types    text[];
  v_photos   text[];
begin
  -- ── Reddedilen girdiler ───────────────────────────────────────────────────
  if v_place_id = '' then
    raise exception 'upsert_place: place_id boş olamaz';
  end if;

  if v_name = '' then
    raise exception 'upsert_place: name boş olamaz (place_id: %)', v_place_id;
  end if;

  if length(v_name) > 300 then
    v_name := left(v_name, 300);
    raise warning 'upsert_place: name 300 karaktere kısaltıldı (%)', v_place_id;
  end if;

  -- ── Toleransla düzeltilen girdiler ────────────────────────────────────────

  -- Koordinat yalnızca çift olarak anlamlı; biri bozuksa ikisini de düşür.
  if v_lat is null or v_lng is null
     or v_lat < -90 or v_lat > 90
     or v_lng < -180 or v_lng > 180 then
    if v_lat is not null or v_lng is not null then
      raise warning 'upsert_place: geçersiz koordinat, null yazılıyor (%)', v_place_id;
    end if;
    v_lat := null;
    v_lng := null;
  end if;

  if v_rating is not null and (v_rating < 0 or v_rating > 5) then
    raise warning 'upsert_place: google_rating aralık dışı, null yazılıyor (%)', v_place_id;
    v_rating := null;
  end if;

  if p_price_level is not null and p_price_level between 0 and 4 then
    v_price := p_price_level::smallint;
  else
    if p_price_level is not null then
      raise warning 'upsert_place: price_level aralık dışı, null yazılıyor (%)', v_place_id;
    end if;
    v_price := null;
  end if;

  -- Boş/null elemanları at, makul bir üst sınıra kırp.
  select array_agg(t order by ord)
    into v_types
    from (
      select t, ord
        from unnest(coalesce(p_types, '{}'::text[])) with ordinality as u(t, ord)
       where t is not null and btrim(t) <> ''
       limit 30
    ) s;

  select array_agg(t order by ord)
    into v_photos
    from (
      select t, ord
        from unnest(coalesce(p_photo_refs, '{}'::text[])) with ordinality as u(t, ord)
       where t is not null and btrim(t) <> ''
       limit 10
    ) s;

  -- ── Upsert ────────────────────────────────────────────────────────────────
  --
  -- Alanlar düz üzerine yazılıyor: uygulama tek bir alan maskesi kullanıyor
  -- (places.ts → PLACE_DETAIL_FIELDS), yani her çağrı tam veri gönderir.
  -- İSTİSNA koordinat: elimizde bilinen bir koordinat varken üzerine null
  -- yazmak harita pin'ini kaybettirir. Onu coalesce ile koruyoruz.
  insert into places as p (
    place_id, name, formatted_address, latitude, longitude,
    types, google_rating, user_ratings_total, price_level, photo_refs,
    fetched_at
  )
  values (
    v_place_id, v_name, nullif(btrim(coalesce(p_formatted_address, '')), ''),
    v_lat, v_lng,
    v_types, v_rating, p_user_ratings_total, v_price, v_photos,
    now()
  )
  on conflict (place_id) do update set
    name               = excluded.name,
    formatted_address  = excluded.formatted_address,
    latitude           = coalesce(excluded.latitude,  p.latitude),
    longitude          = coalesce(excluded.longitude, p.longitude),
    types              = excluded.types,
    google_rating      = excluded.google_rating,
    user_ratings_total = excluded.user_ratings_total,
    price_level        = excluded.price_level,
    photo_refs         = excluded.photo_refs,
    fetched_at         = now();
end;
$$;

-- anon (giriş yapmamış istemci) yazamaz; yalnızca oturumu olan kullanıcı.
revoke execute on function upsert_place(
  text, text, text, double precision, double precision,
  text[], numeric, integer, integer, text[]
) from anon, public;

grant execute on function upsert_place(
  text, text, text, double precision, double precision,
  text[], numeric, integer, integer, text[]
) to authenticated;

-- ----------------------------------------------------
-- 6. MEVCUT KAYITLARIN BACKFILL'İ
-- ----------------------------------------------------
--
-- user_rankings'te zaten olan veriyi taşıyoruz — Google'a HİÇ istek atmıyoruz.
--
-- `distinct on` + `order by place_id, updated_at desc`: aynı mekana birden
-- fazla kullanıcı puan verdiyse en taze satırı seçer.
--
-- fetched_at = 'epoch': bu veri Google'dan ne zaman çekildi bilinmiyor ve
-- types / formatted_address / google_rating / price_level alanları boş.
-- now() yazmak yalan olurdu; epoch yazmak satırı "bayat" işaretler ve
-- uygulamanın ilk okumasında normal yenileme yolu bunları doldurur.

insert into places (
  place_id, name, latitude, longitude, photo_refs, fetched_at
)
select distinct on (place_id)
  place_id,
  restaurant_name,
  latitude,
  longitude,
  case
    when photo_reference is not null and btrim(photo_reference) <> ''
      then array[photo_reference]
  end,
  'epoch'::timestamptz
from user_rankings
where place_id is not null
  and btrim(place_id) <> ''
  and btrim(coalesce(restaurant_name, '')) <> ''
order by place_id, updated_at desc
on conflict (place_id) do nothing;

-- ====================================================
-- KONTROL — bu iki sorguyu da çalıştır:
--
--   -- 1) Satırlar geldi mi, bayat mı işaretlendi mi?
--   select place_id, name, latitude, longitude,
--          array_length(photo_refs, 1) as foto_sayisi,
--          fetched_at
--   from places
--   order by name;
--
--   -- 2) user_rankings'te places'e taşınmamış satır kaldı mı? (0 dönmeli)
--   select count(*) as tasinmayan
--   from user_rankings ur
--   where not exists (
--     select 1 from places p where p.place_id = ur.place_id
--   );
-- ====================================================
