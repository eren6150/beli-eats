import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import StarRating from '../ui/StarRating';
import Icon from '../ui/Icon';

/**
 * Mekan satırı — Letterboxd yoğunluğunda.
 *
 * Öncesinde her satır gölgeli beyaz bir KARTTI ve aralarında boşluk vardı;
 * ekranda 4-5 mekan sığıyordu. Sıralı bir listede önemli olan sıranın
 * kendisini görebilmek, o yüzden: gölge yok, kart yok, satırlar alt çizgiyle
 * ayrılıyor. Aynı ekranda belirgin şekilde daha çok mekan görünüyor.
 *
 * Rozet de kaldırıldı: sıra numarası 36px'lik renkli bir daire içindeydi.
 * Letterboxd'da numara düz metin; ilk üç yalnızca RENKLE ayrışıyor.
 *
 * İKİ KULLANIM (Diff B2): `ProfileScreen`'in "Sıralamam" sekmesi ve
 * `ListDetailScreen`. İsim `RankRow` kaldı ama artık sıra ZORUNLU DEĞİL —
 * sırasız listede (`is_ordered: false`) numara sütunu hiç çizilmiyor.
 *
 * OPSİYONEL PARÇALAR: `rank`, `rating` ve sıra kontrolleri verilmezse
 * ilgili bölüm RENDER EDİLMİYOR (boş yer tutmuyor). Ayrı bir `ListItemRow`
 * yazmak %90'ı kopya bir bileşen demekti; bu satırın dili iki yerde de aynı.
 */

const THUMB_SIZE = 48;
const RANK_COLUMN_WIDTH = 28;
const CONTROL_SIZE = 26;

export interface RankRowProps {
  /** 1 tabanlı görünen sıra. Verilmezse sıra sütunu ÇİZİLMEZ (sırasız liste). */
  rank?: number;
  name: string;
  /**
   * Kullanıcının kendi puanı. Verilmezse yıldızlar çizilmez.
   * Liste öğelerinde v1'de puan gösterilmiyor: kendi puanını göstermek
   * `ListDetail`'e bir `useRankings` örneği daha eklemek demek (ekstra sorgu +
   * `useAuth`'un Context olmamasından gelen aynı yarış sınıfı).
   */
  rating?: number;
  photoUrl?: string | null;
  /** İkincil satır — liste öğelerinde adres. */
  subtitle?: string | null;
  reviewText?: string | null;
  /** Verilirse satırın tamamı tıklanabilir olur (mekan detayına gider). */
  onPress?: () => void;
  /** Çoklu seçim modunu başlatan uzun basış. */
  onLongPress?: () => void;
  /**
   * Ekran seçim modunda mı? Modda sıra numarasının YERİNE seçim işareti
   * çiziliyor (sütun genişliği sabit olduğu için satırlar kaymıyor) ve ok
   * tuşları + çöp kutusu gizleniyor — karışık affordance olmasın.
   */
  selectionMode?: boolean;
  selected?: boolean;
  /**
   * Sıra kontrolleri GRUP olarak opsiyonel: `onMoveUp`/`onMoveDown` verilmezse
   * sütun hiç çizilmez. `isFirst`/`isLast` yalnızca uçları pasifleştiriyor.
   */
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Verilmezse çöp kutusu ÇİZİLMEZ. Harita özetindeki gibi salt-okunur
   * bağlamlarda yıkıcı bir eylem satırda durmamalı.
   */
  onDelete?: () => void;
}

export default function RankRow({
  rank,
  name,
  rating,
  photoUrl,
  subtitle,
  reviewText,
  onPress,
  onLongPress,
  selectionMode = false,
  selected = false,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: RankRowProps) {
  const isTopThree = rank !== undefined && rank <= 3;
  const showControls =
    onMoveUp !== undefined && onMoveDown !== undefined && !selectionMode;
  const showDelete = onDelete !== undefined && !selectionMode;

  /**
   * Satır sonundaki ok — yalnızca satır tıklanabilirken VE sağda başka bir
   * kontrol yokken. Ok ile ok tuşlarını/çöp kutusunu yan yana koymak sağ
   * kenarı kalabalıklaştırır ve hangisinin ne yaptığı belirsizleşir.
   */
  const showChevron =
    onPress !== undefined && !showControls && !showDelete && !selectionMode;

  // İç Pressable'lar (ok/çöp kutusu) dıştakinin ÜSTÜNDE kazanıyor — RN iç içe
  // dokunmada en içteki hedefi seçiyor. Sıra değiştirirken yanlışlıkla mekan
  // detayına gidilmiyor.
  const content = (
    <>
      {selectionMode ? (
        // Sıra sütununun YERİNE, aynı genişlikte — moda girerken satır kaymıyor.
        <View style={styles.selectMark}>
          <Icon
            name={selected ? 'checkCircle' : 'circleOutline'}
            size={22}
            color={selected ? Colors.brand : Colors.borderMuted}
          />
        </View>
      ) : rank !== undefined ? (
        /**
         * İKİ HANELİ: 1 → "01". Tek haneli bir rakam sütunda cılız kalıyordu;
         * sabit iki hane görsel ağırlık veriyor ve `tabular-nums` ile birlikte
         * sütunu gerçekten sabit genişlikte tutuyor. 10 ve üstü zaten iki
         * hane, dokunulmuyor.
         */
        <Text style={[styles.rank, isTopThree && styles.rankTop]}>
          {String(rank).padStart(2, '0')}
        </Text>
      ) : null}

      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Icon name="restaurant" size={20} color={Colors.textMuted} />
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {rating !== undefined && <StarRating rating={rating} size={13} showValue />}
        {subtitle?.trim() ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle.trim()}
          </Text>
        ) : null}
        {reviewText?.trim() ? (
          <Text style={styles.review} numberOfLines={1}>
            {reviewText.trim()}
          </Text>
        ) : null}
      </View>

      {/* Sıra değiştirme — dikey yığın, yön sezgisel kalsın */}
      {showControls && (
        <View style={styles.controls}>
          <Pressable
            onPress={onMoveUp}
            disabled={isFirst}
            style={({ pressed }) => [styles.control, pressed && styles.pressed]}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${name} sırasını yukarı taşı`}
          >
            <Icon
              name="up"
              size={18}
              color={isFirst ? Colors.borderStrong : Colors.brandStrong}
            />
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={isLast}
            style={({ pressed }) => [styles.control, pressed && styles.pressed]}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${name} sırasını aşağı taşı`}
          >
            <Icon
              name="down"
              size={18}
              color={isLast ? Colors.borderStrong : Colors.brandStrong}
            />
          </Pressable>
        </View>
      )}

      {showDelete && (
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${name} listeden kaldır`}
        >
          <Icon name="trash" size={18} color={Colors.textMuted} />
        </Pressable>
      )}

      {showChevron && (
        <Icon name="forward" size={18} color={Colors.textMuted} />
      )}
    </>
  );

  // Hiçbir dokunma davranışı yoksa Pressable HİÇ kurulmuyor: tıklanabilir
  // görünüp tepki vermemek, hiç tıklanabilir görünmemekten kötü (aynı karar
  // sayaçlarda ve Diff A'nın `ListCard`'ında da verilmişti).
  if (!onPress && !onLongPress) {
    return <View style={[styles.row, selected && styles.rowSelected]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && !selected && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={selectionMode ? { selected } : undefined}
      accessibilityLabel={
        selectionMode
          ? `${name}, ${selected ? 'seçili' : 'seçili değil'}`
          : `${name} detaylarını aç`
      }
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    // Kart/gölge yok — ayrım tek çizgiden geliyor.
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  // iOS'ta ripple yok; basılı geri bildirimi buradan.
  rowPressed: { backgroundColor: Colors.canvas },
  /** Seçili satır — marka zemini, `AddToListSheet`'in "Eklendi" satırıyla aynı dil. */
  rowSelected: { backgroundColor: Colors.brandSurface },

  selectMark: {
    width: RANK_COLUMN_WIDTH,
    alignItems: 'flex-end',
  },

  rank: {
    // `body` değil `bodyStrong`: iki haneli numara ince gövdede cılız kalıyor.
    ...Type.bodyStrong,
    width: RANK_COLUMN_WIDTH,
    textAlign: 'center',
    color: Colors.textMuted,
    // Basamak sayısı değişince isim hizası kaymasın diye sabit genişlik.
    fontVariant: ['tabular-nums'],
  },
  /**
   * İlk üç YALNIZCA RENKLE ayrışıyor — boyut aynı.
   *
   * ⚠️ Eskiden `Type.heading` ile BOYUT DA değişiyordu ve bu, dosyanın kendi
   * başındaki kuralın ("ilk üç yalnızca renkle ayrışıyor") sessiz bir
   * ihlaliydi: satırlar arasında görünür bir yükseklik zıplaması üretiyordu.
   */
  rankTop: {
    color: Colors.brandStrong,
  },

  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.sm,
  },
  thumbFallback: {
    backgroundColor: Colors.canvasAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },

  info: { flex: 1, gap: 2 },
  name: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Type.micro,
    color: Colors.textMuted,
  },
  review: {
    ...Type.micro,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  controls: { gap: 2 },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  delete: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.5 },
});
