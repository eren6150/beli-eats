// Mekan yardımcıları — GOOGLE'A ARTIK HİÇ GİTMİYOR.
//
// Bu dosya bir dönem "merkezi Google Places istemcisi"ydi: JSON çağrıları,
// `status` yorumlama, hata tipi ve API anahtarı hep buradaydı. Aşama 2-4 ile o
// işlerin tamamı `google-places` Edge Function'ına taşındı ve anahtar
// bundle'dan ÇIKARILDI — `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` artık tanımlı
// değil ve tanımlanmamalı.
//
// ⚠️ NATIVE HARİTA ANAHTARI AYRI ve DURUYOR: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`,
// `app.config.js` → AndroidManifest yoluyla BUILD ANINDA gömülüyor ve harita
// karolarını çiziyor. Android uygulama kısıtlaması (paket + SHA-1) ONDA
// çalışıyor, çünkü Maps SDK isteğe paket adını ve imzayı kendisi ekliyor.
// Buradan kaldırılan anahtar ondan FARKLIYDI: düz HTTPS ile giden REST
// çağrılarında paket/imza yok, yani hiçbir zaman kısıtlanamıyordu — tek çözüm
// onu sunucuya almaktı.
//
// Geriye kalan üç fonksiyon da saf yerel yardımcı: ağ yok, anahtar yok.

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

// ─── Fotoğraf adresi ──────────────────────────────────────────────────────────

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
