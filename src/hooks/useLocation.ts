import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { DEFAULT_COORDS } from '../constants/location';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

/** GPS fix'i bu süreden uzun sürerse bekleme bırakılır (ms). */
const FIX_TIMEOUT_MS = 10_000;

/** Son bilinen konum bu yaştan gençse anında kullanılır (ms). */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

export function useLocation() {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Unmount sonrası setState uyarısını önler. */
  const activeRef = useRef(true);

  const resolve = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (activeRef.current) setErrorMsg('Konum izni verilmedi.');
        return;
      }

      // 1) Son bilinen konum — varsa haritayı bekletmeden aç.
      let haveFallback = false;
      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        });
        if (last && activeRef.current) {
          haveFallback = true;
          setLocation({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
          });
        }
      } catch {
        // Son bilinen konum yoksa sorun değil, taze fix'e geçiyoruz.
      }

      // 2) Taze fix — süresiz asılı kalmaması için timeout ile yarıştır.
      //    expo-location'ın kendi timeout opsiyonu yok (SDK 54).
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), FIX_TIMEOUT_MS)),
      ]);

      if (!activeRef.current) return;

      if (fresh) {
        setLocation({
          latitude: fresh.coords.latitude,
          longitude: fresh.coords.longitude,
        });
      } else if (!haveFallback) {
        // Timeout doldu ve elde son bilinen konum da yok.
        setErrorMsg('Konum alınamadı (zaman aşımı). Konum servisleri açık mı?');
      }
    } catch (e) {
      // Konum servisleri kapalıysa getCurrentPositionAsync reject eder.
      // Eskiden burada yakalanmadığı için loading sonsuza kadar true kalıyordu.
      //
      // Ham `e.message` (expo-location'ın native mesajı) EKRANA ÇIKMIYOR —
      // yukarıdaki log'da duruyor. `errorMsg` doğrudan kullanıcıya gösteriliyor
      // (MapScreen'in bilgi kartı), o yüzden sabit ve eyleme dönük.
      console.warn('[useLocation] konum alınamadı:', e);
      if (activeRef.current) {
        setErrorMsg('Konum alınamadı. Konum servisleri açık mı?');
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    resolve();
    return () => {
      activeRef.current = false;
    };
  }, [resolve]);

  /**
   * Konum + fallback. `location` null olduğu HER durumda Ankara'ya düşüyor.
   *
   * ── NEDEN AYRI BİR DEĞER, `location`'ı doldurmak DEĞİL ───────────────────
   * `location === null` bilgisi hâlâ gerekli: `MapScreen` ona bakıp "konumun
   * alınamadı" satırını gösteriyor. `location`'ı fallback'le doldursaydık o
   * ayrım kaybolur ve harita, konumu bilmediğini kullanıcıya söyleyemezdi.
   * Yani: `location` = "gerçekten biliyor muyuz", `effectiveLocation` =
   * "hesaplamada ne kullanalım".
   *
   * ── HANGİ İKİ SENARYOYU BİRDEN KAPSIYOR ──────────────────────────────────
   *   1. İzin verilmedi / konum alınamadı → `location` kalıcı olarak null
   *   2. İzin var ama HENÜZ ÇÖZÜLMEDİ → `location` geçici olarak null
   * İkincisi gözden kaçan taraftı: `resolve()` asenkron, ve bu arada yapılan
   * bir arama bias'sız gidip dünya genelinden sonuç döndürüyordu. Tüketiciler
   * `effectiveLocation` kullandığında iki senaryo da kendiliğinden kapanıyor —
   * ölçülen değeri bilmeye ihtiyaç duymayan bir düzeltme (nav bar dersi).
   */
  const effectiveLocation = location ?? DEFAULT_COORDS;

  return { location, effectiveLocation, errorMsg, loading, retry: resolve };
}
