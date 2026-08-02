import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Chip from '../ui/Chip';
import Icon from '../ui/Icon';

/**
 * Liste kartı — "Listeler" sekmesinin satırı.
 *
 * KAPAK FOTOĞRAFI YOK (v1, bilinçli). Kapak, listenin ilk öğesinin
 * `places.photo_refs`'i demek; `useLists`'in `list_items(count)` sorgusunu
 * gömülü sıralama + limit ile karmaşıklaştırırdı. Başlık + sayı Midas diline
 * zaten uygun. Sonradan eklemek yalnızca hook'un select'ini değiştirir.
 *
 * Midas: gölge yok, ayrım ince kenarlıktan (auth `formCard`'ları ve tab bar ile
 * aynı karar).
 */

export interface ListCardProps {
  title: string;
  description?: string | null;
  itemCount: number;
  isOrdered: boolean;
  onPress?: () => void;
  /** Uzun basış — silme gibi yıkıcı eylemler için. */
  onLongPress?: () => void;
  /**
   * Sıkı hal: açıklama gizlenir, padding daralır, başlık bir kademe iner.
   * Harita özeti gibi birden çok bölümün sığması gereken yerler için —
   * ayrı bir kart dili DEĞİL, aynı kartın dar hali.
   */
  compact?: boolean;
  style?: ViewStyle;
}

export default function ListCard({
  title,
  description,
  itemCount,
  isOrdered,
  onPress,
  onLongPress,
  compact = false,
  style,
}: ListCardProps) {
  // Türkçede sayıdan sonra çoğul eki gelmiyor: "12 mekan", "1 mekan".
  const countLabel = itemCount === 0 ? 'Henüz mekan yok' : `${itemCount} mekan`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${countLabel}`}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
          {title}
        </Text>
        {isOrdered && <Chip label="Sıralı" variant="brand" icon="list" />}
      </View>

      {!compact && description?.trim() ? (
        <Text style={styles.description} numberOfLines={2}>
          {description.trim()}
        </Text>
      ) : null}

      <View style={[styles.footerRow, compact && styles.footerRowCompact]}>
        <Icon name="restaurant" size={13} color={Colors.textMuted} />
        <Text style={styles.count}>{countLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xxs,
  },
  cardCompact: { padding: Spacing.sm },
  // iOS'ta ripple yok; basılı geri bildirimi buradan.
  pressed: { backgroundColor: Colors.canvas },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  title: {
    ...Type.heading,
    color: Colors.textPrimary,
    // Uzun başlık "Sıralı" etiketini taşırmasın.
    flexShrink: 1,
  },
  // Sıkı halde başlık bir kademe iniyor: `heading` (17/700) → `bodyStrong`
  // (15/600). Override değil, rol değişimi — üçlü yine birlikte geliyor.
  titleCompact: { ...Type.bodyStrong },
  description: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    marginTop: Spacing.xxs,
  },
  footerRowCompact: { marginTop: 0 },
  count: {
    ...Type.micro,
    color: Colors.textMuted,
  },
});
