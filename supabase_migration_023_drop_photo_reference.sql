-- =====================================================================
-- MIGRATION 023 — user_rankings.photo_reference DÜŞÜRÜLÜYOR
-- =====================================================================
--
-- Places anahtarı serisinin (Aşama 1-4, 2026-08-17) bıraktığı temizlik.
--
-- ── NEDEN ────────────────────────────────────────────────────────────
-- Fotoğraf adresleri artık `places.photo_base_urls`'ten geliyor (Aşama 3):
-- sunucu Google'ın 302'sini bir kez çözüp taban adresi saklıyor, istemci
-- render anında `=w{genişlik}` ekliyor. Denormalize `photo_reference` bu
-- turdan sonra HİÇBİR YERDE OKUNMUYOR — ne istemcide ne SQL'de.
--
-- Doğrulandı (2026-08-19):
--   * istemcide tek bir `.photo_reference` okuması yok (kalan eşleşmeler
--     yalnızca yorum satırı)
--   * istemci `user_rankings`'e doğrudan yalnızca `review_text` ve
--     `rank_index` yazıyor + `delete` atıyor; puan yazmanın tek yolu
--     `upsert_user_ranking` RPC'si, yani sahadaki eski bundle'lar da bu
--     kolona dokunmuyor
--   * kolon üzerinde indeks / kısıt / view YOK
--
-- ⚠️ YALNIZCA BU KOLON GİDİYOR — diğer üç denormalize kolon KALIYOR.
-- `MapScreen` hâlâ `place?.latitude ?? ranking.latitude` biçiminde
-- `restaurant_name` / `latitude` / `longitude` üçlüsünü CANLI FALLBACK
-- olarak okuyor. Migration 010'un "bu kolonlar bir faz sonra düşürülecek"
-- yorumu dördünü birlikte anıyordu; bugün yalnızca biri hazır.
-- Ayrıca `restaurant_name` hâlâ `not null`.
--
-- ── 🔴 ADIM SIRASI ZORUNLU ───────────────────────────────────────────
-- Fonksiyon ÖNCE, kolon SONRA. Ters sırada `upsert_user_ranking` var
-- olmayan bir kolona yazmaya çalışır ve SAHADA PUAN KAYDETME ANINDA ÖLÜR.
-- İki adım tek dosyada/tek transaction'da olduğu için arada kırık pencere
-- kalmıyor.
--
-- ── DAĞITIM SIRASI SERBEST ───────────────────────────────────────────
-- Migration 017'nin aksine burada "önce migration sonra OTA" zorunluluğu
-- YOK: kolonu kimse okumadığı için iki yönde de kırılma olmuyor.
--   * migration önce → `select('*')` kolonu döndürmez, kimse aramıyor
--   * OTA önce       → tipte alan yok, sorgu fazladan kolon döndürür
-- =====================================================================


-- ----------------------------------------------------
-- 1. upsert_user_ranking() — photo_reference yazan satırlar çıkarıldı
-- ----------------------------------------------------
--
-- ⚠️ `drop function` GEREKMİYOR: imza `(text, numeric)` olarak BİREBİR
-- aynı kalıyor. Migration 008'in "önce drop" dersi yalnızca PARAMETRE
-- LİSTESİ değiştiğinde geçerli (aşırı yükleme riski) — burada değişmiyor.
--
-- Gövdenin geri kalanı migration 010'daki hâliyle AYNEN korunuyor:
-- `rank_index` kuralı, `places` ön koşulu, aralık kontrolleri, `set
-- search_path`. Tek fark iki satırın eksilmesi.
--
-- `log_diary_entry` (010) ve `update_diary_entry` (011) DEĞİŞMİYOR —
-- ikisi de bu fonksiyonu çağırıyor, kolona kendileri dokunmuyor.

create or replace function public.upsert_user_ranking(
  p_place_id text,
  p_rating   numeric
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_place      places%rowtype;
  v_ranking_id uuid;
  v_next_index integer;
begin
  if v_user_id is null then
    raise exception 'upsert_user_ranking: oturum yok';
  end if;

  if p_rating is null then
    raise exception 'upsert_user_ranking: p_rating boş olamaz';
  end if;

  -- Aralık kontrolü tabloda da var; buradaki mesaj daha okunur ve hata
  -- INSERT'e kadar gitmeden dönüyor.
  if p_rating < 0.5 or p_rating > 5.0 then
    raise exception 'upsert_user_ranking: puan 0.5 ile 5.0 arasında olmalı (gelen: %)', p_rating;
  end if;

  -- ÖN KOŞUL: mekanın cache satırı olmalı. FK bunu zaten dayatıyor ama hata
  -- mesajı burada anlamlı: çağıran ekran `resolvePlace()` çağırmayı atlamış.
  select * into v_place from places where place_id = p_place_id;

  if not found then
    raise exception
      'upsert_user_ranking: places cache satırı yok (%) — önce resolvePlace çağrılmalı',
      p_place_id;
  end if;

  select id into v_ranking_id
    from user_rankings
   where user_id = v_user_id
     and place_id = p_place_id;

  if found then
    -- SIRA KORUNUYOR: `rank_index` HİÇ dokunulmuyor.
    update user_rankings
       set rating          = p_rating,
           restaurant_name = v_place.name,
           latitude        = coalesce(v_place.latitude, latitude),
           longitude       = coalesce(v_place.longitude, longitude)
     where id = v_ranking_id;

    return v_ranking_id;
  end if;

  -- Yeni kayıt sona ekleniyor. Sayım VERİTABANINDAN, yerel state'ten değil —
  -- `rank_index`'in sessizce 0'a düştüğü hata tam olarak buydu.
  select coalesce(max(rank_index), -1) + 1
    into v_next_index
    from user_rankings
   where user_id = v_user_id;

  insert into user_rankings (
    user_id, place_id, restaurant_name, rating, rank_index,
    latitude, longitude
  )
  values (
    v_user_id, p_place_id, v_place.name, p_rating, v_next_index,
    v_place.latitude, v_place.longitude
  )
  returning id into v_ranking_id;

  return v_ranking_id;
end;
$$;


-- ----------------------------------------------------
-- 2. Kolonu düşür
-- ----------------------------------------------------
--
-- `if exists`: migration'ın iki kez çalıştırılması hata vermesin.
-- `cascade` KULLANILMADI — bilinçli. Bu kolona bağlı indeks/kısıt/view
-- olmadığı önceden doğrulandı; `cascade` yazmak, beklenmedik bir bağımlılık
-- çıkarsa onu SESSİZCE silmek olurdu. Düz `drop column` o durumda hata
-- verir ve bizi durdurur — istediğimiz davranış bu.

alter table user_rankings drop column if exists photo_reference;


-- =====================================================================
-- 3. DOĞRULAMA — panelde migration'dan SONRA çalıştır
-- =====================================================================
--
-- (a) Kolon gerçekten gitti mi? → 0 satır dönmeli
--
-- select column_name
--   from information_schema.columns
--  where table_name = 'user_rankings'
--    and column_name = 'photo_reference';
--
--
-- (b) Fonksiyon güncel mi? → gövdede 'photo_reference' GEÇMEMELİ (false)
--
-- select prosrc like '%photo_reference%' as hala_geciyor,
--        proconfig
--   from pg_proc
--  where proname = 'upsert_user_ranking';
--
-- `proconfig` = {"search_path=public, pg_temp"} olmalı — `create or replace`
-- bu ayarı taşır ama kontrol etmek bedava (migration 012'nin dersi).
--
--
-- (c) 🔴 ASIL TEST — SQL DEĞİL, UYGULAMADAN:
--     bir mekana puan ver + mevcut bir puanı güncelle.
--
-- Fonksiyonun kırıldığı SQL Editor'dan anlaşılmaz: `auth.uid()` orada null
-- döner ve fonksiyon daha ilk satırda 'oturum yok' ile çıkar. Gerçek yol
-- uygulamadan denemek; alternatifi geçici oturum simülasyonu:
--
--   set local request.jwt.claim.sub = '<kullanıcı-uuid>';
-- =====================================================================
