import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon, { IconName } from './Icon';

/**
 * Küçük etiket — mutfak türü, mesafe, puan etiketi, liste görünürlüğü.
 *
 * Kodda üç ayrı kopyası vardı: `RestaurantCard`'ın `CuisineTag` ve
 * `DistanceTag`'i, `SearchScreen`'in `categoryChip`'i. Üçü de aynı şey.
 *
 * Faz 2'de aynı bileşen fotoğraf türü etiketlerinde (menü/yemek/mekan) ve
 * liste görünürlüğünde kullanılacak — bu yüzden variant'lar şimdiden ayrık.
 */
export type ChipVariant = 'brand' | 'neutral' | 'rating' | 'onImage';

export interface ChipProps {
  label: string;
  /**
   * `brand`    — marka zemini (mutfak türü, kategori)
   * `neutral`  — nötr zemin (mesafe, sayaç)
   * `rating`   — puan etiketi (amber zemin, "Google ortalaması")
   * `onImage`  — fotoğraf ÜSTÜNDE duran koyu zemin (okunabilirlik için)
   */
  variant?: ChipVariant;
  /** snake_case gelen Places `types` değerlerini Title Case'e çevirir. */
  humanize?: boolean;
  /** Etiketin solunda küçük ikon. Rengi variant'tan gelir. */
  icon?: IconName;
  style?: ViewStyle;
}

/** "fast_food" → "Fast Food" */
function humanizeLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Chip({
  label,
  variant = 'neutral',
  humanize = false,
  icon,
  style,
}: ChipProps) {
  const text = humanize ? humanizeLabel(label) : label;
  const textColor = VARIANT_TEXT[variant].color;

  return (
    <View style={[styles.base, VARIANT_CONTAINER[variant], style]}>
      {icon && (
        // Etikete göre bir tık küçük — aynı boyutta ikon optik olarak
        // metinden büyük duruyor.
        <Icon name={icon} size={Type.micro.fontSize + 1} color={textColor} />
      )}
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs / 2,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs / 2,
  },
  text: {
    ...Type.micro,
  },
});

const VARIANT_CONTAINER: Record<ChipVariant, ViewStyle> = {
  brand: { backgroundColor: Colors.brandSubtle },
  neutral: { backgroundColor: Colors.canvasAlt },
  rating: { backgroundColor: Colors.ratingSurface },
  onImage: { backgroundColor: Colors.scrim },
};

const VARIANT_TEXT: Record<ChipVariant, { color: string }> = {
  brand: { color: Colors.brandStrong },
  neutral: { color: Colors.textSecondary },
  rating: { color: Colors.ratingText },
  onImage: { color: Colors.textInverse },
};
