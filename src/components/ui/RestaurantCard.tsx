import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Chip from './Chip';
import Icon from './Icon';

// ─── Ölçüler ──────────────────────────────────────────────────────────────────

const IMAGE_HEIGHT = { compact: 100, default: 130, wide: 180 } as const;
const COMPACT_WIDTH = 150;

/** Tam genişlik kartın ekran kenarlarından toplam boşluğu. */
const FULL_WIDTH_INSET = 40;
/** İki sütunlu ızgarada kenarlar + aradaki boşluk. */
const GRID_INSET = 52;

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface RestaurantCardProps {
  name: string;
  rating: number;
  cuisine?: string;
  photoUrl?: string | null;
  /** Mesafe (ör: "1.2 km") — opsiyonel */
  distance?: string;
  onPress?: () => void;
  /** Kart genişliği — varsayılan: tam genişlik */
  width?: number;
  variant?: 'default' | 'compact' | 'wide';
  style?: ViewStyle;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function RestaurantCard({
  name,
  rating,
  cuisine,
  photoUrl,
  distance,
  onPress,
  width,
  variant = 'default',
  style,
}: RestaurantCardProps) {
  // Modül seviyesinde okunan Dimensions rotasyonda güncellenmiyordu.
  const { width: screenWidth } = useWindowDimensions();

  const imageHeight = IMAGE_HEIGHT[variant];
  const cardWidth =
    width ??
    (variant === 'compact' ? COMPACT_WIDTH : screenWidth - FULL_WIDTH_INSET);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth },
        pressed && styles.cardPressed,
        style,
      ]}
      accessibilityRole="button"
    >
      {/* ── Fotoğraf ── */}
      <View style={[styles.imageArea, { height: imageHeight }]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imageFallback}>
            <Icon name="restaurant" size={30} color={Colors.textMuted} />
          </View>
        )}

        {/* Puan rozeti — fotoğraf üstünde, koyu zemin okunabilirlik için */}
        <Chip
          label={rating.toFixed(1)}
          variant="onImage"
          icon="rating"
          style={styles.ratingBadge}
        />

        {/* Alt kenarda hafif koyulaştırma: açık fotoğraflarda kartın alt
            sınırı zeminde kaybolmasın. */}
        <View style={styles.imageScrim} />
      </View>

      {/* ── Bilgi ── */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>

        <View style={styles.tags}>
          {/* Mutfak türü yoksa "Restoran" varsayılanı: etiket satırının
              yüksekliği kartlar arasında tutarlı kalsın. */}
          <Chip label={cuisine ?? 'Restoran'} variant="brand" humanize />
          {distance ? <Chip label={distance} variant="neutral" icon="location" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Izgara / yatay varyantlar ────────────────────────────────────────────────

export function RestaurantGridCard(
  props: Omit<RestaurantCardProps, 'variant' | 'width'>
) {
  const { width: screenWidth } = useWindowDimensions();
  return <RestaurantCard {...props} width={(screenWidth - GRID_INSET) / 2} />;
}

export function RestaurantCompactCard(props: Omit<RestaurantCardProps, 'variant'>) {
  return <RestaurantCard {...props} variant="compact" width={COMPACT_WIDTH} />;
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Midas kararı: gölge yerine ince kenarlık + yüzey kontrastı.
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Elevation.card,
  },
  cardPressed: { opacity: 0.9 },

  imageArea: {
    position: 'relative',
    backgroundColor: Colors.canvasAlt,
  },
  imageFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvasAlt,
  },
  imageScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: Colors.scrimSoft,
  },
  ratingBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },

  info: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  name: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    flexWrap: 'wrap',
  },
});
