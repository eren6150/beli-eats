-- ====================================================
-- Migration 012 — kullanıcı adı çakışmasında sonek (eren, eren2, eren3…)
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- Öncesinde başka bir migration'a bağımlı DEĞİL; yalnızca schema.sql'deki
-- `profiles` tablosu ve `handle_new_user()` trigger'ı var olmalı.
-- ====================================================
--
-- ── ÇÖZÜLEN BUG: "kayıt olamıyorum" (CLAUDE.md → Auth / kayıt akışı, madde (f))
--
-- `profiles.username` `unique not null`. Trigger kullanıcı adını şöyle üretiyordu:
--     coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1))
-- ve tek koruması `on conflict (id) do nothing` idi — yani YALNIZCA id çakışması.
-- `eren@gmail.com` ve `eren@outlook.com` ikisi de `eren` üretiyor:
--     unique ihlali → trigger patlar → auth.users insert'i GERİ ALINIR
--     → kullanıcı "Database error saving new user" görür ve HİÇ kayıt olamaz.
--
-- Bu, e-posta onayı kapalıyken de canlı bir hataydı ve arkadaş testi büyüdükçe
-- olasılığı artıyordu. Etkisi ikili: kişi ya kaydolur ya hiç giremez.
--
-- ── NEDEN SONEK (i), NULLABLE username (ii) DEĞİL ────────────────────────────
-- CLAUDE.md iki yol tarif ediyordu. (ii) — `username`'i nullable yapıp ilk
-- girişte kullanıcıya seçtirmek — daha doğru ürün kararı ama yeni bir ekran,
-- yeni bir "profilim tamamlanmadı" durumu ve `not null` kısıtının kaldırılması
-- demek. Arkadaş testinin ORTASINDAYIZ ve bu düzeltmenin bugün canlıya çıkması
-- gerekiyor. (i) saf SQL: APK gerektirmiyor, mevcut kurulumdaki herkes için
-- anında geçerli. (ii) Faz 3'ün profil işiyle birlikte yeniden değerlendirilir.
--
-- ── NEDEN `create or replace`, `drop` DEĞİL ──────────────────────────────────
-- migration 008'in dersi (`drop` şart) PARAMETRE LİSTESİ değiştiğinde geçerli:
-- Postgres farklı argüman listesini farklı fonksiyon sayar ve aşırı yükleme
-- yaratır. Burada imza birebir aynı (argümansız, `returns trigger`), yani
-- `create or replace` fonksiyonun gövdesini gerçekten değiştiriyor.
--
-- ── YAN DÜZELTME: `set search_path` eklendi ──────────────────────────────────
-- Mevcut `handle_new_user` `security definer` ama `set search_path` YOK —
-- projenin `upsert_place` için açıkça koyduğu kuralın ("bu satır atlanmamalı,
-- search_path hijacking'e karşı") ihlali. Fonksiyonu zaten baştan yazdığımız
-- için burada kapatıldı. Aynısı yeni yardımcı fonksiyona da uygulandı.

-- ----------------------------------------------------
-- 1. next_available_username() — adı üreten TEK kaynak
-- ----------------------------------------------------
--
-- Trigger'ın gövdesine gömmek yerine AYRI fonksiyon, iki sebeple:
--
--   (a) TEST EDİLEBİLİRLİK. Trigger'ı denemek `auth.users`'a insert atmayı
--       gerektiriyor — SQL Editor'dan yapılabilir ama yarım bir auth kaydı
--       bırakır. Bu fonksiyon doğrudan çağrılabiliyor:
--           select public.next_available_username('eren');
--       Bu projede "SQL Editor'dan test EDİLEMEZ" notu birden çok kez düşüldü;
--       burada test edilebilirliği tasarıma katmak ucuza geldi.
--   (b) Kural tek yerde. `upsert_user_ranking`'in `rank_index` için yaptığının
--       aynısı.
--
-- Sonek 2'den başlıyor: `eren`, `eren2`, `eren3`… (`eren1` üretilmiyor).
--
-- NOT: bu fonksiyon bir ÖNERİ döndürür, garanti değil — iki eşzamanlı kayıt
-- aynı adayı görebilir. Gerçek teklik kısıtın kendisinde ve trigger'daki
-- yeniden deneme döngüsünde. Bkz. aşağıdaki (2).
create or replace function public.next_available_username(p_base text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base      text;
  v_candidate text;
  v_suffix    int := 2;
begin
  -- Boş/whitespace taban savunması: e-postası `@x` gibi tuhaf olan ya da
  -- metadata'da boş string gönderen bir kayıt `''` üretip unique kısıta
  -- takılırdı — düzelttiğimiz bug'ın aynısı, başka kapıdan.
  v_base := nullif(btrim(coalesce(p_base, '')), '');
  if v_base is null then
    v_base := 'kullanici';
  end if;

  v_candidate := v_base;

  while exists (select 1 from public.profiles where username = v_candidate) loop
    v_candidate := v_base || v_suffix;
    v_suffix := v_suffix + 1;

    -- Pratikte ulaşılmaz; sonsuz döngüye karşı emniyet supabı.
    if v_suffix > 10000 then
      return v_base || '_' || substr(gen_random_uuid()::text, 1, 8);
    end if;
  end loop;

  return v_candidate;
end;
$$;

-- ----------------------------------------------------
-- 2. handle_new_user() — yeniden yazıldı
-- ----------------------------------------------------
--
-- ── `on conflict (id) do nothing` KORUNUYOR ve artık iş bölümü net ───────────
--   · id çakışması  → ON CONFLICT yutuyor, 0 satır, hata yok (profil zaten var)
--   · username çakışması → ON CONFLICT bunu KAPSAMIYOR → unique_violation
--     fırlıyor → yakalanıp bir sonraki adayla tekrar deneniyor.
-- Yani iki çakışma türü birbirine karışmıyor.
--
-- ── NEDEN ÖNCEDEN KONTROL YETMİYOR, DÖNGÜ DE GEREKİYOR ───────────────────────
-- `next_available_username` sorgusu ile insert arasında başka bir kayıt aynı
-- adı alabilir (iki arkadaş aynı anda kaydolursa). Sadece ön kontrol yapmak
-- düzelttiğimiz hatanın daha nadir bir sürümünü bırakırdı. Döngü bunu kendi
-- kendine iyileştiriyor: çakışan deneme atılır, fonksiyon yeni aday üretir.
--
-- ── SON ÇARE ─────────────────────────────────────────────────────────────────
-- 50 denemeden sonra kullanıcının kendi uuid parçası ekleniyor. Amaç estetik
-- değil GARANTİ: bu fonksiyondan çıkan hiçbir yol kullanıcıyı "kaydolamadın"
-- ekranında bırakmamalı — bu migration'ın varlık sebebi tam olarak bu.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base      text;
  v_candidate text;
begin
  -- Kaynak sırası DEĞİŞMEDİ: önce kullanıcının yazdığı ad, yoksa e-postanın
  -- @ öncesi. NOT: istemci bugün `options.data` GÖNDERMİYOR (CLAUDE.md madde
  -- (e)), yani metadata pratikte hep boş ve ikinci dal çalışıyor. (e) sonraki
  -- APK ile düzelecek; burası o gün hazır olsun diye olduğu gibi duruyor.
  v_base := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  for i in 1..50 loop
    v_candidate := public.next_available_username(v_base);

    begin
      insert into public.profiles (id, username)
      values (new.id, v_candidate)
      on conflict (id) do nothing;

      return new;
    exception
      when unique_violation then
        -- Yarış: aday ile insert arasında biri o adı aldı. Döngü bir sonraki
        -- turda yeni aday üretecek. (profiles'ta id ve username dışında unique
        -- kısıt yok; id zaten ON CONFLICT ile yutuluyor.)
        null;
    end;
  end loop;

  -- Buraya ulaşmak 50 ardışık yarış demek — gerçekte imkânsıza yakın.
  insert into public.profiles (id, username)
  values (new.id, v_base || '_' || substr(new.id::text, 1, 8))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------
-- 3. Trigger'ı yeniden bağla
-- ----------------------------------------------------
--
-- Fonksiyon isimle çağrıldığı için (2) tek başına yeterli. Bu blok savunma
-- amaçlı: trigger silinmiş ya da DEVRE DIŞI bırakılmışsa (tgenabled = 'D')
-- düzeltme sessizce hiç çalışmazdı. drop+create ikisini de onarıyor.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ====================================================
-- DOĞRULAMA — sırayla çalıştır
-- ====================================================
--
-- Aşağıdakiler `auth.users`'a HİÇ dokunmuyor, yani yarım auth kaydı bırakmıyor.
--
-- 1) Boşta olan bir ad kendisi olarak dönmeli:
--      select public.next_available_username('bosta_olmayan_bir_ad');
--      → 'bosta_olmayan_bir_ad'
--
-- 2) ⚠️ ASIL TEST — mevcut bir kullanıcı adını ver, sonekli dönmeli:
--      select username from public.profiles limit 1;      -- ör. 'eren'
--      select public.next_available_username('eren');     -- → 'eren2'
--
-- 3) Zincir çalışıyor mu (eren ve eren2 doluysa eren3 gelmeli):
--    Geçici satırla dene, sonra GERİ AL — tek transaction, kalıcı iz bırakmaz:
--      begin;
--        insert into public.profiles (id, username)
--        values (gen_random_uuid(), 'eren2');
--        select public.next_available_username('eren');   -- → 'eren3' olmalı
--      rollback;
--    (profiles.id → auth.users FK'sı var; bu insert FK'ya takılırsa 3. adımı
--     atla — 2. adım zaten asıl kuralı doğruluyor.)
--
-- 4) Boş taban savunması:
--      select public.next_available_username('   ');      -- → 'kullanici'
--      select public.next_available_username(null);       -- → 'kullanici'
--
-- 5) search_path artık yazılı mı (yan düzeltme):
--      select proname, proconfig from pg_proc
--      where proname in ('handle_new_user', 'next_available_username');
--      → ikisinde de {"search_path=public, pg_temp"}
--
-- 6) UÇTAN UCA — bunu UYGULAMADAN yapman gerekiyor, SQL'den değil:
--    Mevcut bir kullanıcının @ öncesiyle aynı olan yeni bir e-postayla kaydol
--    (ör. profiles'ta `eren` varsa `eren@baskabirdomain.com`).
--    ÖNCE: "Database error saving new user" · SONRA: kayıt başarılı ve
--    `select username from public.profiles order by created_at desc limit 1;`
--    → `eren2`
