-- ====================================================
-- Migration 003 — user_rankings.place_id → places.place_id FK
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 002 çalışmış olmalı.
-- ====================================================
--
-- NEDEN AYRI DOSYA:
-- Bu FK migration 002 ile birlikte konulamazdı. O anda yazma yolu
-- (useRankings.addOrUpdateRanking) doğrudan user_rankings'e yazıyordu ve
-- `places`'te karşılığı olmayan bir mekana puan vermek anında kırılırdı.
-- RestaurantDetailScreen artık okuma yolunda cache satırını yazıyor
-- (resolvePlace) ve handleSave satır yokken kaydı bloklyor — FK artık güvenli.
--
-- FK'NIN GETİRDİĞİ İKİ ŞEY:
--   1. Referans bütünlüğü: puanı olan her mekanın cache satırı var.
--   2. PostgREST gömülü sorgusu: `select '*, places(*)'` ancak FK varken
--      çalışır. Harita adımı (sonraki) bunu kullanacak.

-- ----------------------------------------------------
-- 1. ÖN KONTROL
-- ----------------------------------------------------
-- FK'yı doğrudan eklemek de yeterdi (ihlal varsa ALTER patlar), ama Postgres'in
-- ham hata mesajı ne yapılacağını söylemiyor. Bu blok sebebi ve çözümü yazıyor.

do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
  from user_rankings ur
  where not exists (
    select 1 from places p where p.place_id = ur.place_id
  );

  if v_orphans > 0 then
    raise exception
      'FK konulamaz: places tablosunda karsiligi olmayan % adet user_rankings satiri var. Migration 002 icindeki backfill blogunu tekrar calistir, sonra buraya don.',
      v_orphans;
  end if;
end $$;

-- ----------------------------------------------------
-- 2. REFERANS EDEN KOLONA İNDEKS
-- ----------------------------------------------------
--
-- Postgres FK'nın referans EDEN tarafına otomatik indeks açmaz. Bu indeks
-- olmadan üç şey tablo taraması yapar:
--   - PostgREST'in places(*) gömülü sorgusu
--   - `on delete restrict` kontrolü (bir places satırı silinmeye çalışıldığında)
--   - "bu mekanı kimler puanladı" (detay ekranı / Faz 3 leaderboard)
--
-- Mevcut unique(user_id, place_id) indeksi bu işi YAPAMAZ: user_id önde
-- olduğu için tek başına place_id ile arama o indeksi kullanamıyor.

create index if not exists idx_user_rankings_place_id
  on user_rankings (place_id);

-- ----------------------------------------------------
-- 3. FOREIGN KEY
-- ----------------------------------------------------
--
-- on update cascade: Google place ID'lerin değişebileceğini belgeliyor.
--   places üzerinde tek UPDATE ile yeni ID her yere yayılır — primary key
--   olarak uuid değil place_id seçmenin bedelini bu satır ödüyor.
--
-- on delete restrict: bir places satırını silmek, ona bağlı puanları sessizce
--   yok etmesin. Cache satırı silinecekse önce puanların ne olacağına karar
--   verilmeli — bu bilinçli bir engel.

alter table user_rankings
  drop constraint if exists user_rankings_place_fk;

alter table user_rankings
  add constraint user_rankings_place_fk
  foreign key (place_id) references places (place_id)
  on update cascade
  on delete restrict;

-- ----------------------------------------------------
-- 4. POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
--
-- PostgREST tablolar arası ilişkileri bellekteki şema cache'inden okur.
-- Supabase bunu DDL sonrası genelde kendisi yeniliyor ama gecikebiliyor —
-- o aralıkta `places(*)` gömülü sorgusu FK var olduğu halde
-- "Could not find a relationship between user_rankings and places" döner.
-- Bu satır yenilemeyi hemen tetikler.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — bu üç sorguyu çalıştır:
--
--   -- 1) FK gerçekten kuruldu mu?
--   select conname, confupdtype, confdeltype
--   from pg_constraint
--   where conname = 'user_rankings_place_fk';
--   -- confupdtype = 'c' (cascade), confdeltype = 'r' (restrict) olmalı
--
--   -- 2) İndeks var mı?
--   select indexname from pg_indexes
--   where tablename = 'user_rankings' and indexname = 'idx_user_rankings_place_id';
--
--   -- 3) FK gerçekten koruyor mu? Bu HATA VERMELİ:
--   --    "violates foreign key constraint user_rankings_place_fk"
--   insert into user_rankings (user_id, place_id, restaurant_name, rating)
--   select user_id, 'BOYLE_BIR_PLACE_ID_YOK', 'FK testi', 4.0
--   from user_rankings limit 1;
-- ====================================================
