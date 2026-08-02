import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon, { IconName } from './Icon';

/**
 * Boş durum bloğu.
 *
 * `icon` YENİ ve tercih edilen yol. `emoji` geriye dönük uyumluluk için
 * duruyor (SearchScreen hâlâ onu kullanıyor, adım 6'da geçirilecek) ve emoji
 * cihaza göre farklı çizildiği için yeni çağrılarda kullanılmamalı.
 * İkisinden biri verilmeli; ikisi de verilirse `icon` kazanır.
 */
interface EmptyStateProps {
  icon?: IconName;
  /** @deprecated `icon` kullan. */
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        {icon ? (
          <Icon name={icon} size={34} color={Colors.brandStrong} />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {actionLabel && onAction && (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['3xl'],
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emoji: { fontSize: 34 },
  title: {
    ...Type.heading,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...Type.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xxs,
  },
  action: {
    marginTop: Spacing.md,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionPressed: { opacity: 0.8 },
  actionText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
});
