import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors, Type, Spacing } from '../../constants/theme';

/**
 * Yıldız gösterimi — hem salt okunur hem puanlama modunda.
 *
 * Neden özel bileşen:
 *  1. Yarım yıldız için önceden '⯨' (U+2BE8) kullanılıyordu. Bu glif çoğu
 *     Android sistem fontunda yok — tofu kutusu olarak çiziliyor ve satır
 *     metrikleri diğer yıldızlardan farklı olduğu için hizayı bozuyordu.
 *     Burada yarım yıldız, dolu yıldızın genişliğinin yarısı kadar kırpılmış
 *     bir kopyasıyla çiziliyor: fonttan tamamen bağımsız.
 *  2. Eski puanlama seçicisi 38px'lik glifi 44x44 kutuya sokuyordu; Android'de
 *     satır yüksekliği kutuyu aştığı için yıldızlar kırpılıyordu. Burada kutu
 *     glif boyutundan türetiliyor ve includeFontPadding kapatılıyor.
 */

/** Android'in font etrafına eklediği fazladan boşluğu iptal eden çarpan. */
const BOX_RATIO = 1.3;

/** Dokunmatik hedefin erişilebilirlik alt sınırı. */
const MIN_TOUCH_SIZE = 44;

interface StarRatingProps {
  /** 0–5 arası, 0.5 adımlı. */
  rating: number;
  /** Glif boyutu (px). Kutu bundan türetilir. */
  size?: number;
  /** Sayısal değeri yıldızların yanında göster. */
  showValue?: boolean;
  /** Verilirse bileşen dokunulabilir olur ve yarım adımlarla puan döndürür. */
  onChange?: (value: number) => void;
  style?: ViewStyle;
}

export default function StarRating({
  rating,
  size = 18,
  showValue = false,
  onChange,
  style,
}: StarRatingProps) {
  const interactive = typeof onChange === 'function';

  const boxSize = size * BOX_RATIO;
  const touchSize = interactive ? Math.max(boxSize, MIN_TOUCH_SIZE) : boxSize;

  const glyphStyle = {
    fontSize: size,
    lineHeight: boxSize,
    // Android'de fontun üstüne/altına eklenen ekstra padding kırpılmaya yol açar.
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
  };

  /**
   * ⚠️ `allowFontScaling={false}` — SİSTEM YAZI TİPİ ÖLÇEĞİ BU GLİFİ BÜYÜTMEMELİ.
   *
   * Neden: kutu (`touchSize`) `size`'dan türetilen SABİT bir sayı, glif ise bir
   * `Text` ve RN'de metin varsayılan olarak sistem ölçeğiyle büyüyor. Ölçek
   * 2.0'a çıkınca `fontSize: 32` fiilen 64px, `lineHeight: 41.6` fiilen 83px
   * oluyor ama kutu 44px'te kalıyor → glifin alt kısmı kutunun dışında kalıyor.
   * Cihazda ölçüldü (2026-08-08, `yaziOlcegi=2.00`): yıldızların alt yarısı
   * görünmüyordu.
   *
   * Bu, dosyanın en başında anlatılan hata sınıfının (2) ÜÇÜNCÜ yüzü: kutu ile
   * glif arasındaki oran bozulunca yıldız kırpılıyor. Öncekilerde oranı bozan
   * satır yüksekliğiydi, burada sistem ölçeği.
   *
   * KUTUYU BÜYÜTMEK ÇÖZÜM DEĞİL — ölçüldü: 5 yıldız bugün 220px, 2.0 ölçekte
   * 440px eder ve telefon genişliğini aşar.
   *
   * Erişilebilirlik kaybı yok: yıldız bir İKON, okunacak metin değil; dokunma
   * hedefi zaten `MIN_TOUCH_SIZE` (44) ile alt sınırda tutuluyor ve o
   * ölçeklemeden bağımsız. Aşağıdaki `valueText` ise GERÇEK metin, o yüzden
   * ölçeklenmeye devam ediyor — sayıyı büyütmek isteyen kullanıcı onu büyütüyor.
   */
  const glyphProps = { allowFontScaling: false } as const;

  return (
    <View style={[styles.row, style]}>
      {[0, 1, 2, 3, 4].map((i) => {
        // Bu yıldızın ne kadarı dolu: 0, 0.5 veya 1.
        const fill = Math.max(0, Math.min(1, rating - i));

        return (
          <View
            key={i}
            style={[styles.starBox, { width: touchSize, height: touchSize }]}
          >
            {/* Boş yıldız — taban katman */}
            <Text {...glyphProps} style={[glyphStyle, { color: Colors.ratingTrack }]}>
              ★
            </Text>

            {/* Dolu yıldız — genişliği fill oranında kırpılmış kopya */}
            {fill > 0 && (
              <View
                style={[
                  styles.fillClip,
                  { width: touchSize * fill, height: touchSize },
                ]}
                pointerEvents="none"
              >
                <View
                  style={[
                    styles.fillInner,
                    { width: touchSize, height: touchSize },
                  ]}
                >
                  <Text {...glyphProps} style={[glyphStyle, { color: Colors.rating }]}>
                    ★
                  </Text>
                </View>
              </View>
            )}

            {/* Dokunma yarımları — yalnızca puanlama modunda */}
            {interactive && (
              <>
                <Pressable
                  style={[styles.touchHalf, { left: 0, width: touchSize / 2 }]}
                  onPress={() => onChange!(i + 0.5)}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 0.5} yıldız`}
                />
                <Pressable
                  style={[styles.touchHalf, { right: 0, width: touchSize / 2 }]}
                  onPress={() => onChange!(i + 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1} yıldız`}
                />
              </>
            )}
          </View>
        );
      })}

      {showValue && (
        <Text style={styles.valueText}>{rating.toFixed(1)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fillClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  fillInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  valueText: {
    ...Type.micro,
    marginLeft: Spacing.xxs,
    color: Colors.textSecondary,
  },
});
