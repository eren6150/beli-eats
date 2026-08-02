-- ====================================================
-- Beli Eats — Supabase Database Schema
-- Supabase SQL Editor'a kopyalayıp çalıştır
-- ====================================================
--
-- SIFIRDAN KURULUM SIRASI:
--   1. bu dosya (profiles, user_rankings, follows + RLS)
--   2. supabase_migration_001_coords.sql        → user_rankings koordinat kolonları
--   3. supabase_migration_002_places.sql        → paylaşılan `places` cache + upsert_place()
--   4. supabase_migration_003_places_fk.sql     → user_rankings.place_id FK
--   5. supabase_migration_004_profile_fields.sql → profiles.full_name / bio / updated_at
--   6. supabase_migration_005_lists.sql         → lists + list_items (Faz 2)
--   7. supabase_migration_006_reorder_list_items.sql → reorder_list_items() RPC
--
-- Migration'ların DDL'i bilinçli olarak buraya kopyalanmıyor: iki kopya
-- tutmak RLS/fonksiyon tanımlarında sessiz drift demek. Kaynak, migration
-- dosyalarının kendisi.

-- ----------------------
-- 1. PROFILES TABLE
-- ----------------------
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup (optional trigger)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------
-- 2. USER_RANKINGS TABLE
-- ----------------------
create table if not exists user_rankings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  place_id text not null,
  restaurant_name text not null,
  rating numeric(2,1) check (rating >= 0.5 and rating <= 5.0) not null,
  rank_index integer not null default 0,
  review_text text,
  photo_reference text,
  -- Google Place Details'ten gelen koordinat cache'i (bkz. migration 001).
  -- Nullable: eski satırlarda yok, uygulama gerektiğinde backfill eder.
  latitude  double precision check (latitude is null or (latitude >= -90 and latitude <= 90)),
  longitude double precision check (longitude is null or (longitude >= -180 and longitude <= 180)),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, place_id)
);

-- Index for fast ordering
create index if not exists idx_user_rankings_user_rank 
  on user_rankings(user_id, rank_index);

create index if not exists idx_user_rankings_rating
  on user_rankings(rating desc);

create index if not exists idx_user_rankings_coords
  on user_rankings (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on user_rankings;
create trigger set_updated_at
  before update on user_rankings
  for each row execute procedure update_updated_at_column();

-- ----------------------
-- 3. FOLLOWS TABLE
-- ----------------------
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

create index if not exists idx_follows_follower on follows(follower_id);
create index if not exists idx_follows_following on follows(following_id);

-- ====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================

-- Profiles
alter table profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- User Rankings
alter table user_rankings enable row level security;

create policy "Rankings are viewable by everyone"
  on user_rankings for select using (true);

create policy "Users can insert own rankings"
  on user_rankings for insert with check (auth.uid() = user_id);

create policy "Users can update own rankings"
  on user_rankings for update using (auth.uid() = user_id);

create policy "Users can delete own rankings"
  on user_rankings for delete using (auth.uid() = user_id);

-- Follows
alter table follows enable row level security;

create policy "Follows are viewable by everyone"
  on follows for select using (true);

create policy "Users can manage own follows"
  on follows for insert with check (auth.uid() = follower_id);

create policy "Users can delete own follows"
  on follows for delete using (auth.uid() = follower_id);

-- ====================================================
-- DONE! 
-- Tabloları Supabase Dashboard → Table Editor'da görebilirsin.
-- ====================================================
