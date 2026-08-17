import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Arama geçmişi — CİHAZDA saklanıyor, Supabase'de değil.
 *
 * ── NEDEN CİHAZDA ────────────────────────────────────────────────────────────
 * Arama geçmişi bir KOLAYLIK, taşınmaya değer bir varlık değil: cihaz
 * değişince kaybolması kullanıcıya hiçbir şeye mal olmuyor. Buna karşılık
 * sunucuda tutmak yeni bir tablo + RLS + her aramada yazma + her açılışta
 * okuma demekti — üstelik arama kutusunun ANINDA açılması gereken bir yüzey
 * olması ağ turunu istenmez kılıyor. Gizlilik tarafı da aynı yöne bakıyor:
 * terimler cihazdan hiç çıkmıyor.
 *
 * `@react-native-async-storage/async-storage` ZATEN kurulu (`supabaseClient`
 * oturumu onunla saklıyor), yani yeni bağımlılık ve build gerekmedi.
 *
 * ── ⚠️ ANAHTAR KULLANICIYA BAĞLI — gizlilik açığını kapatıyor ───────────────
 * AsyncStorage UYGULAMA başına, kullanıcı başına DEĞİL. Sabit bir anahtar
 * kullanılsaydı aynı telefonda hesap değiştiren iki kişi birbirinin arama
 * geçmişini görürdü — ve bu projede tam olarak öyle çalışılıyor (arkadaşla
 * çapraz hesap testi). Anahtarı kullanıcıya bağlamak, çıkışta silmekten de
 * iyi: tekrar girince kendi geçmişi geri geliyor.
 */

/** Tutulan en fazla terim. Klasik değer; ekranda kaydırmadan sığıyor. */
const MAX_ITEMS = 10;

const keyFor = (userId: string | undefined) =>
  `searchHistory:${userId ?? 'anon'}`;

/**
 * İki terim "aynı" mı.
 *
 * Büyük/küçük harf duyarsız ama AKSAN DUYARLI (`sensitivity: 'accent'`):
 * "Kebap" ile "kebap" aynı sayılıyor, "kebap" ile "köbap" ayrı.
 *
 * ⚠️ `toLowerCase()` KULLANILMIYOR — Türkçe'de bozuk: JS'in varsayılan
 * küçültmesi "İ"yi birleşik noktalı bir karaktere çeviriyor ve "I" → "i"
 * yapıyor (Türkçe'de "ı" olmalı). `localeCompare`'e 'tr' vermek bu sınıfı
 * kökten atlıyor.
 */
const isSame = (a: string, b: string) =>
  a.localeCompare(b, 'tr', { sensitivity: 'accent' }) === 0;

export function useSearchHistory(userId: string | undefined) {
  const [terms, setTerms] = useState<string[]>([]);

  /**
   * Okuma. `userId` değişince (giriş/çıkış) yeniden yükleniyor — aksi halde
   * önceki kullanıcının listesi ekranda kalırdı.
   *
   * Hata KULLANICIYA YANSITILMIYOR: geçmiş okunamazsa liste boş görünür ve
   * arama normal çalışmaya devam eder. Bir kolaylık verisinin okunamaması
   * ekranda hata şeridi göstermeyi hak etmiyor.
   */
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(keyFor(userId))
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setTerms([]);
          return;
        }
        const parsed = JSON.parse(raw);
        // Bozuk/eski biçime karşı savunma: dizi değilse yok say.
        setTerms(Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []);
      })
      .catch((e) => {
        console.warn('[useSearchHistory] geçmiş okunamadı:', e);
        if (!cancelled) setTerms([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Yazma yardımcısı — state ÖNCE, disk sonra.
   *
   * Kullanıcı listeyi anında görüyor; disk yazımı başarısız olursa yalnızca
   * kalıcılık kayboluyor, ekran doğru kalıyor.
   */
  const persist = useCallback(
    (next: string[]) => {
      setTerms(next);
      AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch((e) =>
        console.warn('[useSearchHistory] geçmiş yazılamadı:', e)
      );
    },
    [userId]
  );

  /**
   * Terimi kaydet.
   *
   * ── TEKRAR ARANAN TERİM BAŞA TAŞINIYOR ────────────────────────────────────
   * "Zaten varsa ekleme" DEĞİL: kullanıcı tekrar aradıysa o terim artık DAHA
   * alakalı. Google/YouTube/Instagram deseni. Saklanan hâli kullanıcının EN SON
   * yazdığı yazım (büyük/küçük harf farkı varsa yenisi kazanıyor).
   *
   * ⚠️ ÇAĞRILDIĞI YER ÖNEMLİ: her tamamlanan aramada değil, kullanıcı bir
   * SONUCA DOKUNDUĞUNDA. Gerekçe `SearchScreen.handleSelect`'te.
   */
  const record = useCallback(
    (raw: string) => {
      const term = raw.trim();
      if (!term) return;
      // ⚠️ `setTerms(prev => ...)` İÇİNDE yazma YAPILMIYOR: React güncelleyicisi
      // SAF olmalı (StrictMode onu iki kez çağırabiliyor, yan etki de iki kez
      // çalışırdı). `remove`/`clear` ile aynı desen.
      persist([term, ...terms.filter((t) => !isSame(t, term))].slice(0, MAX_ITEMS));
    },
    [terms, persist]
  );

  /** Tek terimi sil — onaysız, geri alınabilir bir kayıp değil. */
  const remove = useCallback(
    (term: string) => {
      persist(terms.filter((t) => !isSame(t, term)));
    },
    [terms, persist]
  );

  /** Hepsini sil. Onayı ÇAĞIRAN soruyor (yıkıcı eylem, tek hamlede geri gelmez). */
  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { terms, record, remove, clear };
}
