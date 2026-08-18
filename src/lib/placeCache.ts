// `places` tablosu (migration 002) için cache katmanı.
//
// Bu modül `places.ts`'ten AYRI tutuluyor bilinçli olarak: `places.ts` saf bir
// Google istemcisi, Supabase'i hiç tanımıyor. Burası ikisini birleştiren yer —
// Supabase okuması + TTL kararı + gerektiğinde Google'a düşüp cache'i doldurma.
//
// ⚠️ ARTIK GOOGLE'A İSTEMCİDEN GİDİLMİYOR (Aşama 2, 2026-08-17). L3 katmanı
// `google-places` Edge Function'a taşındı: anahtar sunucuda, çağrı kimliğe
// bağlı. Yazma da orada — `upsert_place()` RPC'sini artık EF çağırıyor.
// Bu modülde kalan iş L1 (bellek) + L2 (`places` okuması) + TTL kararı.

import { supabase } from './supabaseClient';
import type { Place } from '../types';

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

/**
 * `fetched_at`e göre tazelik. Bozuk/eksik tarih güvenli tarafa, 'expired'a düşer.
 *
 * ⚠️ EK KURAL: `photo_base_urls` YOKSA satır 'expired' sayılır (Aşama 2).
 * Migration 022 kolonu boş ekledi ve mevcut satırların hiçbirinde çözülmüş
 * adres yok. Ayrı bir backfill script'i yazmak yerine mevcut yenileme
 * makinesini kullanıyoruz: satır bayat sayılıyor, `refreshPlace` EF'e gidiyor,
 * EF adresleri dolduruyor. Kendi kendini iyileştiren backfill.
 *
 * Bu kural Aşama 3'ten ÖNCE devrede olmalı ki fotoğraf yolu sahaya indiğinde
 * satırlar çoktan dolmuş olsun — aksi hâlde bir tur boş fotoğraf görünürdü.
 * Satırlar dolduktan sonra kural pratikte hiç tetiklenmiyor; kaldırmak için
 * ayrı bir sebep yok, çünkü "adres yoksa fotoğraf gösterilemez" kalıcı olarak
 * doğru.
 */
export function freshnessOf(
  place: Pick<Place, 'fetched_at' | 'photo_base_urls'>
): PlaceFreshness {
  if (place.photo_base_urls === null) return 'expired';

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
 * Google'dan çeker, cache'e yazar, yazılan satırı döndürür.
 *
 * ── AŞAMA 2: GOOGLE'A ARTIK BURADAN GİDİLMİYOR ─────────────────────────────
 * Eskiden bu fonksiyon Google'ı çağırıp `upsert_place` RPC'sine yazıyordu.
 * Artık tek iş `google-places` Edge Function'ını çağırmak: anahtar sunucuda,
 * çağrı Supabase JWT'siyle kimliğe bağlı. EF hem Google'ı çağırıyor hem RPC'ye
 * yazıyor hem fotoğraf 302'lerini çözüyor.
 *
 * Yan fayda: EF yazdığı satırı GERİ DÖNDÜRÜYOR, yani eskiden zorunlu olan
 * "yaz, sonra tekrar oku" turu (`getPlace`) kalktı — bir Supabase gidiş-dönüşü
 * daha az.
 *
 * `fallbackName` EF'e GÖNDERİLİYOR: POI dokunuşunda isim native event'ten
 * geliyor ve Google detayda isim döndürmezse tek kaynağımız o. Göndermeseydik
 * EF isimsiz kalır ve satırı yazamazdı.
 *
 * Hata YUTULMUYOR: EF patlarsa fırlatır, çağıran ekran hata şeridini gösterir.
 */
export function refreshPlace(
  placeId: string,
  opts?: { fallbackName?: string }
): Promise<Place | null> {
  const pending = inFlight.get(placeId);
  if (pending) return pending;

  const task = (async () => {
    const { data, error } = await supabase.functions.invoke<{
      place: Place | null;
    }>('google-places', {
      body: {
        action: 'details',
        placeId,
        fallbackName: opts?.fallbackName ?? null,
      },
    });

    if (error) {
      // Ham hata konsola; çağıran ekran kendi kısa metnini gösteriyor.
      console.error(`[placeCache] google-places başarısız (${placeId}):`, error);
      throw new Error(`[placeCache] mekan bilgisi alınamadı (${placeId})`);
    }

    const place = data?.place ?? null;
    if (!place) {
      // Google OK dedi ama sonuç yok. İsim uydurup satır yazsak NOT_FOUND'u
      // 7 gün boyunca maskelemiş olurduk.
      throw new Error(
        `[placeCache] Place Details boş döndü (${placeId}) — place_id değişmiş olabilir.`
      );
    }

    // EF'in döndürdüğü satır kanonik; L1'e doğrudan koyuyoruz.
    return remember(place);
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
