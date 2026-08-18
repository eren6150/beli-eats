// Google Places API (legacy) — merkezi istemci
//
// Bu modülün tek varlık sebebi: Places API hatayı HTTP 200 + gövdedeki
// "status" alanı ile bildirir. Doğrudan fetch eden kod json.status'ü
// kontrol etmezse REQUEST_DENIED / OVER_QUERY_LIMIT gibi hatalar sessizce
// "sonuç yok"a dönüşür. Buradaki her çağrı status'ü kontrol eder.

const BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * ⚠️ NATIVE HARİTA ANAHTARINDAN AYRI — `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` DEĞİL.
 *
 * Projede iki farklı Google trafiği var ve kısıtlamaya tepkileri ZIT:
 *
 *   A) Native harita → Maps SDK for Android. SDK isteğe paket adını ve imzayı
 *      kendisi ekliyor, bu yüzden "Android apps (paket + SHA-1)" kısıtlaması
 *      ÇALIŞIYOR. O anahtar `app.config.js` → AndroidManifest yoluyla BUILD
 *      ANINDA gömülüyor ve `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` olarak kalıyor.
 *
 *   B) Bu dosyanın yaptığı Places REST çağrıları → JS'ten düz HTTPS. Bu
 *      isteklerde paket adı/imza YOK, dolayısıyla Android uygulama kısıtlaması
 *      onları tanıyamaz ve konsaydık hepsi REQUEST_DENIED olurdu.
 *
 * Bu yüzden B ayrı bir anahtar: Application restrictions = None (mobil REST
 * çağrıları kilitlenemiyor — IP ve HTTP referrer mobilde işe yaramaz),
 * API restrictions = yalnızca Places API. Korumaları: API kısıtı + günlük
 * 2.000 kota + bütçe uyarısı.
 *
 * Kalıcı çözüm CLAUDE.md'de kayıtlı: Google çağrılarını Supabase Edge Function
 * arkasına almak — o gün bu anahtar istemciden tamamen kalkar.
 */
export const GOOGLE_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

// ─── Hata tipi ────────────────────────────────────────────────────────────────

// ─── Tür sınıflandırma ────────────────────────────────────────────────────────
//
// Haritadaki native Google POI'lerine dokunulduğunda park, müze, mağaza da
// geliyor. `onPoiClick` payload'ı yalnızca { placeId, name, coordinate }
// içeriyor — tür bilgisi YOK. Bu yüzden sınıflandırma Place Details'ten (veya
// `places` cache'inden) gelen `types` dizisi üzerinden yapılıyor.
//
// `types` alanı `PLACE_DETAIL_FIELDS` maskesinde zaten var → ek maliyet yok.

/** Yeme-içme kategorisinin GÜÇLÜ sinyalleri — biri varsa karar kesin. */
const FOOD_TYPES: ReadonlySet<string> = new Set([
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'meal_takeaway',
  'meal_delivery',
  'night_club',
]);

/**
 * `food` sinyalini GEÇERSİZ kılan mağaza türleri.
 *
 * `food` tek başına yeterli değil: bir süpermarket
 * ["supermarket","grocery_or_supermarket","food","store",...] döndürüyor.
 * Koşulsuz kabul etmek marketleri içeri alırdı.
 */
const STORE_TYPES: ReadonlySet<string> = new Set([
  'supermarket',
  'grocery_or_supermarket',
  'convenience_store',
  'store',
  'liquor_store',
  'gas_station',
  'department_store',
  'shopping_mall',
]);

/**
 * Mekan yeme-içme kategorisinde mi?
 *
 * Kural iki kademeli:
 *   1. Güçlü listeden biri varsa            → evet
 *   2. `food` var VE mağaza türü yoksa      → evet
 *   3. Aksi halde                           → hayır
 *
 * 2. kademe bilinçli olarak gevşek: **gerçek bir restoranı reddetmek, bir
 * marketi kabul etmekten daha kötü** — ürünün ana eylemini (puanlama)
 * engelliyor. Bazı küçük esnaf lokantaları Google'da yalnızca `food`
 * etiketiyle geliyor.
 *
 * Oteller `lodging` + `restaurant` döndürür → 1. kademe eşleşir → kabul.
 * Otel restoranları puanlanabilir olmalı, doğru davranış bu.
 *
 * `types` boş/null ise `false`. Sınıflandırılamayan bir mekanı kabul etmek
 * filtrenin amacını ortadan kaldırırdı. (Migration 002 backfill'i types'ı boş
 * bırakmıştı ama o satırlar kullanıcının kendi puanladıkları — filtreye hiç
 * girmiyorlar, ayrıca `fetched_at='epoch'` oldukları için ilk okumada
 * Google'dan tazelenip types'ları doluyor.)
 */
export function isFoodPlace(types: readonly string[] | null | undefined): boolean {
  if (!types || types.length === 0) return false;

  for (const t of types) {
    if (FOOD_TYPES.has(t)) return true;
  }

  if (!types.includes('food')) return false;
  return !types.some((t) => STORE_TYPES.has(t));
}

// ─── Koordinat doğrulama ──────────────────────────────────────────────────────

/**
 * Herhangi bir değeri güvenli biçimde number'a dönüştürür.
 * NaN, null, undefined veya harita sınırı dışındaki değerler için null döner.
 */
export function parseCoord(value: unknown, type: 'lat' | 'lng'): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  if (type === 'lat' && (n < -90 || n > 90)) return null;
  if (type === 'lng' && (n < -180 || n > 180)) return null;
  return n;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * ⚠️ GOOGLE'A JSON İSTEĞİ ATAN FONKSİYONLAR BURADAN KALKTI (Aşama 2).
 *
 * `getPlaceDetails`, `autocomplete` ve `nearbySearch` `google-places` Edge
 * Function'ına taşındı: anahtar artık sunucuda ve çağrılar Supabase JWT'siyle
 * kimliğe bağlı. İstemcide kalan tek Google yolu `photoUrl` — o da Aşama 3'te
 * `places.photo_base_urls`'e geçince `GOOGLE_API_KEY` bundle'dan tamamen
 * çıkacak.
 *
 * `nearbySearch` ayrıca zaten ÖLÜ koddu (hiç çağrılmıyordu) ve EF'e de
 * taşınmadı; ihtiyaç doğarsa orada yazılır.
 */

/**
 * `places.photo_base_urls` içindeki taban adrese genişlik ekler.
 *
 * ── NASIL ÇALIŞIYOR ─────────────────────────────────────────────────────────
 * Edge Function, Google'ın `/place/photo` ucunun döndürdüğü **302**'yi bir kez
 * çözüp `Location` adresini BOYUT EKİ OLMADAN saklıyor:
 *     https://lh3.googleusercontent.com/place-photos/AG9NLj…
 * Sondaki `=s1600-w400` boyut ekidir ve değiştirilebilir (ölçüldü: `=w800` ile
 * de yükleniyor). Bu yüzden tek bir çözüm bütün genişliklere yetiyor.
 *
 * ── NEDEN SENKRON ───────────────────────────────────────────────────────────
 * Adres zaten `places` satırında; çözüm anında yapılmıyor. Bu, fonksiyonu
 * `renderItem` içinde çağrılabilir tutuyor — async yapmak 12 render yolunu
 * state'e taşımak demekti.
 *
 * Anahtar İÇERMİYOR: adres Google CDN'ine gidiyor ve `<Image>` oradan
 * doğrudan yüklüyor, yani Supabase egress'i de yok.
 */
export function placePhotoUrl(
  baseUrl: string | null | undefined,
  width: number
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}=w${width}`;
}

/**
 * ⚠️ ESKİ YOL — kaldırılıyor, YENİ ÇAĞRI EKLEME. Yerine `placePhotoUrl`.
 *
 * Anahtarı URL'e gömüyor, yani `GOOGLE_API_KEY`'i bundle'da tutan son bağ bu.
 * Aşama 3'ün adımları çağrı yerlerini sırayla `placePhotoUrl`'e taşıyor;
 * sonuncusu taşındığında bu fonksiyon ve `GOOGLE_API_KEY` birlikte silinecek.
 *
 * ⚠️ SÖZLEŞMESİ BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ: `placePhotoUrl` ile aynı
 * imzayı taşıyor ama FARKLI bir girdi bekliyor (referans ↔ taban adres).
 * İkisini tek fonksiyonda birleştirip girdiyi koklamak (`https://` ile mi
 * başlıyor) cazipti; yapılmadı — bu proje kırılgan sezgisel ayrımları bir kez
 * reddetti. İki ayrı isim, hangi çağrı yerinin taşındığını okunur kılıyor.
 */
export function photoUrl(
  photoReference: string | null | undefined,
  maxWidth: number
): string | null {
  if (!photoReference || !GOOGLE_API_KEY) return null;
  return (
    `${BASE}/photo?maxwidth=${maxWidth}` +
    `&photoreference=${encodeURIComponent(photoReference)}` +
    `&key=${GOOGLE_API_KEY}`
  );
}
