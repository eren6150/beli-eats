-- =====================================================================
-- MIGRATION 024 — KULLANICI ENGELLEME (`blocks`)
-- =====================================================================
--
-- Dalga 4 / Faz A. Arayüz ve istemci filtresi (Faz B-C-D) AYNI TURDA
-- sahaya inmeli — bu dosya tek başına giderse engelleme "yapıldı" görünür
-- ama hiçbir şey gizlenmez.
--
-- ── 🔑 ÖNCE EN ÖNEMLİ KARAR: BU BİR GÜVENLİK SINIRI DEĞİL ────────────
-- Sosyal tabloların hepsi `select using (true)` ve anon key JS bundle'ının
-- içinde. Yani engellenen bir kullanıcı uygulamayı hiç kullanmadan, düz bir
-- REST çağrısıyla puanları/notları/fotoğrafları okumaya devam edebilir.
--
-- Bu yüzden GÖRÜNÜRLÜK filtresi RLS'e KONMUYOR: 8 tablonun `using (true)`
-- politikasını `not exists (...)` ile yeniden yazmak, her okumaya alt sorgu
-- bindirip karşılığında SAHTE bir güvence verirdi. Görünürlük istemcide
-- filtreleniyor (Faz C) ve gizlilik metni bunun zorlanamadığını açıkça
-- yazıyor.
--
-- RLS'e konan şey ETKİLEŞİM: engellenen kişi TAKİP EDEMEZ ve BEĞENEMEZ.
-- Bu gerçekten zorlanabilir, o yüzden zorlanıyor.
--
-- ── 🚩 PGRST201 — ZORUNLU KONTROL YAPILDI ────────────────────────────
-- `blocks` DÖRDÜNCÜ ara tablo (iki FK + bunlardan oluşan PK):
--   follows (profiles↔profiles) · entry_likes (diary_entries↔profiles) ·
--   photo_reports (place_photos↔profiles) · blocks (profiles↔profiles)
--
-- Belirsizleşebilecek TEK sınıf `from('profiles')` içinde `profiles(...)`
-- gömen sorgular. Kontrol edildi:
--     grep -rn -A6 "from('profiles')" src/ | grep "profiles("
--   → TEMİZ, böyle bir sorgu YOK.
--
-- 🔑 Daha güçlü kanıt: `follows` ZATEN profiles↔profiles ara tablosu ve
-- bugün çalışıyor. Bu şekildeki bir ara tablonun mevcut gömülü sorguları
-- kırmadığı sahada ispatlı; `blocks` aynı şekli tekrarlıyor.
--
-- ⚠️ İzlenecek tek yer: `HomeScreen.tsx` → `from('user_rankings')` içinde
-- AYRIŞTIRILMAMIŞ `profiles(id, username, avatar_url)`. Bugün doğru (o yolda
-- tek FK var) ve `blocks` onu etkilemiyor, ama listede kalsın.
-- =====================================================================


-- ----------------------------------------------------
-- 1. Tablo
-- ----------------------------------------------------
--
-- `profiles`'a FK, `auth.users`'a DEĞİL — şemadaki diğer tabloların kuralı.
-- `on delete cascade`: hesap silinince engel kayıtları da gidiyor (hesap
-- silme zaten profiles'a giden sekiz FK'nın hepsinde cascade'e dayanıyor;
-- bu DOKUZUNCUSU olacak, `delete-account` fonksiyonu değişmiyor).

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- Kendini engellemek anlamsız ve arayüzde imkânsız; yine de şemada
-- kapatılıyor. ⚠️ `entry_likes`'ta YAPILAMAYAN şey burada YAPILABİLİYOR,
-- çünkü kontrol aynı satırın iki kolonu arasında — başka tabloya bakmıyor.
alter table blocks drop constraint if exists blocks_not_self;
alter table blocks add constraint blocks_not_self
  check (blocker_id <> blocked_id);

-- PK'nin öndeki kolonu `blocker_id`, yani "kimleri engelledim" indeksli.
-- "Beni kim engelledi" TERS yön ve PK onu karşılamıyor — istemci simetrik
-- gizleme için o yönü de okuyor.
create index if not exists idx_blocks_blocked_id on blocks (blocked_id);


-- ----------------------------------------------------
-- 2. RLS — blocks
-- ----------------------------------------------------

alter table blocks enable row level security;

-- ⚠️ SELECT İKİ TARAFA DA AÇIK — bilinçli bir TAKAS.
--
-- Simetrik gizleme istemcide yapılıyor. Engellenen kişinin istemcisinin
-- engelleyeni GİZLEYEBİLMESİ için o satırı OKUYABİLMESİ gerekiyor;
-- okuyamazsa gizleyemez ve "o beni görmez" hiç çalışmaz.
--
-- Bedeli: engellenen kişi, sorgulayarak engellendiğini ANLAYABİLİR. Kabul
-- edildi, çünkü zaten anlayacak — engelleyenin profili ona "Bulunamadı"
-- dönüyor (ürün kararı) ve içeriği akışından kayboluyor. Instagram bunu
-- gizlemeye çalışıyor; biz gizleyemeyiz, o yüzden gizliyormuş gibi
-- yapmıyoruz.
--
-- 🔑 Bu politika ETKİLEŞİM ZORLAMASININ ön koşulu DEĞİL: aşağıdaki
-- restrictive politikalar `is_blocked_pair()` üzerinden çalışıyor ve o
-- fonksiyon `security definer`, yani RLS'i bypass ediyor. Ayrım kasıtlı —
-- zorlama, görünürlük politikasının bir gün değişmesine BAĞLI OLMAMALI.
drop policy if exists "Blocks are viewable by both parties" on blocks;
create policy "Blocks are viewable by both parties"
  on blocks for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

-- Yalnızca kendi adına engelleyebilir.
drop policy if exists "Users can block as themselves" on blocks;
create policy "Users can block as themselves"
  on blocks for insert
  with check (auth.uid() = blocker_id);

-- Engeli YALNIZCA koyan kaldırabilir. `entry_likes`'ın "kendi beğenini sil"
-- politikasının aksine burada satırın sahibi `blocker_id`.
drop policy if exists "Users can remove own blocks" on blocks;
create policy "Users can remove own blocks"
  on blocks for delete
  using (auth.uid() = blocker_id);

-- UPDATE politikası YOK: güncellenecek alan yok (engel ya var ya yok).


-- ----------------------------------------------------
-- 3. is_blocked_pair() — etkileşim zorlamasının tek kaynağı
-- ----------------------------------------------------
--
-- İki kullanıcı arasında HERHANGİ BİR YÖNDE engel var mı?
--
-- ── NEDEN `security definer` ──
-- Bu fonksiyon RLS POLİTİKALARININ İÇİNDEN çağrılıyor. Postgres, politika
-- ifadesindeki alt sorgulara da RLS uyguluyor; yani definer olmasaydı
-- `blocks` üzerindeki SELECT politikası zorlamanın kapsamını sessizce
-- belirlerdi. O politika bir gün daraltılırsa engelleme HİÇ HATA VERMEDEN
-- çalışmaz hale gelirdi — RLS reddinin "sessiz 0 satır" olduğu dersinin
-- (migration 019) bir başka yüzü.
--
-- `set search_path` ZORUNLU (migration 002'nin kuralı).
--
-- `stable`: tablo okuyor, `immutable` olamaz; ama aynı ifade içinde tekrar
-- çağrılırsa Postgres sonucu yeniden kullanabilir.

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from blocks
     where (blocker_id = p_a and blocked_id = p_b)
        or (blocker_id = p_b and blocked_id = p_a)
  );
$$;


-- ----------------------------------------------------
-- 4. Etkileşim kilidi — RESTRICTIVE politikalar
-- ----------------------------------------------------
--
-- ⚠️ PROJEDE İLK KEZ `as restrictive` KULLANILIYOR. Gerekçe:
--
-- Postgres permissive politikaları OR'luyor. Migration 019 bunu bir AVANTAJ
-- olarak kullanmıştı ("politikayı değiştirme, ikincisini EKLE" — çalışan bir
-- korumayı bir an bile ortadan kaldırmamak için). Ama burada istenen şey
-- GENİŞLETMEK değil DARALTMAK ve permissive bir politika eklemek tam tersini
-- yapardı: izinleri artırırdı.
--
-- `as restrictive` politikalar AND'leniyor. Böylece mevcut politikaya HİÇ
-- DOKUNMADAN bir koşul ekleniyor — 019'un "saf toplamalı" ilkesinin daraltma
-- yönündeki karşılığı. Mevcut politika `drop` edilmiyor, yani migration
-- yarıda kalsa bile `follows` bir an için korumasız kalmıyor.

-- (a) Engelli çift birbirini TAKİP EDEMEZ — iki yönde de.
--     A, B'yi engellediyse ne B A'yı takip edebilir ne A B'yi.
drop policy if exists "Blocked pairs cannot follow" on follows;
create policy "Blocked pairs cannot follow"
  on follows as restrictive for insert
  with check (not public.is_blocked_pair(follower_id, following_id));

-- (b) Engelli çift birbirinin ziyaretini BEĞENEMEZ.
--     `entry_likes` satırında yazarın kimliği YOK, o yüzden `diary_entries`
--     üzerinden çözülüyor. Beğeni tekil bir yazma, maliyeti önemsiz.
drop policy if exists "Blocked pairs cannot like" on entry_likes;
create policy "Blocked pairs cannot like"
  on entry_likes as restrictive for insert
  with check (
    not exists (
      select 1 from diary_entries e
       where e.id = entry_id
         and public.is_blocked_pair(e.user_id, auth.uid())
    )
  );

-- ⚠️ `photo_reports` BİLİNÇLİ OLARAK KİLİTLENMEDİ: şikayet bir moderasyon
-- kanalı ve engellenen birinin uygunsuz içerik bildirmesini engellemek,
-- korumak istediğimiz kişiyi korumasız bırakır.


-- ----------------------------------------------------
-- 5. block_user() — engelleme + takip temizliği, TEK transaction
-- ----------------------------------------------------
--
-- Engelleme İKİ İŞ yapıyor: satırı yazmak ve iki yöndeki takibi silmek.
-- İstemciden iki ayrı çağrı, arada kopan bağlantıda "engelledim ama hâlâ
-- takip ediyoruz" durumunu bırakırdı — `move_list_items`'ı doğuran
-- argümanın aynısı.
--
-- ── NEDEN `security definer` DEĞİL ──
-- migration 006'nın gerekçesi: `follows` üzerindeki DELETE politikaları
-- ZATEN yetiyor ve ikisi birlikte beni ilgilendiren satırların iki yönünü de
-- kapsıyor:
--     "Users can delete own follows"   → auth.uid() = follower_id
--     "Users can remove own followers" → auth.uid() = following_id  (019)
-- Çağıranın haklarıyla çalışmak hem yeterli hem ek bir güvenlik katmanı.

create or replace function public.block_user(p_blocked uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'block_user: oturum yok';
  end if;

  if p_blocked is null then
    raise exception 'block_user: p_blocked boş olamaz';
  end if;

  if v_me = p_blocked then
    raise exception 'block_user: kendini engelleyemezsin';
  end if;

  -- Zaten engellenmişse sessizce geç: engelleme İDEMPOTENT olmalı, çift
  -- dokunuş hata göstermemeli.
  insert into blocks (blocker_id, blocked_id)
  values (v_me, p_blocked)
  on conflict (blocker_id, blocked_id) do nothing;

  -- İKİ YÖN de siliniyor (ürün kararı). Tek yön silmek, engellenen kişinin
  -- akışında engelleyenin içeriğini görmeye devam etmesi demekti.
  delete from follows
   where (follower_id = v_me and following_id = p_blocked)
      or (follower_id = p_blocked and following_id = v_me);
end;
$$;

-- ⚠️ ENGELİ KALDIRMAK TAKİBİ GERİ GETİRMİYOR ve getirmemeli — "hangi takip
-- geri gelmeli" cevabı olmayan bir soru (migration 011'in reddettiği sınıf).
-- Kaldırma ayrı bir RPC istemiyor: `blocks` DELETE politikası yetiyor,
-- istemci düz `delete` atıyor.


-- =====================================================================
-- 6. DOĞRULAMA — panelde migration'dan SONRA
-- =====================================================================
--
-- ⚠️ SQL Editor'da `auth.uid()` NULL döner. (2)-(4) için işlemin başında
-- oturum simüle et:
--     set local request.jwt.claim.sub = '<kullanici-uuid>';
--
-- (1) Yapı
--
-- select policyname, cmd, permissive from pg_policies where tablename = 'blocks';
-- select policyname, cmd, permissive from pg_policies
--  where tablename in ('follows','entry_likes') and permissive = 'RESTRICTIVE';
-- select proname, prosecdef, proconfig from pg_proc
--  where proname in ('is_blocked_pair','block_user');
--
--   → `blocks` 3 satır (SELECT/INSERT/DELETE, hepsi PERMISSIVE)
--   → restrictive sorgusu 2 satır
--   → `is_blocked_pair` prosecdef = true; ikisinde de proconfig dolu
--
-- (2) Kendini engelleme reddediliyor mu
--     select public.block_user('<kendi-uuid>');   → hata bekleniyor
--
-- (3) Engelleme takibi siliyor mu
--     -- önce iki yönlü takip kur, sonra:
--     select public.block_user('<oteki-uuid>');
--     select * from follows
--      where (follower_id = '<kendi>' and following_id = '<oteki>')
--         or (follower_id = '<oteki>' and following_id = '<kendi>');
--     → 0 satır
--
-- (4) İdempotent mi
--     select public.block_user('<oteki-uuid>');   → ikinci kez de hatasız
--
-- 🔴 (5) ASIL TEST — İKİ GERÇEK HESAPLA, UYGULAMADAN:
--     "başkasının verisi" senaryoları SQL Editor'dan test EDİLEMEZ.
--     A, B'yi engelledikten sonra B'nin A'yı takip etmesi ve A'nın
--     ziyaretini beğenmesi REDDEDİLMELİ.
--     ⚠️ Belirti "hata" olmayabilir: RLS reddi Supabase'de SESSİZ 0 SATIR
--     olarak dönebiliyor (migration 019'un dersi). İstemci `.select()` ile
--     etkilenen satırı geri istemeli, yoksa başarı sanır.
-- =====================================================================
