import { LocationCoords } from '../hooks/useLocation';

/**
 * Konum bilinmediğinde kullanılan varsayılan merkez — Ankara.
 *
 * NEDEN PAYLAŞILAN DOSYA: bu koordinatlar bir dönem yalnızca `MapScreen`'de
 * duruyordu ve `SearchScreen`'in böyle bir fallback'i HİÇ YOKTU. Sonuç, aynı
 * eksik konumun iki ekranda çok farklı görünmesiydi: harita sessizce Ankara'yı
 * gösteriyor (sorun yokmuş gibi), arama ise konum bias'ını tamamen düşürüp
 * DÜNYA GENELİNDEN sonuç döndürüyordu. İkinci kopya açmak yerine tek kaynak.
 *
 * ⚠️ Bu bir VARSAYILAN, bir kısıt değil. Places çağrılarında `locationbias`
 * olarak kullanılıyor — yani sonuçları SIRALIYOR, daraltmıyor. Kullanıcı
 * gerçekten başka bir şehirdeyse açık bir arama ("kadıköy kahve") yine doğru
 * sonucu veriyor. Daraltan parametre `locationrestriction` ve kullanılmıyor.
 */
export const DEFAULT_COORDS: LocationCoords = {
  latitude: 39.9334,
  longitude: 32.8597,
};
