import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Hesap silme — kullanıcının KENDİ hesabını kalıcı olarak siler.
 *
 * ── NEDEN EDGE FUNCTION (başka yolu yok) ────────────────────────────────────
 * `auth.users`'tan satır silmek ADMIN yetkisi (`service_role`) istiyor.
 * İstemcide yalnızca anon key var ve olmalı — `service_role` JS paketine
 * girerse her kullanıcı her şeyi yapabilir hale gelir. `security definer` bir
 * SQL fonksiyonu da düşünüldü ve elendi: `auth` şemasına public bir
 * fonksiyondan dokunmak Supabase'in önermediği bir yol.
 *
 * ── 🔴 GÜVENLİĞİN TEK KRİTİK KURALI ─────────────────────────────────────────
 * SİLİNECEK KİMLİK İSTEK GÖVDESİNDEN OKUNMUYOR, DOĞRULANMIŞ JWT'DEN GELİYOR.
 * Gövdeden `userId` kabul eden bir uç nokta, HERKESİN HERKESİ silebildiği bir
 * kapı olurdu. Burada tek girdi `Authorization` başlığı; kim çağırdıysa yalnızca
 * o siliniyor. Bu dosyada değiştirilmemesi gereken tek şey budur.
 *
 * ── SİLME SIRASI ────────────────────────────────────────────────────────────
 *   1. JWT doğrula  → userId
 *   2. Fotoğraf YOLLARINI OKU  (silmeden ÖNCE — sonra satırlar yok olacak)
 *   3. Storage nesnelerini sil
 *   4. `auth.admin.deleteUser` → cascade gerisini götürüyor
 *
 * 2. adımın sırası zorunlu: `auth.users` silinince `profiles` ve ona bağlı her
 * şey cascade ile gidiyor, `place_photos` satırları da dahil. Yollar önceden
 * okunmazsa dosyalara bir daha ulaşılamaz.
 *
 * ── VERİTABANI TARAFI: MIGRATION GEREKMİYOR ─────────────────────────────────
 * `profiles.id → auth.users on delete cascade`, ve `profiles`'a giden SEKİZ
 * FK'nın sekizi de cascade: user_rankings · diary_entries · lists · list_items
 * (lists üzerinden) · follows (iki yön) · entry_likes · place_photos ·
 * photo_reports. Tek satır silmek hepsini götürüyor.
 *
 * ── ⚠️ STORAGE HATASI SİLMEYİ BLOKLAMIYOR ──────────────────────────────────
 * Nesne silme başarısız olsa da hesap siliniyor. Gerekçe projenin kendi
 * emsali: `removePhoto` "önce satır, sonra nesne" yapıyor ve nesne hatasını
 * kullanıcıya yansıtmıyor ("öksüz nesne kalır, görünmez, küçük"). Kullanıcının
 * beklentisi "hesabım gitsin"; Storage'daki bir aksaklık bunu bloklamamalı.
 * Hata bu fonksiyonun loglarına düşüyor.
 *
 * ⚠️ Bucket PUBLIC olduğu için öksüz kalan bir dosya URL'ini bilene açık kalır.
 * Gizlilik metninde bu dürüstçe yazılmalı.
 */

/** `place_photos` baytlarının bucket'ı — `src/lib/placePhotos.ts` ile aynı. */
const BUCKET = 'place-photos';

/**
 * ⚠️ Bu üç değişken Supabase tarafından OTOMATİK enjekte ediliyor; panelden
 * elle secret tanımlaman GEREKMİYOR (`SUPABASE_` önekli adlar zaten rezerve).
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // React Native'de CORS yok; bu başlıklar yalnızca tarayıcıdan (ör. yerel
      // deneme) çağrıldığında iş görüyor. Bedeli sıfır.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'missing_token' }, 401);

  // `service_role` istemcisi: RLS'i baypas ediyor, admin API'sine erişiyor.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) KİMLİK — yalnızca token'dan. Gövde okunmuyor bile.
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    console.warn('[delete-account] geçersiz token:', userError?.message);
    return json({ error: 'invalid_token' }, 401);
  }
  const userId = userData.user.id;

  // 2) Fotoğraf yollarını ÖNCE oku — cascade'den sonra erişilemezler.
  const { data: photos, error: photoError } = await admin
    .from('place_photos')
    .select('storage_path, thumb_path')
    .eq('user_id', userId);

  if (photoError) {
    // Silmeyi ENGELLEMİYOR: kullanıcının istediği şey hesabın gitmesi.
    // Yollar okunamadıysa yalnızca temizlik yapılamaz, öksüz dosya kalır.
    console.error('[delete-account] fotoğraf yolları okunamadı:', photoError);
  }

  // 3) Storage temizliği. Hata YALNIZCA loglanıyor (gerekçe başlıkta).
  const paths = (photos ?? [])
    .flatMap((p) => [p.storage_path, p.thumb_path])
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (paths.length > 0) {
    const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
    if (storageError) {
      console.error('[delete-account] Storage nesneleri silinemedi:', storageError);
    }
  }

  // 4) Asıl silme. Buradan sonrası cascade.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('[delete-account] kullanıcı silinemedi:', deleteError);
    return json({ error: 'delete_failed' }, 500);
  }

  console.log(
    `[delete-account] silindi: ${userId}, temizlenen nesne: ${paths.length}`
  );
  return json({ ok: true });
});
