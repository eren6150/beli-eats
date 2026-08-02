import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius } from '../../constants/theme';

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useSkeletonOpacity() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,   // sonsuz tekrar
      true  // ters yön
    );
  }, []);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

// ─── SkeletonBox ──────────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({
  width = '100%',
  height,
  borderRadius = Radius.sm,
  style,
}: SkeletonBoxProps) {
  const animStyle = useSkeletonOpacity();

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: Colors.skeletonBase,
        },
        animStyle,
        style,
      ]}
    />
  );
}

// ─── SkeletonCard (Home feed / Trending) ──────────────────────────────────────

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {/* Görsel alanı */}
      <SkeletonBox height={130} borderRadius={0} />
      {/* İçerik */}
      <View style={styles.cardContent}>
        <SkeletonBox width="70%" height={14} style={{ marginBottom: 8 }} />
        <SkeletonBox width="45%" height={12} />
      </View>
    </View>
  );
}

// ─── SkeletonListItem (Profile rankings) ─────────────────────────────────────

export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.listItem, style]}>
      {/* Rank badge */}
      <SkeletonBox
        width={36}
        height={36}
        borderRadius={Radius.full}
      />
      {/* Thumbnail */}
      <SkeletonBox
        width={52}
        height={52}
        borderRadius={Radius.md}
      />
      {/* Text lines */}
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="65%" height={13} />
        <SkeletonBox width="40%" height={12} />
      </View>
    </View>
  );
}

// ─── SkeletonActivityCard (Home activity feed) ────────────────────────────────

export function SkeletonActivityCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.activityCard, style]}>
      <SkeletonBox height={100} borderRadius={0} />
      <View style={styles.cardContent}>
        <SkeletonBox width="80%" height={13} style={{ marginBottom: 6 }} />
        <SkeletonBox width="50%" height={11} />
      </View>
    </View>
  );
}

// ─── SkeletonSearchRow (Search results) ──────────────────────────────────────

export function SkeletonSearchRow({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.searchRow, style]}>
      <SkeletonBox width={40} height={40} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="60%" height={14} />
        <SkeletonBox width="80%" height={11} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 12,
    gap: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 12,
    gap: 10,
  },
  activityCard: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginRight: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
});
