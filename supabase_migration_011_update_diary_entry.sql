-- ====================================================
-- Migration 011 — update_diary_entry() RPC'si
-- Supabase SQL Editor'a kopyalayıp çalıştır.
-- ÖNCE migration 009 ve 010 çalışmış olmalı.
-- ====================================================
--
-- NEDEN RPC (düz UPDATE değil):
-- Ekleme neden RPC ise düzenleme de aynı sebeple: bir günlük girişinin PUANI
-- değişince `user_rankings` de değişmek zorunda ve iki yazma tek transaction'da
-- olmalı. İstemciden iki ayrı çağrı, günlükte yeni puan görünürken sıralamada
-- eskisinin kalmasına yol açardı.
--
-- ── PUAN NE ZAMAN SIRALAMAYA YANSIR ──────────────────────────────────────────
-- YALNIZCA gerçekten DEĞİŞTİĞİNDE (`is distinct from`). Not veya tarih
-- düzeltmek sıralamaya HİÇ dokunmuyor — 3 ay önceki bir girişin yazım hatasını
-- düzeltmek bugünkü puanı yeniden yazmamalı.
--
-- KABUL EDİLEN TUZAK: eski bir girişin puanını değiştirmek güncel kanonik puanı
-- EZER. Yani kural "son ziyaret kazanır" değil, "son düzenleme kazanır".
-- Letterboxd'un modeli de bu (giriş puanını düzenlemek film puanını günceller)
-- ve kullanıcının zihin modeli oradan geliyor. Alternatif — "yalnızca bu giriş
-- o mekanın en yeni puanlı girişiyse güncelle" — daha "doğru" ama kullanıcıya
-- açıklanamaz: bazen günceller bazen güncellemez.
--
-- PUANI KALDIRMAK (rating → null) SIRALAMAYI GERİ ALMAZ. `useDiary.removeEntry`
-- ile simetrik: sıralama "bu mekan hakkında ne düşünüyorum" sorusunun kanonik
-- cevabı, tek bir ziyaretin türevi değil. Geri almak "hangi ziyaretin puanına
-- dönmeli" gibi cevabı olmayan bir soru doğururdu.
--
-- `place_id` PARAMETRE DEĞİL: bir ziyaret mekanına bağlıdır. Mekanı
-- değiştirmek o ziyareti silip yenisini yazmak demek.
--
-- ── NEDEN `security definer` DEĞİL ───────────────────────────────────────────
-- 006/007/008/010 ile aynı gerekçe: `diary_entries` UPDATE politikası zaten
-- `auth.uid() = user_id` istiyor. Başkasının girişi 0 satır günceller ve
-- aşağıdaki satır sayısı kontrolü bunu hataya çevirir.

create or replace function public.update_diary_entry(
  p_entry_id   uuid,
  p_visited_at date    default null,
  p_rating     numeric default null,
  p_note       text    default null
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

  -- Gelecek tarih kontrolü — `log_diary_entry` ile birebir aynı. (Tabloda
  -- CHECK olarak duramıyor: CHECK içinde `current_date` kullanılamıyor,
  -- gerekçe migration 009'da.)
  if p_visited_at is not null and p_visited_at > current_date then
    raise exception 'update_diary_entry: ziyaret tarihi gelecekte olamaz (%)', p_visited_at;
  end if;

  if p_rating is not null and (p_rating < 0.5 or p_rating > 5.0) then
    raise exception 'update_diary_entry: puan 0.5 ile 5.0 arasında olmalı (gelen: %)', p_rating;
  end if;

  -- Eski satır: `place_id` (sıralama güncellemesi için) ve ESKİ PUAN
  -- (değişip değişmediğini anlamak için) buradan geliyor.
  --
  -- SELECT politikası `auth.uid() = user_id` (migration 009), yani başkasının
  -- satırı burada zaten görünmez ve `not found` dalına düşer.
  select place_id, rating
    into v_place_id, v_old_rating
    from diary_entries
   where id = p_entry_id;

  if not found then
    raise exception
      'update_diary_entry: giriş bulunamadı veya sana ait değil (%)', p_entry_id;
  end if;

  -- Tüm alanlar KOŞULSUZ yazılıyor, `coalesce` ile "verilmeyeni koru" YAPILMIYOR:
  -- `rating` ve `note` null'a çekilebilmeli (puanı kaldır, notu sil). `coalesce`
  -- kullanmak bu iki işlemi imkansız kılardı. `visited_at` null gelirse eski
  -- değer korunuyor — o alan zaten `not null`, "temizlemek" diye bir şey yok.
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

  -- SIRALAMA YALNIZCA PUAN DEĞİŞTİYSE. `is distinct from` null'ları da doğru
  -- karşılaştırıyor (`<>` null ile null döndürür ve koşul hiç sağlanmazdı).
  if p_rating is not null and p_rating is distinct from v_old_rating then
    perform public.upsert_user_ranking(v_place_id, p_rating);
  end if;
end;
$$;

-- ----------------------------------------------------
-- YETKİLER
-- ----------------------------------------------------

revoke execute on function public.update_diary_entry(uuid, date, numeric, text)
  from anon, public;
grant  execute on function public.update_diary_entry(uuid, date, numeric, text)
  to authenticated;

-- ----------------------------------------------------
-- POSTGREST ŞEMA CACHE'İ
-- ----------------------------------------------------

notify pgrst, 'reload schema';

-- ====================================================
-- KONTROL — sırayla çalıştır.
--
-- SQL Editor'da `auth.uid()` null döner; işlemin başında oturum simüle et:
--   set local request.jwt.claim.sub = '<senin-kullanıcı-uuid>';
--
--   -- HAZIRLIK: puanlı bir test girişi oluştur (mevcut sıralamandaki bir mekana)
--   select log_diary_entry(
--     (select place_id from user_rankings where user_id = auth.uid() order by rank_index limit 1),
--     current_date - 10, 3.0, 'Düzenleme testi'
--   );
--
--   -- Referans durum — bu iki çıktıyı sakla:
--   select id, visited_at, rating, note from diary_entries
--    where user_id = auth.uid() and note = 'Düzenleme testi';
--   select place_id, rating, rank_index from user_rankings
--    where user_id = auth.uid() order by rank_index;
--
--   -- 1) YALNIZCA NOT DEĞİŞSİN → sıralama DEĞİŞMEMELİ
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and note = 'Düzenleme testi'),
--     null, 3.0, 'Düzenleme testi — not güncellendi'
--   );
--   -- user_rankings sorgusunu tekrar çalıştır: rating ve rank_index AYNI olmalı.
--
--   -- 2) PUAN DEĞİŞSİN → sıralamadaki puan güncellenmeli, rank_index KORUNMALI
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and note like 'Düzenleme testi%'),
--     null, 1.5, 'Düzenleme testi — puan 1.5'
--   );
--   select place_id, rating, rank_index from user_rankings
--    where user_id = auth.uid() order by rank_index;
--   -- İlgili satırın rating'i 1.5 olmalı, rank_index'i DEĞİŞMEMELİ.
--
--   -- 3) PUANI KALDIR → giriş puansız olmalı AMA sıralamadaki puan DURMALI
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and note like 'Düzenleme testi%'),
--     null, null, 'Düzenleme testi — puansız'
--   );
--   select rating from diary_entries
--    where user_id = auth.uid() and note like 'Düzenleme testi%';   -- null olmalı
--   select place_id, rating from user_rankings
--    where user_id = auth.uid() order by rank_index;                -- 1.5 kalmalı
--
--   -- 4) TARİH DEĞİŞSİN → sıralama DEĞİŞMEMELİ
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and note like 'Düzenleme testi%'),
--     current_date - 2, null, 'Düzenleme testi — tarih değişti'
--   );
--
--   -- 5) BOŞ NOT null'a çevriliyor mu?
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and note like 'Düzenleme testi%'),
--     null, null, '   '
--   );
--   select note from diary_entries where user_id = auth.uid()
--    and visited_at = current_date - 2;   -- null dönmeli
--
--   -- 6) GELECEK TARİH → HATA ("ziyaret tarihi gelecekte olamaz")
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and visited_at = current_date - 2),
--     current_date + 1
--   );
--
--   -- 7) GEÇERSİZ PUAN → HATA ("puan 0.5 ile 5.0 arasında olmalı")
--   select update_diary_entry(
--     (select id from diary_entries where user_id = auth.uid() and visited_at = current_date - 2),
--     null, 9.0
--   );
--
--   -- 8) OLMAYAN ID → HATA ("giriş bulunamadı veya sana ait değil")
--   select update_diary_entry('00000000-0000-0000-0000-000000000000'::uuid, null, 4.0);
--
--   -- 9) ATOMİKLİK: 7. adımdaki hata hiçbir şeyi değiştirmemiş olmalı
--   select visited_at, rating, note from diary_entries
--    where user_id = auth.uid() and visited_at = current_date - 2;
--   -- 5. adımdaki hali (rating null, note null) durmalı.
--
--   -- 10) TEMİZLİK
--   delete from diary_entries
--    where user_id = auth.uid() and visited_at = current_date - 2;
--
-- NOT: 2. adım `user_rankings`'i GERÇEKTEN değiştirdi (puan 1.5 oldu) ve 3.
-- adım bunu bilinçli olarak geri almıyor. Referans çıktıyı kullanarak elle
-- eski puanına döndürebilirsin.
-- ====================================================
