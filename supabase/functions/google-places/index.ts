import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Google Places proxy'si — anahtarı istemciden çıkarma işinin sunucu ayağı.
 *
 * ── NEDEN ───────────────────────────────────────────────────────────────────
 * `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` bugün JS bundle'ına gömülüyor, yani
 * APK'yı eline alan biri anahtarı çıkarıp kendi uygulamasında kullanabilir.
 * Bugünkü korumalar (API kısıtı + günlük 2.000 kota + bütçe uyarısı) zararı
 * SINIRLIYOR ama açığı kapatmıyor: kotamız yanarsa aramamız çalışmaz.
 *
 * ⚠️ Mobil REST çağrıları için Google'da uygulama kısıtlaması YOK (IP ve HTTP
 * referrer var, ikisi de mobilde işe yaramaz). Yani anahtarı istemcide
 * kilitlemenin bir yolu hiç yoktu — tek çözüm onu sunucuya almak.
 *
 * ── ASIL KAZANÇ ANAHTARI GİZLEMEK DEĞİL, KİMLİK İLİŞTİRMEK ─────────────────
 * Bu fonksiyon geçerli bir Supabase JWT'si istiyor. Yani Google çağrıları
 * artık anonim değil: kim çağırdı biliniyor, gerekirse kullanıcı başına
 * sınırlanabiliyor. Anahtarı saklamak tek başına saldırgana yalnızca bir adım
 * ekler; kimlik şartı ise kotayı gerçekten korur.
 *
 * ── İKİ ACTION (ÜÇ DEĞİL — ÜÇÜNCÜSÜ PLANLAMA SIRASINDA ELENDİ) ─────────────
 * Başta ayrı bir `photo` action'ı planlanmıştı: "referansı ver, çözülmüş
 * adresi al". Tasarım netleşince GEREKSİZ olduğu görüldü ve yazılmadı —
 * projenin "bugün kullanılanı inşa et, geleceği spec'e yaz" kuralı.
 *
 * Gerekçe: `user_rankings.place_id` → `places` üzerinde FK var (migration
 * 003), yani puanlanmış HER mekanın bir `places` satırı var ve o satırın
 * `photo_base_urls`'ü zaten dolduruluyor. "Referansı olup satırı olmayan
 * fotoğraf" durumu doğmuyor; ayrı bir action ölü kod olurdu.
 *
 * ── ALAN MASKESİ ARTIK TEK YERDE (Aşama 2) ─────────────────────────────────
 * `PLACE_DETAIL_FIELDS` bir dönem istemcide de duruyordu; Aşama 2'de istemci
 * Google'ı hiç çağırmaz olunca oradaki kopya silindi. Maske SKU'yu belirliyor:
 * `rating` / `user_ratings_total` / `price_level` Atmosphere katmanı (en
 * pahalı), gerisi Basic. Maskede tek bir Atmosphere alanı olması çağrının
 * tamamını o katmandan faturalandırıyor — üçünü birlikte almanın ek maliyeti
 * yok.
 */

/**
 * ⚠️ Panelden ELLE tanımlanacak secret. `SUPABASE_` önekli olanların aksine
 * otomatik enjekte EDİLMİYOR:
 *     supabase secrets set GOOGLE_PLACES_API_KEY=...
 * (ya da Dashboard → Edge Functions → Secrets)
 *
 * ⚠️ Aşama 4'te bu, istemcidekinden AYRI ve YENİ bir anahtar olmalı: sahadaki
 * APK'lara gömülü eski anahtar, Console'dan silinene kadar çalışmaya devam
 * ediyor. Anahtarı `.env`'den kaldırmak onu geçersiz kılmıyor.
 */
const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BASE = 'https://maps.googleapis.com/maps/api/place';

/** İstemcideki `PLACE_DETAIL_FIELDS` ile BİREBİR aynı olmalı (bkz. başlık). */
const PLACE_DETAIL_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'geometry',
  'types',
  'photos',
  'rating',
  'user_ratings_total',
  'price_level',
].join(',');

/** `upsert_place` fotoğraf dizisini 10'a kırpıyor; fazlasını çözmek boşuna. */
const MAX_PHOTOS = 10;

/**
 * Boyut eki: `=s1600-w400`, `=w800`, `=s1600` gibi. Taban adresi saklamak için
 * SONDAN atılıyor, çünkü genişliği istemci render anında ekliyor.
 *
 * ⚠️ Desen bilinçli olarak dar (`=` + boyut belirteçleri + satır sonu). Kaba
 * bir `split('=')[0]` YANLIŞ olurdu: adresteki token base64url ve içinde `=`
 * dolgusu bulunabilir.
 */
const SIZE_SUFFIX = /=[swh]\d+(-[swh]\d+)*$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // React Native'de CORS yok; yalnızca tarayıcıdan denenirse iş görür.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    },
  });

/**
 * Google'a JSON isteği. `places.ts`'teki `placesRequest`'in sunucu karşılığı ve
 * hata sözleşmesi AYNI: `ZERO_RESULTS` hata değil, gerisi hata.
 */
async function googleJson<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.append(k, String(v));
  }
  qs.append('key', GOOGLE_KEY);

  const res = await fetch(`${BASE}/${endpoint}/json?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  const body = await res.json();
  if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
    // `error_message` YALNIZCA log'a: Google'ın metni bazen proje/anahtar
    // bilgisi taşıyor, istemciye sızmamalı.
    console.error(
      `[google-places] ${endpoint} → ${body.status}:`,
      body.error_message ?? '(mesaj yok)'
    );
    throw new Error(body.status ?? 'NO_STATUS');
  }
  return body as T;
}

/**
 * Tek bir fotoğraf referansını anahtarsız CDN adresine çevirir.
 *
 * `redirect: 'manual'` ŞART: varsayılan davranış yönlendirmeyi izleyip
 * GÖRSELİN BAYTLARINI indirirdi — bize gereken yalnızca `Location` başlığı.
 * Baytları buradan geçirmek Supabase egress'i demekti ve bu projenin ücretsiz
 * katmandaki asıl darboğazı egress; o tasarım bu yüzden elendi.
 *
 * Çözülemezse `null` döner; çağıran onu diziye null olarak yazıyor ki
 * `photo_refs` ile indeks hizası bozulmasın.
 */
async function resolvePhoto(ref: string): Promise<string | null> {
  try {
    const url =
      `${BASE}/photo?maxwidth=400` +
      `&photoreference=${encodeURIComponent(ref)}` +
      `&key=${GOOGLE_KEY}`;

    const res = await fetch(url, { redirect: 'manual' });
    const loc = res.headers.get('location');

    if (!loc) {
      console.warn(
        `[google-places] fotoğraf çözülemedi (HTTP ${res.status}), null yazılıyor.`
      );
      return null;
    }
    return loc.replace(SIZE_SUFFIX, '');
  } catch (e) {
    console.warn('[google-places] fotoğraf çözümü patladı:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!GOOGLE_KEY) {
    // Kurulum hatası, geliştiriciye ait: konsola tam teşhis, istemciye kısa kod.
    console.error(
      '[google-places] GOOGLE_PLACES_API_KEY secret tanımsız. ' +
        'supabase secrets set GOOGLE_PLACES_API_KEY=... ile tanımla.'
    );
    return json({ error: 'not_configured' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Kimlik: geçerli bir oturum ŞART ──────────────────────────────────────
  // Kullanıcının KİM olduğu burada kullanılmıyor (`delete-account`'un aksine);
  // istenen tek şey çağrının anonim OLMAMASI. Kimlik iliştirmenin kendisi bu
  // fonksiyonun kota koruması açısından asıl değeri.
  const token = (req.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) return json({ error: 'missing_token' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    console.warn('[google-places] geçersiz token:', userError?.message);
    return json({ error: 'invalid_token' }, 401);
  }

  let body: { action?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  try {
    // ── ⚠️ ACTION: backfill — GEÇİCİ, Aşama 3 bitince SİLİNECEK ────────────
    //
    // Aşama 2'nin "photo_base_urls null → expired" kuralının satırları kendi
    // kendine dolduracağı sanılmıştı. ÖLÇÜM YALANLADI: 57 mekandan 3'ü doldu.
    // Sebep yapısal — kural yalnızca `resolvePlace`'ten geçen, yani kullanıcının
    // AÇTIĞI mekanlarda işliyor; liste ekranları `getPlaces()` ile toplu okuma
    // yapıyor ve yenileme tetiklemiyor (doğru davranış, aksi hâlde 57 satırlık
    // bir liste 57 EF çağrısı üretirdi).
    //
    // 🔑 GOOGLE DETAILS ÇAĞRISI YAPMIYOR: satırlarda `photo_refs` ZATEN var,
    // eksik olan yalnızca 302'lerin çözülmesi. Details'i tekrar çekmek hem
    // gereksiz hem Atmosphere SKU'sundan faturalanırdı.
    //
    // Çağrı başına sınırlı çalışıyor: EF'in duvar saati limiti var ve mekan
    // başına 10'a kadar fotoğraf çözümü yapılıyor. Kalan sayısı dönüyor,
    // çağıran bitene kadar tekrarlıyor.
    if (body.action === 'backfill') {
      const limit = Math.min(
        typeof body.limit === 'number' && body.limit > 0 ? body.limit : 10,
        25
      );

      const { data: rows, error: readError } = await admin
        .from('places')
        .select('place_id, photo_refs')
        .is('photo_base_urls', null)
        .limit(limit);

      if (readError) {
        console.error('[google-places] backfill okuma hatası:', readError);
        return json({ error: 'read_failed' }, 500);
      }

      let processed = 0;
      for (const row of rows ?? []) {
        const refs = ((row.photo_refs ?? []) as string[]).slice(0, MAX_PHOTOS);
        // Mekanlar SIRAYLA, mekan içindeki fotoğraflar paralel: Google'ı
        // gereksiz yere dövmeden makul hızda ilerliyor.
        const baseUrls =
          refs.length > 0 ? await Promise.all(refs.map(resolvePhoto)) : [];

        const { error: upError } = await admin
          .from('places')
          // Fotoğrafsız mekan da boş dizi alıyor — null bırakmak onu sonsuz
          // yenileme döngüsüne sokardı (yukarıdaki aynı gerekçe).
          .update({ photo_base_urls: baseUrls })
          .eq('place_id', row.place_id);

        if (upError) {
          console.error(
            `[google-places] backfill yazılamadı (${row.place_id}):`,
            upError
          );
        } else {
          processed++;
        }
      }

      const { count } = await admin
        .from('places')
        .select('place_id', { count: 'exact', head: true })
        .is('photo_base_urls', null);

      console.log(`[google-places] backfill: ${processed} işlendi, ${count} kaldı`);
      return json({ processed, remaining: count ?? 0 });
    }

    // ── ACTION: details ────────────────────────────────────────────────────
    if (body.action === 'details') {
      const placeId =
        typeof body.placeId === 'string' ? body.placeId.trim() : '';
      if (!placeId) return json({ error: 'missing_place_id' }, 400);

      const detail = await googleJson<{ result?: Record<string, unknown> }>(
        'details',
        { place_id: placeId, fields: PLACE_DETAIL_FIELDS, language: 'tr' }
      );

      const result = detail.result;
      if (!result) {
        // Place ID değişmiş olabilir — istemci bunu cache miss gibi karşılıyor.
        return json({ place: null });
      }

      const photos = (result.photos ?? []) as Array<{
        photo_reference?: string;
      }>;
      const refs = photos
        .map((p) => p.photo_reference)
        .filter((r): r is string => typeof r === 'string' && r.length > 0)
        .slice(0, MAX_PHOTOS);

      const geometry = result.geometry as
        | { location?: { lat?: number; lng?: number } }
        | undefined;

      /**
       * İsim kaynağı sırası: Google → çağıranın verdiği `fallbackName`.
       *
       * POI dokunuşunda isim native harita olayından geliyor ve Google detayda
       * isim döndürmezse elimizdeki TEK kaynak o — çöpe atmayalım. `placeId`'yi
       * isim diye yazmak ise NOT_FOUND'u 7 gün boyunca maskelerdi, o yüzden
       * ikisi de yoksa satır YAZILMIYOR ve hata dönüyor (istemcinin eski
       * davranışının aynısı).
       */
      const fallbackName =
        typeof body.fallbackName === 'string' ? body.fallbackName.trim() : '';
      const name = ((result.name as string | undefined) ?? '').trim() || fallbackName;

      if (!name) {
        console.warn(
          `[google-places] ${placeId} için isim yok (ne Google ne fallback).`
        );
        return json({ error: 'missing_name' }, 422);
      }

      // 1) Normalizasyon kuralı TEK yerde kalsın diye RPC: koordinat kırpma,
      //    dizi temizliği ve `fetched_at` orada yaşıyor.
      const { error: rpcError } = await admin.rpc('upsert_place', {
        p_place_id: placeId,
        p_name: name,
        p_formatted_address: result.formatted_address ?? null,
        p_latitude: geometry?.location?.lat ?? null,
        p_longitude: geometry?.location?.lng ?? null,
        p_types: (result.types as string[] | undefined) ?? null,
        p_google_rating:
          typeof result.rating === 'number' ? result.rating : null,
        p_user_ratings_total:
          typeof result.user_ratings_total === 'number'
            ? result.user_ratings_total
            : null,
        p_price_level:
          typeof result.price_level === 'number' ? result.price_level : null,
        p_photo_refs: refs.length > 0 ? refs : null,
      });

      if (rpcError) {
        console.error('[google-places] upsert_place patladı:', rpcError);
        return json({ error: 'upsert_failed' }, 500);
      }

      // 2) Taban adresler. Hizalama korunuyor: çözülemeyen ref → null.
      //    Paralel, çünkü en fazla 10 istek ve hepsi birbirinden bağımsız.
      const baseUrls =
        refs.length > 0 ? await Promise.all(refs.map(resolvePhoto)) : [];

      const { error: urlError } = await admin
        .from('places')
        /**
         * ⚠️ BOŞ DİZİ YAZILIYOR, null DEĞİL — bu bir hata düzeltmesi.
         *
         * Önce `baseUrls.length > 0 ? baseUrls : null` yazılıyordu ve fotoğrafı
         * HİÇ olmayan bir mekan null alıyordu. `freshnessOf` null'ı 'expired'
         * saydığı için o mekan HER açılışta yeniden yenileniyordu: sonsuz ve
         * faturalanan bir döngü.
         *
         * Boş dizi null değil, yani tazelik normal işliyor; okuma tarafında da
         * `photo_base_urls?.[0]` zaten `undefined` veriyor. null'ın tek anlamı
         * artık "bu satır hiç işlenmedi" olmalı — kuralın dayandığı şey bu.
         */
        .update({ photo_base_urls: baseUrls })
        .eq('place_id', placeId);

      if (urlError) {
        // Mekan satırı YAZILDI, yalnızca adresler eksik kaldı. Aşama 2'nin
        // "taban adresi yoksa expired say" kuralı bunu kendiliğinden
        // toparlayacağı için isteği başarısız SAYMIYORUZ.
        console.error('[google-places] photo_base_urls yazılamadı:', urlError);
      }

      // Satırı okuyup döndürüyoruz: istemci Aşama 2'de bunu doğrudan L1'e
      // koyacak ve ayrıca bir Supabase turu atmasına gerek kalmayacak.
      const { data: place, error: readError } = await admin
        .from('places')
        .select('*')
        .eq('place_id', placeId)
        .maybeSingle();

      if (readError) {
        console.error('[google-places] satır okunamadı:', readError);
        return json({ error: 'read_failed' }, 500);
      }
      return json({ place });
    }

    // ── ACTION: autocomplete ───────────────────────────────────────────────
    if (body.action === 'autocomplete') {
      const input = typeof body.input === 'string' ? body.input.trim() : '';
      // İstemcideki `MIN_QUERY_LENGTH` ile aynı eşik.
      if (input.length < 2) return json({ predictions: [] });

      const lat = typeof body.latitude === 'number' ? body.latitude : undefined;
      const lng =
        typeof body.longitude === 'number' ? body.longitude : undefined;
      const radius = typeof body.radius === 'number' ? body.radius : 50000;

      // Bias SIRALAR, daraltmaz — yanlış bir varsayılan bile global sonuçtan
      // iyi. Daraltan `locationrestriction` bilinçli olarak kullanılmıyor.
      const bias =
        lat !== undefined && lng !== undefined
          ? `circle:${radius}@${lat},${lng}`
          : undefined;

      const data = await googleJson<{ predictions?: unknown[] }>(
        'autocomplete',
        {
          input,
          types: 'restaurant|food|cafe|bar',
          language: 'tr',
          locationbias: bias,
        }
      );

      return json({ predictions: data.predictions ?? [] });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    // Google'ın durum kodu istemciye ÇIPLAK gitmiyor: ekrana kısa ve eyleme
    // dönük metin yazmak istemcinin işi, buradan yalnızca kısa bir kod dönüyor.
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    console.error(`[google-places] action=${body.action} başarısız:`, code);
    return json({ error: 'places_failed', code }, 502);
  }
});
