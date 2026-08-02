import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import { splitDateParts } from '../../lib/date';
import StarRating from '../ui/StarRating';
import Icon from '../ui/Icon';

/**
 * Günlük satırı — bir ziyaret.
 *
 * NEDEN `RankRow` GENİŞLETİLMEDİ: o bileşenin üç genişlemesi de "aynı satır,
 * eksik parça" mantığındaydı (sıra yok, puan yok, ok yok). Burada EKSEN
 * değişiyor: satırın kimliği tarih, sıra numarası diye bir şey yok ve aynı
 * mekan listede defalarca tekrar ediyor. Dördüncü bir opsiyonel parça yığmak
 * `RankRow`'u "her şeyi yapan satır"a çevirirdi.
 *
 * Tarih SOL SÜTUNDA, `RankRow`'un sıra numarasıyla aynı yerde — iki sekme
 * arasında geçerken göz aynı hizada kalıyor.
 */

const THUMB_SIZE = 48;
/** `RankRow`'un sıra sütunuyla aynı optik genişlik — sekmeler arası hizalama. */
const DATE_COLUMN_WIDTH = 34;

export interface DiaryRowProps {
  /** `YYYY-MM-DD` — `diary_entries.visited_at`. */
  visitedAt: string;
  name: string;
  /** Puansız giriş olabilir; yoksa yıldızlar çizilmiyor. */
  rating?: number | null;
  note?: string | null;
  photoUrl?: string | null;
  onPress?: () => void;
  /** Uzun basış — silme gibi yıkıcı eylemler için. */
  onLongPress?: () => void;
}

export default function DiaryRow({
  visitedAt,
  name,
  rating,
  note,
  photoUrl,
  onPress,
  onLongPress,
}: DiaryRowProps) {
  const { day, month } = splitDateParts(visitedAt);

  const content = (
    <>
      <View style={styles.dateColumn}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.month}>{month}</Text>
      </View>

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

        {/* `typeof` kontrolü: rating 0 olsaydı `rating &&` ekrana "0" basardı
            (RestaurantDetail'de aynı tuzağa düşülmüştü). */}
        {typeof rating === 'number' ? (
          <StarRating rating={rating} size={13} showValue />
        ) : (
          <Text style={styles.unrated}>Puan verilmedi</Text>
        )}

        {note?.trim() ? (
          <Text style={styles.note} numberOfLines={2}>
            {note.trim()}
          </Text>
        ) : null}
      </View>
    </>
  );

  // Hiçbir dokunma davranışı yoksa Pressable HİÇ kurulmuyor (RankRow ile aynı
  // karar): tıklanabilir görünüp tepki vermemek, hiç tıklanabilir
  // görünmemekten kötü.
  if (!onPress && !onLongPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${day} ${month}`}
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
    // Kart/gölge yok — ayrım tek çizgiden geliyor (Midas + RankRow ile aynı dil).
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  // iOS'ta ripple yok; basılı geri bildirimi buradan.
  rowPressed: { backgroundColor: Colors.canvas },

  dateColumn: {
    width: DATE_COLUMN_WIDTH,
    alignItems: 'center',
  },
  day: {
    ...Type.heading,
    color: Colors.textPrimary,
    // Basamak sayısı değişince ay adının hizası kaymasın.
    fontVariant: ['tabular-nums'],
  },
  month: {
    ...Type.micro,
    color: Colors.textMuted,
    textTransform: 'uppercase',
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
  unrated: {
    ...Type.micro,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  note: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
});
