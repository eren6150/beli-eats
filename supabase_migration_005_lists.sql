-- ====================================================
-- Migration 005 — lists + list_items (Faz 2, adım 1)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 002 (places) çalışmış olmalı.
-- ====================================================
--
-- NEDEN:
-- Faz 2'nin ilk ayağı: kullanıcının kendi koleksiyonları. Letterboxd'un
-- listeleri gibi — "Ankara'da en iyi kahvaltı", "Gidilecekler", "2026 favorileri".
--
-- İKİ TABLO, ÇÜNKÜ:
--   lists      → koleksiyonun kendisi (başlık, açıklama, sıralı mı)
--   list_items → koleksiyonun içindeki mekanlar (mekan + sıra)
-- Bir listede N mekan var ve aynı mekan N listede olabilir; bu bir çoka-çok
-- ilişki, ara tablo şart.
--
-- `place_id` YİNE places'e FK (migration 003'teki ile birebir aynı davranış:
-- on update cascade / on delete restrict). Yani bir listeye eklenen her mekanın
-- `places` cache satırı OLMAK ZORUNDA — uygulama tarafında bu, "listeye ekle"
-- akışının önce `resolvePlace()` çağırması demek.
--
-- BU MIGRATION'A BİLİNÇLİ OLARAK GİRMEYEN İKİ ŞEY:
--   • `is_public` (liste gizliliği). Şu an şemadaki her tablo herkese açık
--     (`select using (true)`). Gizlilik, Faz 3'ün sosyal katmanıyla iç içe
--     geçen bir UI + RLS kararı; bugün eklemek kullanılmayan bir kolon ve
--     üstüne inşa edilmemiş bir sözleşme olurdu. Sonradan eklemek ucuz:
--     `add column` + iki politikanın yeniden yazımı, veri migration'ı yok.
--   • `list_items.note` (öğe başına not). `diary_entries.note` zaten planlı ve
--     ikisinin rolü netleşmeden eklemek rol çakışması riski taşıyor.

-- ----------------------------------------------------
-- 1. lists TABLOSU
-- ----------------------------------------------------
--
-- Primary key uuid (places'teki gibi doğal anahtar DEĞİL): listenin doğal bir
-- kimliği yok, başlık değişebilir ve tekrarlanabilir. user_rankings ile aynı desen.

create table if not exists lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,

  title       text not null,
  description text,

  -- Sıralı mı? VERİTABANI TARAFINDA HİÇBİR ŞEYİ DEĞİŞTİRMİYOR — `position`
  -- her iki durumda da doluyor. Bu yalnızca arayüzün sözleşmesi:
  --   true  → sıra numarası gösterilir, sürükle-bırak açılır
  --   false → eklenme sırasına göre, numarasız çizilir
  -- Kolonun burada olmasının sebebi: sıralılık listenin KALICI bir özelliği,
  -- görüntüleme tercihi değil. Kullanıcı listeyi oluştururken seçiyor.
  is_ordered  boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Kısıtlar ayrı ALTER'larda: `create table if not exists` tabloyu bulursa
-- inline kısıtları uygulamaz, bu blok ise tekrar çalıştırılabilir.
-- (Migration 002'deki aynı gerekçe.)

alter table lists drop constraint if exists lists_title_length;
alter table lists add constraint lists_title_length
  check (length(btrim(title)) between 1 and 100);

alter table lists drop constraint if exists lists_description_length;
alter table lists add constraint lists_description_length
  check (description is null or length(description) <= 500);

-- ----------------------------------------------------
-- 2. list_items TABLOSU
-- ----------------------------------------------------

create table if not exists list_items (
  id         uuid primary key default gen_random_uuid(),

  list_id    uuid not null,
  place_id   text not null,

  -- DEFAULT YOK — bilinçli, aşağıdaki trigger dolduruyor. Gerekçe §3'te.
  position   integer not null,

  created_at timestamptz not null default now()
);

-- Kısıtlar ve FK'lar tabloya ayrı ALTER'larla ekleniyor. İki sebeple:
--   1. `create table if not exists` tabloyu bulursa inline tanımları UYGULAMAZ —
--      bu blok ise tekrar çalıştırılabilir (migration 002'deki aynı gerekçe).
--   2. Kısıtlara açık isim veriyoruz; Postgres'in otomatik isimlendirmesine
--      bel bağlamak kontrol sorgularını kırılgan yapar.

-- Liste silinince öğeleri de gider. Burada `restrict` anlamsız olurdu:
-- öğeler listenin parçası, bağımsız bir varlık değil.
alter table list_items drop constraint if exists list_items_list_fk;
alter table list_items add constraint list_items_list_fk
  foreign key (list_id) references lists (id)
  on delete cascade;

-- Migration 003'teki FK ile AYNI davranış:
--   on update cascade  → Google place_id değişirse tek UPDATE her yere yayılır
--   on delete restrict → cache satırını silmek listeleri sessizce bozmasın
alter table list_items drop constraint if exists list_items_place_fk;
alter table list_items add constraint list_items_place_fk
  foreign key (place_id) references places (place_id)
  on update cascade
  on delete restrict;

-- Aynı mekan bir listede iki kez olamaz.
alter table list_items drop constraint if exists list_items_unique_place;
alter table list_items add constraint list_items_unique_place
  unique (list_id, place_id);

-- NOT: `updated_at` YOK. Bir list_item'ın değişebilen tek alanı `position` ve
-- yeniden sıralama tek seferde onlarca satırı güncelliyor — her birine
-- "güncellendi" damgası vurmak anlamsız bir yazma yükü. Listenin kendisi
-- (`lists.updated_at`) zaten değişimi izliyor.

-- ----------------------------------------------------
-- 3. position TRIGGER'ı
-- ----------------------------------------------------
--
-- NEDEN DEFAULT DEĞİL DE TRIGGER:
-- Bu projede TAM OLARAK bu hata bir kez yaşandı. `user_rankings.rank_index`
-- `default 0` ile duruyordu ve yerel state'ten hesaplanıyordu; liste boşken
-- sessizce 0'a düşüp sıralamayı bozuyordu — veri kaybıydı.
-- `position integer not null default 0` aynı tuzağı yeniden kurardı: istemci
-- kolonu göndermeyi unuttuğu anda HER öğe 0 olur ve sıra tamamen kaybolur,
-- üstelik hiçbir hata vermeden.
--
-- Trigger ile sıra VERİTABANINDA belirleniyor: istemci `position` kolonunu hiç
-- göndermez (veya null gönderir), trigger o listenin son sırasının bir fazlasını
-- yazar. Tek round-trip, atomik, atlanması mümkün değil.
--
-- `not null` kolona null yazılabilmesinin sebebi: Postgres'te BEFORE trigger'lar
-- kısıt kontrollerinden ÖNCE çalışır. Trigger değeri doldurduğunda NOT NULL
-- kontrolü artık dolu değeri görüyor.
--
-- YARIŞ DURUMU: aynı listeye iki eşzamanlı ekleme aynı `position`'ı üretebilir.
-- Bilinçli olarak kilitlemiyoruz — bu tek kullanıcının kendi listesi, senaryo
-- pratikte yok; olsa bile sonuç zararsız çünkü okuma `order by position,
-- created_at` yapıyor, ikinci anahtar kararı veriyor. Kilit almanın maliyeti
-- önlediği soruna değmez.
--
-- `set search_path` sabitleniyor — migration 002'deki upsert_place ile aynı
-- gerekçe (search_path hijacking'e karşı).

create or replace function public.set_list_item_position()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  if new.position is null then
    select coalesce(max(li.position), -1) + 1
      into v_next
      from list_items li
     where li.list_id = new.list_id;

    new.position := v_next;
  end if;

  return new;
end;
$$;

drop trigger if exists set_position on list_items;
create trigger set_position
  before insert on list_items
  for each row execute procedure public.set_list_item_position();

-- ----------------------------------------------------
-- 4. lists.updated_at TRIGGER'ı
-- ----------------------------------------------------
-- Fonksiyon supabase_schema.sql, migration 002 ve 004'te zaten var; `create or
-- replace` ile birebir aynısını yazmak bu migration'ı tek başına
-- çalıştırılabilir yapar.

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on lists;
create trigger set_updated_at
  before update on lists
  for each row execute procedure update_updated_at_column();

-- ----------------------------------------------------
-- 5. İNDEKSLER
-- ----------------------------------------------------

-- "Listelerim" sekmesi: kullanıcının listeleri, en yenisi üstte.
create index if not exists idx_lists_user
  on lists (user_id, created_at desc);

-- Liste içeriğini sırayla çizmek. `position` tek başına yetmez — sorgu daima
-- tek bir listeyi okuyor, o yüzden list_id önde.
create index if not exists idx_list_items_list_position
  on list_items (list_id, position);

-- MİGRATION 003'ÜN DERSİ: Postgres, FK'nın referans EDEN tarafına otomatik
-- indeks AÇMAZ. Bu indeks olmadan üç şey tablo taraması yapar:
--   - `on delete restrict` kontrolü (bir places satırı silinmeye çalışıldığında)
--   - PostgREST'in `places(*)` gömülü sorgusu
--   - "bu mekan hangi listelerde" (Faz 2'nin mekan sayfası)
-- Mevcut unique(list_id, place_id) indeksi bu işi YAPAMAZ: list_id önde olduğu
-- için tek başına place_id ile arama o indeksi kullanamıyor.
create index if not exists idx_list_items_place_id
  on list_items (place_id);

-- ----------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------
--
-- profiles / user_rankings / follows / places ile TUTARLI:
-- okuma herkese açık, yazma yalnızca sahibine.

alter table lists      enable row level security;
alter table list_items enable row level security;

-- ── lists ─────────────────────────────────────────────────────────────────

drop policy if exists "Lists are viewable by everyone" on lists;
create policy "Lists are viewable by everyone"
  on lists for select using (true);

drop policy if exists "Users can insert own lists" on lists;
create policy "Users can insert own lists"
  on lists for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own lists" on lists;
create policy "Users can update own lists"
  on lists for update using (auth.uid() = user_id)
  -- `with check` de gerekli: `using` HANGİ satırın güncellenebileceğini
  -- söylüyor, `with check` satırın YENİ halini denetliyor. Olmadan kullanıcı
  -- kendi listesinin user_id'sini başkasına atayabilirdi.
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own lists" on lists;
create policy "Users can delete own lists"
  on lists for delete using (auth.uid() = user_id);

-- ── list_items ────────────────────────────────────────────────────────────
--
-- Bu tabloda `user_id` YOK ve olmamalı. Denormalize etmek RLS'i basitleştirirdi
-- ama bu projede denormalize kolonlar zaten pişmanlık kaynağı: user_rankings'in
-- restaurant_name / latitude / longitude / photo_reference kolonlarının dördü de
-- `places` geldikten sonra ölü veri oldu ve düşürülmeyi bekliyor.
--
-- Sahiplik EBEVEYN LİSTE üzerinden doğrulanıyor. `lists.id` birincil anahtar
-- olduğu için bu alt sorgu satır başına tek bir indeks araması.

drop policy if exists "List items are viewable by everyone" on list_items;
create policy "List items are viewable by everyone"
  on list_items for select using (true);

drop policy if exists "Users can insert items into own lists" on list_items;
create policy "Users can insert items into own lists"
  on list_items for insert with check (
    exists (
      select 1 from lists l
       where l.id = list_id
         and l.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update items in own lists" on list_items;
create policy "Users can update items in own lists"
  on list_items for update using (
    exists (
      select 1 from lists l
       where l.id = list_id
         and l.user_id = auth.uid()
    )
  )
  -- `with check` olmadan kullanıcı kendi listesindeki bir öğenin `list_id`'sini
  -- BAŞKASININ listesine taşıyabilirdi: `using` eski satıra bakıyor, o kendi
  -- listesi olduğu için geçerdi.
  with check (
    exists (
      select 1 from lists l
       where l.id = list_id
         and l.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete items from own lists" on list_items;
create policy "Users can delete items from own lists"
  on list_items for delete using (
    exists (
      select 1 from lists l
       where l.id = list_id
         and l.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------
-- 7. POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
--
-- İki katlı gömülü sorgu (`lists → list_items → places`) ancak PostgREST
-- bellekteki şema cache'ini yeniledikten sonra çalışır. Supabase bunu DDL
-- sonrası genelde kendisi yeniliyor ama gecikebiliyor — o aralıkta sorgu,
-- FK'lar var olduğu halde "Could not find a relationship" döner.

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
--   -- 1) Tablolar ve kolonlar geldi mi?
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name in ('lists', 'list_items')
--   order by table_name, ordinal_position;
--
--   -- 2) FK'lar doğru davranışta mı?
--   select conname, confupdtype, confdeltype
--   from pg_constraint
--   where conname in ('list_items_list_fk', 'list_items_place_fk');
--   -- list_items_list_fk  → confdeltype = 'c' (cascade)
--   -- list_items_place_fk → confupdtype = 'c' (cascade), confdeltype = 'r' (restrict)
--
--   -- 3) İndeksler:
--   select indexname from pg_indexes
--   where tablename in ('lists', 'list_items')
--   order by indexname;
--
--   -- 4) position TRIGGER'ı çalışıyor mu?
--   --    Kendine bir test listesi aç ve puanladığın mekanları sırayla ekle.
--   --    `position` kolonunu HİÇ GÖNDERMİYORUZ — 0,1,2... gelmeli.
--   insert into lists (user_id, title, is_ordered)
--   values (auth.uid(), 'Trigger testi', true);
--
--   insert into list_items (list_id, place_id)
--   select l.id, ur.place_id
--   from lists l, user_rankings ur
--   where l.title = 'Trigger testi' and l.user_id = auth.uid()
--     and ur.user_id = auth.uid()
--   limit 3;
--
--   select li.position, p.name
--   from list_items li
--   join lists l on l.id = li.list_id
--   join places p on p.place_id = li.place_id
--   where l.title = 'Trigger testi' and l.user_id = auth.uid()
--   order by li.position;
--   -- position 0,1,2 olmalı — hepsi 0 ise trigger çalışmıyor demektir.
--
--   -- 5) FK gerçekten koruyor mu? Bu HATA VERMELİ:
--   --    "violates foreign key constraint"
--   insert into list_items (list_id, place_id)
--   select id, 'BOYLE_BIR_PLACE_ID_YOK' from lists
--   where title = 'Trigger testi' and user_id = auth.uid();
--
--   -- 6) Aynı mekanı iki kez eklemek HATA VERMELİ:
--   --    "duplicate key value violates unique constraint list_items_unique_place"
--   insert into list_items (list_id, place_id)
--   select li.list_id, li.place_id from list_items li
--   join lists l on l.id = li.list_id
--   where l.title = 'Trigger testi' and l.user_id = auth.uid()
--   limit 1;
--
--   -- 7) Cascade çalışıyor mu? Test listesini sil, öğeleri de gitmeli.
--   delete from lists where title = 'Trigger testi' and user_id = auth.uid();
--   select count(*) as kalan_ogeler from list_items li
--   where not exists (select 1 from lists l where l.id = li.list_id);
--   -- 0 dönmeli
-- ====================================================
