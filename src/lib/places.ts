// Google Places API (legacy) — merkezi istemci
//
// Bu modülün tek varlık sebebi: Places API hatayı HTTP 200 + gövdedeki
// "status" alanı ile bildirir. Doğrudan fetch eden kod json.status'ü
// kontrol etmezse REQUEST_DENIED / OVER_QUERY_LIMIT gibi hatalar sessizce
// "sonuç yok"a dönüşür. Buradaki her çağrı status'ü kontrol eder.

const BASE = 'https://maps.googleapis.com/maps/api/place';

export const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// ─── Hata tipi ────────────────────────────────────────────────────────────────

/** Places status kodlarının okunabilir karşılıkları (log'da ne yapılacağını söyler). */
const STATUS_HINTS: Record<string, string> = {
  REQUEST_DENIED:
    'API key reddedildi. Google Cloud Console: Places API açık mı, key kısıtlaması bu paketi kapsıyor mu?',
  OVER_QUERY_LIMIT:
    'Kota doldu veya faturalandırma kapalı. Google Cloud Console → Billing.',
  INVALID_REQUEST: 'Zorunlu parametre eksik veya hatalı.',
  NOT_FOUND: 'place_id bulunamadı — kayıt eski/geçersiz olabilir.',
  UNKNOWN_ERROR: 'Google tarafında geçici hata, tekrar denenebilir.',
  NO_API_KEY:
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımsız. .env dosyasını kontrol et ve Metro\'yu yeniden başlat.',
};

export class PlacesError extends Error {
  constructor(
    readonly status: string,
    readonly endpoint: string,
    googleMessage?: string
  ) {
    const hint = STATUS_HINTS[status] ?? 'Beklenmeyen status.';
    super(
      `[Places/${endpoint}] ${status} — ${hint}` +
        (googleMessage ? ` Google: "${googleMessage}"` : '')
    );
    this.name = 'PlacesError';
  }
}

// ─── Ortak istek katmanı ──────────────────────────────────────────────────────

type Params = Record<string, string | number | undefined>;

async function placesRequest<T>(
  endpoint: string,
  params: Params
): Promise<T> {
  if (!GOOGLE_API_KEY) {
    throw new PlacesError('NO_API_KEY', endpoint);
  }

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.append(key, String(value));
  }
  qs.append('key', GOOGLE_API_KEY);

  const res = await fetch(`${BASE}/${endpoint}/json?${qs.toString()}`);
  if (!res.ok) {
    throw new PlacesError(`HTTP_${res.status}`, endpoint, res.statusText);
  }

  const json = await res.json();

  // ZERO_RESULTS hata değil — boş sonuç kümesi. Diğer her şey hata.
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new PlacesError(json.status ?? 'NO_STATUS', endpoint, json.error_message);
  }

  return json as T;
}

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface PlaceGeometry {
  location: { lat: number; lng: number };
}

export interface NearbyPlace {
  place_id: string;
  name: string;
  geometry: PlaceGeometry;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
  photos?: Array<{ photo_reference: string }>;
  business_status?: string;
}

export interface PlaceDetailsResult {
  place_id?: string;
  geometry?: PlaceGeometry;
  types?: string[];
  formatted_address?: string;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: Array<{ photo_reference: string }>;
}

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

/** Tek bir mekanın detayını çeker. Alan listesi maliyeti etkiler, dar tut. */
export async function getPlaceDetails(
  placeId: string,
  fields: string
): Promise<PlaceDetailsResult | null> {
  const json = await placesRequest<{ result?: PlaceDetailsResult }>(
    'details',
    { place_id: placeId, fields, language: 'tr' }
  );
  return json.result ?? null;
}

/**
 * Verilen koordinatın çevresindeki restoranları getirir.
 * Nearby Search geometry'yi yanıtın içinde döndürür — ek details çağrısı gerekmez.
 */
export async function nearbySearch(opts: {
  latitude: number;
  longitude: number;
  radius: number;
  type?: string;
}): Promise<NearbyPlace[]> {
  const json = await placesRequest<{ results?: NearbyPlace[] }>(
    'nearbysearch',
    {
      location: `${opts.latitude},${opts.longitude}`,
      radius: opts.radius,
      type: opts.type ?? 'restaurant',
      language: 'tr',
    }
  );
  return json.results ?? [];
}

/** Autocomplete önerileri. locationbias verilirse sonuçlar o çevreye öncelenir. */
export async function autocomplete(opts: {
  input: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
}): Promise<any[]> {
  const bias =
    opts.latitude !== undefined && opts.longitude !== undefined
      ? `circle:${opts.radius ?? 50000}@${opts.latitude},${opts.longitude}`
      : undefined;

  const json = await placesRequest<{ predictions?: any[] }>('autocomplete', {
    input: opts.input,
    types: 'restaurant|food|cafe|bar',
    language: 'tr',
    locationbias: bias,
  });
  return json.predictions ?? [];
}

/** Photo endpoint'i JSON değil görsel döndürür — URL'i doğrudan <Image> alır. */
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
