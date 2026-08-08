-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 017 — SIRALAMA GÜNCELLEMESİ ARTIK KULLANICI ONAYLI
--
-- Supabase SQL Editor'da elle çalıştırılır.
-- ÖNCE migration 010 ve 011 çalışmış olmalı.
--
-- ⚠️ ÇALIŞTIRMA SIRASI ÖNEMLİ: bu migration UYGULAMA GÜNCELLEMESİNDEN (OTA)
--    ÖNCE çalıştırılmalı. Ters sıra kırar — istemci sunucunun tanımadığı bir
--    parametre yollar. Bu yönde ise kırılma YOK: yeni parametrenin varsayılanı
--    `true`, yani parametreyi hiç göndermeyen MEVCUT APK bugünkü davranışını
--    aynen sürdürür.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── NE DEĞİŞİYOR ─────────────────────────────────────────────────────────────
-- Bugüne kadar PUANLI bir günlük girişi `user_rankings`'i SESSİZCE güncelliyordu
-- (migration 010) ve eski bir girişin puanını değiştirmek kanonik puanı EZİYORDU
-- (migration 011, "son düzenleme kazanır"). İkisi de doğru varsayılan ama
-- kullanıcının sözü yoktu.
--
-- Artık her iki RPC de `p_update_ranking` alıyor:
--   true  (VARSAYILAN) → bugünkü davranış, hiçbir şey değişmiyor
--   false             → yalnızca `diary_entries` yazılır, sıralamaya DOKUNULMAZ
--
-- Arayüzde bu, "Ziyaret Ekle" formunda puan seçilince beliren bir anahtar
-- ("Sıralamamı da güncelle"). `MoveToListSheet`'in "Kaynak listeden de kaldır"
-- anahtarıyla aynı desen ve aynı varsayılan kuralı: parametreyi göndermeyen
-- çağrı bugünkü davranışı korur (migration 008'in kararı).
--
-- ── NEDEN TERS YÖN (sıralama → günlük) YOK ───────────────────────────────────
-- Mekan sayfasından puan değiştirmek geçmiş ziyaretlere DOKUNMUYOR ve bu
-- bilinçli: `diary_entries.rating` "o ziyarette ne verdim" (geçmiş bir olay),
-- `user_rankings.rating` "şu anki kanonik görüşüm" (bir durum). Bugünkü görüşü
-- değiştirmek geçmişi yeniden yazmamalı. Otomatik ters yayılım ayrıca "hangi
-- ziyaret güncellenecek" sorusunu doğururdu — cevabı olmayan bir soru.
-- Buradaki çözüm otomatik DEĞİL: karar kayıt anında, TEK bir giriş için,
-- kullanıcıdan açıkça alınıyor.
--
-- ── `create or replace` YETMEZ, ÖNCE `drop` ──────────────────────────────────
-- MİGRATION 008'İN DERSİ: parametre eklemek fonksiyonu değiştirmez, AŞIRI
-- YÜKLEME yaratır (Postgres farklı argüman listesini farklı fonksiyon sayar) ve
-- PostgREST hangisini çağıracağını şaşırabilir. Doğrulama adımı 1 tam olarak
-- bunu kontrol ediyor.
--
-- `upsert_user_ranking`'e DOKUNULMUYOR: imzası değişmiyor, yalnızca çağrılıp
-- çağrılmayacağı değişiyor. `rank_index` kuralının tek SQL kaynağı olarak
-- yerinde kalıyor.
--
-- ⚠️ `drop` + `create` arası: DDL Postgres'te transaction'a tabi, ama bu dosya
-- SQL Editor'da tek parça çalıştırılmalı. Ortada hata alırsan fonksiyon
-- düşmüş olabilir — dosyayı baştan tekrar çalıştır, `if exists` ve
-- `create` idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ----------------------------------------------------
-- 1. log_diary_entry() — YENİ ZİYARET
-- ----------------------------------------------------

drop function if exists public.log_diary_entry(text, date, numeric, text);

create or replace function public.log_diary_entry(
  p_place_id       text,
  p_visited_at     date    default current_date,
  p_rating         numeric default null,
  p_note           text    default null,
  -- YENİ. Varsayılan `true` = bugünkü davranış; parametreyi göndermeyen eski
  -- istemci hiçbir şey fark etmiyor.
  p_update_ranking boolean default true
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'log_diary_entry: oturum yok';
  end if;

  if p_place_id is null then
    raise exception 'log_diary_entry: p_place_id boş olamaz';
  end if;

  -- Gelecek tarih DB'de CHECK ile engellenemiyordu (migration 009'daki not:
  -- CHECK içinde `current_date` kullanılamaz). Kontrol burada.
  if p_visited_at > current_date then
    raise exception 'log_diary_entry: ziyaret tarihi gelecekte olamaz (%)', p_visited_at;
  end if;

  insert into diary_entries (user_id, place_id, visited_at, rating, note)
  values (
    v_user_id,
    p_place_id,
    coalesce(p_visited_at, current_date),
    p_rating,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_entry_id;

  -- İKİ KOŞUL:
  --   1. PUANSIZ LOG SIRALAMAYA GİRMEZ (migration 010'dan beri geçerli)
  --   2. Kullanıcı anahtarı kapattıysa puanlı olsa bile girmez (YENİ)
  -- `coalesce` savunma amaçlı: istemci parametreyi açıkça null yollarsa
  -- varsayılan davranışa düşülüyor, sessizce "hayır"a değil.
  if p_rating is not null and coalesce(p_update_ranking, true) then
    perform public.upsert_user_ranking(p_place_id, p_rating);
  end if;

  return v_entry_id;
end;
$$;

-- ----------------------------------------------------
-- 2. update_diary_entry() — ZİYARET DÜZENLEME
-- ----------------------------------------------------

drop function if exists public.update_diary_entry(uuid, date, numeric, text);

create or replace function public.update_diary_entry(
  p_entry_id       uuid,
  p_visited_at     date    default null,
  p_rating         numeric default null,
  p_note           text    default null,
  p_update_ranking boolean default true
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_place_id   text;
  v_old_rating numeric;
  v_updated    integer;
begin
  if v_user_id is null then
    raise exception 'update_diary_entry: oturum yok';
  end if;

  if p_entry_id is null then
    raise exception 'update_diary_entry: p_entry_id boş olamaz';
  end if;

  if p_visited_at is not null and p_visited_at > current_date then
    raise exception 'update_diary_entry: ziyaret tarihi gelecekte olamaz (%)', p_visited_at;
  end if;

  if p_rating is not null and (p_rating < 0.5 or p_rating > 5.0) then
    raise exception 'update_diary_entry: puan 0.5 ile 5.0 arasında olmalı (gelen: %)', p_rating;
  end if;

  -- Eski satır: `place_id` (sıralama güncellemesi için) ve ESKİ PUAN
  -- (değişip değişmediğini anlamak için) buradan geliyor.
  --
  -- ⚠️ ESKİ YORUM DÜZELTİLDİ: burada bir dönem "SELECT politikası
  -- `auth.uid() = user_id` istiyor, yani başkasının satırı görünmez ve
  -- `not found` dalına düşer" yazıyordu. MİGRATION 015 GÜNLÜĞÜ HERKESE AÇTI,
  -- yani bu select artık başkasının satırını da BULABİLİR. Güvenlik
  -- bozulmuyor: koruma aşağıdaki UPDATE'in satır sayısı kontrolünde —
  -- UPDATE politikası hâlâ sahiplik istiyor, başkasının girişinde 0 satır
  -- güncellenir ve exception atılır.
  select place_id, rating
    into v_place_id, v_old_rating
    from diary_entries
   where id = p_entry_id;

  if not found then
    raise exception
      'update_diary_entry: giriş bulunamadı (%)', p_entry_id;
  end if;

  -- Tüm alanlar KOŞULSUZ yazılıyor, `coalesce` ile "verilmeyeni koru" YAPILMIYOR:
  -- `rating` ve `note` null'a çekilebilmeli (puanı kaldır, notu sil).
  update diary_entries
     set visited_at = coalesce(p_visited_at, visited_at),
         rating     = p_rating,
         note       = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_entry_id;

  get diagnostics v_updated = row_count;

  -- Buraya iki şekilde düşülür: giriş silinmiş, ya da UPDATE politikası
  -- satırı elemiş (başkasının girişi). İkisi de sessizce geçilmemeli.
  if v_updated <> 1 then
    raise exception
      'update_diary_entry: % satır güncellendi (1 bekleniyordu) — giriş sana ait olmayabilir',
      v_updated;
  end if;

  -- ÜÇ KOŞUL:
  --   1. Puan verilmiş olmalı
  --   2. GERÇEKTEN DEĞİŞMİŞ olmalı — `is distinct from` null'ları da doğru
  --      karşılaştırıyor (`<>` null ile null döndürür ve koşul hiç sağlanmazdı)
  --   3. Kullanıcı anahtarı kapatmamış olmalı (YENİ)
  --
  -- 3. maddesi CLAUDE.md'nin "kabul edilen tuzak" diye yazdığı davranışı
  -- kullanıcının kontrolüne veriyor: eski bir girişin puanını değiştirmek
  -- güncel kanonik puanı EZİYORDU ve bunu durdurmanın yolu yoktu.
  if p_rating is not null
     and p_rating is distinct from v_old_rating
     and coalesce(p_update_ranking, true) then
    perform public.upsert_user_ranking(v_place_id, p_rating);
  end if;
end;
$$;

-- ----------------------------------------------------
-- 3. YETKİLER — YENİ İMZAYLA TEKRAR VERİLMELİ
-- ----------------------------------------------------
-- Yetki fonksiyona değil İMZAYA bağlı: `drop` ile birlikte eski imzanın
-- yetkileri de gitti. Bu blok atlanırsa `authenticated` rolü fonksiyonu
-- çağıramaz ve uygulama "Ziyaret kaydedilemedi" verir.
-- anon (giriş yapmamış istemci) çağıramaz — 002/006/007/008/010 ile aynı desen.

revoke execute on function public.log_diary_entry(text, date, numeric, text, boolean)
  from anon, public;
grant  execute on function public.log_diary_entry(text, date, numeric, text, boolean)
  to authenticated;

revoke execute on function public.update_diary_entry(uuid, date, numeric, text, boolean)
  from anon, public;
grant  execute on function public.update_diary_entry(uuid, date, numeric, text, boolean)
  to authenticated;

-- ----------------------------------------------------
-- 4. POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------
-- Bu satır ATLANMAMALI: PostgREST fonksiyon imzalarını cache'liyor, yenilemeden
-- yeni parametre "bilinmiyor" diye reddedilebilir.

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- DOĞRULAMA — aşağıdakileri AYRI AYRI çalıştır
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── 1) AŞIRI YÜKLEME OLUŞMADI MI? (en kritik kontrol) ───────────────────────
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as argumanlar
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('log_diary_entry', 'update_diary_entry')
--    order by p.proname;
--
--   ✅ Beklenen: TAM OLARAK İKİ SATIR, ikisi de `p_update_ranking boolean`
--      ile bitiyor.
--   ❌ DÖRT satır görürsen `drop` çalışmamış, aşırı yükleme var — eski
--      imzaları elle düşür:
--        drop function public.log_diary_entry(text, date, numeric, text);
--        drop function public.update_diary_entry(uuid, date, numeric, text);
--
-- ── 2) `search_path` korundu mu? ────────────────────────────────────────────
--
--   select proname, proconfig
--     from pg_proc
--    where proname in ('log_diary_entry', 'update_diary_entry',
--                      'upsert_user_ranking');
--
--   ✅ Beklenen: üçünde de {"search_path=public, pg_temp"}
--      (Bu satırın atlanması search_path hijacking'e açık bırakır.)
--
-- ── 3) Yetkiler yeni imzaya verildi mi? ─────────────────────────────────────
--
--   select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_schema = 'public'
--      and routine_name in ('log_diary_entry', 'update_diary_entry')
--    order by routine_name, grantee;
--
--   ✅ Beklenen: `authenticated` için EXECUTE var, `anon` YOK.
--
-- ── 4) ANAHTAR KAPALI: sıralama DEĞİŞMEMELİ ────────────────────────────────
--   Aşağıdakileri çalıştırmadan önce iki değeri doldur:
--     <UUID>     → kendi kullanıcı id'in (select id from profiles where ...)
--     <PLACE_ID> → sıralamanda ZATEN OLAN bir mekanın place_id'si
--
--   begin;
--     set local request.jwt.claim.sub = '<UUID>';
--
--     -- Önce mevcut kanonik puanı gör:
--     select rating as onceki_puan from user_rankings
--      where user_id = '<UUID>' and place_id = '<PLACE_ID>';
--
--     -- Anahtar KAPALI (5. parametre false):
--     select public.log_diary_entry('<PLACE_ID>', current_date, 1.0,
--                                   'migration 017 testi', false);
--
--     -- Kanonik puan AYNI KALMALI:
--     select rating as sonraki_puan from user_rankings
--      where user_id = '<UUID>' and place_id = '<PLACE_ID>';
--
--     -- Günlük satırı ise 1.0 ile YAZILMIŞ OLMALI:
--     select rating, note from diary_entries
--      where user_id = '<UUID>' and place_id = '<PLACE_ID>'
--      order by created_at desc limit 1;
--   rollback;
--
--   ✅ Beklenen: onceki_puan = sonraki_puan · günlük satırı rating 1.0
--   ⚠️ `rollback` sayesinde hiçbir şey kalıcı değil.
--
-- ── 5) ESKİ İSTEMCİ (4 argüman) HÂLÂ ÇALIŞIYOR MU? ─────────────────────────
--   Bu, "migration'ı OTA'dan önce çalıştırmak güvenli" iddiasının testi:
--   sahadaki APK 5. parametreyi göndermiyor.
--
--   begin;
--     set local request.jwt.claim.sub = '<UUID>';
--
--     -- 5. parametre YOK — eski istemci simülasyonu:
--     select public.log_diary_entry('<PLACE_ID>', current_date, 2.0,
--                                   'eski istemci simulasyonu');
--
--     -- Varsayılan `true` devrede: kanonik puan 2.0 OLMALI.
--     select rating from user_rankings
--      where user_id = '<UUID>' and place_id = '<PLACE_ID>';
--   rollback;
--
--   ✅ Beklenen: 2.0 — yani parametresiz çağrı bugünkü davranışı koruyor.
--   ❌ Hata alırsan (fonksiyon bulunamadı vb.) OTA'yı GÖNDERME, önce burayı
--      düzelt: sahadaki APK'lar bu yolu kullanıyor.
--
-- ── 6) DÜZENLEME YOLU — anahtar kapalıyken eski puanı ezmemeli ─────────────
--   <ENTRY_ID> → puanlı, sana ait bir günlük girişinin id'si
--
--   begin;
--     set local request.jwt.claim.sub = '<UUID>';
--
--     select rating as onceki_kanonik from user_rankings
--      where user_id = '<UUID>'
--        and place_id = (select place_id from diary_entries where id = '<ENTRY_ID>');
--
--     -- Girişin puanını değiştir ama sıralamaya DOKUNMA:
--     select public.update_diary_entry('<ENTRY_ID>', null, 0.5, null, false);
--
--     select rating as sonraki_kanonik from user_rankings
--      where user_id = '<UUID>'
--        and place_id = (select place_id from diary_entries where id = '<ENTRY_ID>');
--
--     select rating as giris_puani from diary_entries where id = '<ENTRY_ID>';
--   rollback;
--
--   ✅ Beklenen: onceki_kanonik = sonraki_kanonik · giris_puani = 0.5
--
-- ── 7) ⚠️ RLS'in kendisi SQL EDITOR'DAN TEST EDİLEMEZ ──────────────────────
--   "Başkasının girişini düzenleyemiyor muyum" sorusu ancak uygulamadan, iki
--   gerçek hesapla denenebilir (migration 006/007/008/016'daki aynı not).
-- ════════════════════════════════════════════════════════════════════════════
