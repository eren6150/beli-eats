// `places` tablosu (migration 002) için cache katmanı.
//
// Bu modül `places.ts`'ten AYRI tutuluyor bilinçli olarak: `places.ts` saf bir
// Google istemcisi, Supabase'i hiç tanımıyor. Burası ikisini birleştiren yer —
// Supabase okuması + TTL kararı + gerektiğinde Google'a düşüp cache'i doldurma.
//
// Yazma yolu yalnızca `upsert_place()` RPC'si: `places` tablosunda INSERT/UPDATE
// için RLS politikası yok, istemci doğrudan yazamaz (bkz. migration 002 §4-5).

import { supabase } from './supabaseClient';
import { getPlaceDetails, parseCoord, PlaceDetailsResult } from './places';
import type { Place } from '../types';

// ─── Alan maskesi ─────────────────────────────────────────────────────────────

/**
 * Place Details için TEK alan maskesi. Tek olması maliyet kararı:
 * eskiden POI dokunuşu `formatted_address,types,photos,rating`, detay ekranı
 * `name,formatted_address,geometry,photos,rating,price_level` istiyordu —
 * farklı maskeler, ortak cache yok, aynı mekan için iki çağrı. Tek maske
 * ikisini tek cache satırında birleştirir.
 *
 * SKU: `rating`, `user_ratings_total` ve `price_level` **Atmosphere Data**
 * katmanına girer ve Basic'in üzerine eklenir. Maskede bir tane Atmosphere
 * alanı varsa çağrının tamamı o katmandan faturalanır — yani bu üçünü birlikte
 * almanın tek bir tanesini almaya göre EK maliyeti yok.
 *
 * `opening_hours` / `website` / telefon bilinçli olarak yok: onlar Contact SKU'su
 * (ayrı bir ek ücret) ve hiçbir ekran göstermiyor.
 */
export const PLACE_DETAIL_FIELDS = [
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

// ─── TTL ──────────────────────────────────────────────────────────────────────

/**
 * Bu süreden eski satır "bayat": gösterilir ama arka planda yenilenir.
 * 7 gün seçimi — name/geometry/types neredeyse hiç değişmiyor, `rating` oynuyor
 * ama onu ikincil bilgi olarak ("Google ortalaması") gösteriyoruz.
 */
export const STALE_AFTER_DAYS = 7;

/**
 * Sert üst sınır. Google Maps Platform hizmet şartları `place_id` dışındaki
 * içeriğin süresiz saklanmasına izin vermiyor (place_id açık istisna, diğerleri
 * ~30 gün). Bu sınırı geçen satır artık gösterilmez — cache miss gibi davranılır
 * ve gösterimden ÖNCE yenilenir.
 */
export const HARD_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlaceFreshness = 'fresh' | 'stale' | 'expired';

/** `fetched_at`e göre tazelik. Bozuk/eksik tarih güvenli tarafa, 'expired'a düşer. */
export function freshnessOf(place: Pick<Place, 'fetched_at'>): PlaceFreshness {
  const fetchedAt = Date.parse(place.fetched_at);
  if (!Number.isFinite(fetchedAt)) return 'expired';

  const ageDays = (Date.now() - fetchedAt) / DAY_MS;
  if (ageDays < STALE_AFTER_DAYS) return 'fresh';
  if (ageDays < HARD_MAX_AGE_DAYS) return 'stale';
  return 'expired';
}

// ─── L1: modül seviyesi bellek cache'i ────────────────────────────────────────
//
// Neden var: `resolvePlace` en iyi durumda bile bir Supabase round-trip'i
// yapıyordu, yani ekran her mount'ta `loading = true` ile açılıp cache hit'te
// dahi bir kare spinner gösteriyordu. Bellek katmanı bunu SENKRON okunabilir
// hale getiriyor (`peekPlace`) — ekran state'i doğru veriyle başlıyor.
//
// Katmanlar: L1 bellek (bu) → L2 `places` tablosu → L3 Google.

/** Oturum boyunca sınırsız büyümesin; mekan sayısı bunu pratikte aşmaz. */
const MEMORY_LIMIT = 200;

const memory = new Map<string, Place>();

function remember(place: Place): Place {
  // FIFO tahliye: Map ekleme sırasını koruyor, en eski anahtar ilk gelir.
  if (!memory.has(place.place_id) && memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(place.place_id, place);
  return place;
}

/**
 * Bellekte hazır olan mekanı SENKRON döndürür — hiçbir I/O yapmaz.
 *
 * Ekranlar bunu `useState(() => peekPlace(id))` ile başlangıç değeri olarak
 * kullanır: aynı mekana ikinci girişte spinner hiç görünmez.
 *
 * `null` dönmesi "mekan yok" demek DEĞİL, "bellekte yok" demek — çağıran
 * yine `resolvePlace` ile devam etmeli.
 */
export function peekPlace(placeId: string): Place | null {
  return memory.get(placeId) ?? null;
}

// ─── Oturum içi korumalar ─────────────────────────────────────────────────────

/**
 * Oturum başına mekan başına en fazla 1 arka plan yenilemesi. Kullanıcı bir
 * ekranı hızlıca açıp kapatırsa faturalanan çağrı katlanmasın.
 */
const revalidatedThisSession = new Set<string>();

/**
 * Aynı place_id için uçuşta olan Google isteği. İki ekran aynı anda mount
 * olursa (harita + detay) tek çağrı yapılır, ikisi aynı promise'i bekler.
 */
const inFlight = new Map<string, Promise<Place | null>>();

// ─── Okuma (yalnızca Supabase, Google'a gitmez) ────────────────────────────────

/** Tek mekanı cache'ten okur. Satır yoksa null. */
export async function getPlace(placeId: string): Promise<Place | null> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('place_id', placeId)
    .maybeSingle();

  if (error) {
    throw new Error(`[placeCache] places okunamadı (${placeId}): ${error.message}`);
  }

  const place = (data as Place | null) ?? null;
  // L1'i besle: bir sonraki mount senkron okuyabilsin.
  return place ? remember(place) : null;
}

/**
 * Birden çok mekanı tek sorguda okur. Haritanın yolu bu: N satır için N sorgu
 * atmak yeni sildiğimiz N+1'in aynısı olurdu.
 *
 * Dönen Map'te yalnızca cache'te BULUNAN mekanlar var — çağıran eksikleri
 * kendisi ele almalı (harita için "eksik = pin çizilmez", hata değil).
 */
export async function getPlaces(placeIds: string[]): Promise<Map<string, Place>> {
  const unique = Array.from(
    new Set(placeIds.filter((id) => typeof id === 'string' && id.trim() !== ''))
  );
  // Boş dizi ile .in() geçersiz bir filtre üretir; hiç sorgu atmıyoruz.
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .in('place_id', unique);

  if (error) {
    throw new Error(`[placeCache] places toplu okunamadı: ${error.message}`);
  }

  const byId = new Map<string, Place>();
  for (const row of (data ?? []) as Place[]) {
    remember(row);
    byId.set(row.place_id, row);
  }
  return byId;
}

// ─── Yazma (upsert_place RPC'si) ───────────────────────────────────────────────

/**
 * Place Details sonucunu cache'e yazar.
 *
 * `fallbackName`: Google detayda isim döndürmezse kullanılır. POI dokunuşunda
 * isim native event'ten geliyor, elimizde olan bir bilgiyi çöpe atmayalım.
 */
export async function upsertPlaceFromDetails(
  placeId: string,
  details: PlaceDetailsResult,
  opts?: { fallbackName?: string }
): Promise<void> {
  const name = (details.name ?? opts?.fallbackName ?? '').trim();
  if (!name) {
    // RPC de bunu reddediyor (name not null); hatayı burada net verelim.
    throw new Error(
      `[placeCache] "${placeId}" için isim yok — ne Place Details ne fallback döndü.`
    );
  }

  const photoRefs = (details.photos ?? [])
    .map((p) => p.photo_reference)
    .filter((ref): ref is string => typeof ref === 'string' && ref.trim() !== '')
    .slice(0, 10); // RPC de kırpıyor, ama boşuna büyük payload göndermeyelim

  const { error } = await supabase.rpc('upsert_place', {
    p_place_id: placeId,
    p_name: name,
    p_formatted_address: details.formatted_address ?? null,
    // parseCoord: NaN / aralık dışı değerleri null'a çevirir. RPC de aynı
    // kontrolü yapıyor ama orada uyarı üretiyor — buradan temiz gönderiyoruz.
    p_latitude: parseCoord(details.geometry?.location?.lat, 'lat'),
    p_longitude: parseCoord(details.geometry?.location?.lng, 'lng'),
    p_types: details.types && details.types.length > 0 ? details.types : null,
    p_google_rating: typeof details.rating === 'number' ? details.rating : null,
    p_user_ratings_total:
      typeof details.user_ratings_total === 'number' ? details.user_ratings_total : null,
    p_price_level: typeof details.price_level === 'number' ? details.price_level : null,
    p_photo_refs: photoRefs.length > 0 ? photoRefs : null,
  });

  if (error) {
    throw new Error(`[placeCache] upsert_place başarısız (${placeId}): ${error.message}`);
  }
}

/**
 * Google'dan çeker, cache'e yazar, yazılan satırı döndürür.
 *
 * Satırı geri okuyoruz çünkü RPC koordinatı `coalesce` ile koruyor — istemci
 * tarafında ne yazıldığını tahmin etmek yanlış sonuç verirdi.
 *
 * Hata YUTULMUYOR: Google patlarsa fırlatır, çağıran ekran hata şeridini gösterir.
 */
export function refreshPlace(
  placeId: string,
  opts?: { fallbackName?: string }
): Promise<Place | null> {
  const pending = inFlight.get(placeId);
  if (pending) return pending;

  const task = (async () => {
    const details = await getPlaceDetails(placeId, PLACE_DETAIL_FIELDS);
    if (!details) {
      // status OK ama result yok. İsim uydurup satır yazsak NOT_FOUND'u
      // 7 gün boyunca maskelemiş olurduk.
      throw new Error(
        `[placeCache] Place Details boş döndü (${placeId}) — place_id değişmiş olabilir.`
      );
    }
    await upsertPlaceFromDetails(placeId, details, opts);
    return getPlace(placeId);
  })();

  inFlight.set(placeId, task);
  // finally'nin dönüşünü DEĞİL, task'ın kendisini paylaşıyoruz.
  task.finally(() => inFlight.delete(placeId)).catch(() => {});
  return task;
}

// ─── Orkestrasyon: stale-while-revalidate ─────────────────────────────────────

function revalidateInBackground(
  placeId: string,
  opts?: { fallbackName?: string; onRevalidated?: (place: Place) => void }
): void {
  if (revalidatedThisSession.has(placeId)) return;
  revalidatedThisSession.add(placeId);

  refreshPlace(placeId, opts)
    .then((fresh) => {
      if (fresh) opts?.onRevalidated?.(fresh);
    })
    .catch((e) => {
      // Gösterilecek veri ELİMİZDE var; arka plan hatası ekranı kırmamalı.
      // Guard'dan çıkarıyoruz ki bir dahaki açılışta tekrar denenebilsin.
      revalidatedThisSession.delete(placeId);
      console.warn(`[placeCache] arka plan yenilemesi başarısız (${placeId}):`, e);
    });
}

/**
 * Bir mekanı çözer — ekranların kullanacağı ana fonksiyon.
 *
 *   fresh   (< 7 gün)  → cache'ten döner, Google'a HİÇ gitmez
 *   stale   (7-30 gün) → cache'ten HEMEN döner, arka planda yeniler,
 *                        yeni veri gelince `onRevalidated` çağrılır
 *   expired (> 30 gün) → ToS sınırı; cache miss gibi davranır, gösterimden
 *                        önce yenilemeyi BEKLER
 *   yok                → Google'a gider, yazar, döndürür
 *
 * Yalnızca cache-miss / expired yolunda hata fırlatır (gösterilecek bir şey yok).
 * Bayat yolda Google hatası sessizce loglanır, kullanıcı bayat veriyi görür.
 */
export async function resolvePlace(
  placeId: string,
  opts?: { fallbackName?: string; onRevalidated?: (place: Place) => void }
): Promise<Place | null> {
  // L1: bellekte taze kayıt varsa Supabase'e bile gitmiyoruz.
  let cached = peekPlace(placeId);

  if (!cached) {
    try {
      cached = await getPlace(placeId);
    } catch (e) {
      // Cache okuması patladı. Ekranı kırmıyoruz ama SESSİZ de geçmiyoruz:
      // buradan Google'a düşmek faturalanan bir çağrı demek, log'da görünmeli.
      console.error(
        `[placeCache] cache okunamadı, Google'a düşülüyor (${placeId}):`,
        e
      );
    }
  }

  if (cached) {
    const freshness = freshnessOf(cached);
    if (freshness === 'fresh') return cached;
    if (freshness === 'stale') {
      revalidateInBackground(placeId, opts);
      return cached;
    }
    // 'expired' → aşağıya düşer, yenilemeyi bekler.
  }

  return refreshPlace(placeId, opts);
}
