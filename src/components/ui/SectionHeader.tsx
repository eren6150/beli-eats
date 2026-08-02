import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Type } from '../../constants/theme';

/**
 * Bölüm başlığı — başlık + opsiyonel alt yazı + opsiyonel sağ aksiyon.
 *
 * Kodda bu desen dört ekranda tekrarlanıyordu, her biri farklı boyut ve
 * boşlukla ("⭐ Restoran Sıralamam", "📝 Yorumun", "🗺️ Etrafındaki Mekanlar").
 * Emoji prefiksleri bilinçli olarak DAHİL EDİLMİYOR: ikon stratejisi
 * `@expo/vector-icons` (Faz 1b kararı), emoji geçici bir çözümdü.
 */
export interface SectionHeaderProps {
  title: string;
  /** Başlığın altındaki açıklama. */
  subtitle?: string;
  /**
   * Sağ tarafta TIKLANAMAZ bilgi metni (ör. "3 yeni").
   * `actionLabel` ile birlikte verilirse aksiyon kazanır — ikisi aynı yeri
   * paylaşıyor ve bir tıklanabilir öğeyi bilgi metniyle karıştırmak istemiyoruz.
   */
  badge?: string;
  /** Sağ tarafta metin buton — verilmezse çizilmez. */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export default function SectionHeader({
  title,
  subtitle,
  badge,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps) {
  // Etiket varsa ama handler yoksa buton çizmek yanıltıcı olurdu.
  const showAction = Boolean(actionLabel && onAction);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {showAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {({ pressed }) => (
            <Text style={[styles.action, pressed && styles.actionPressed]}>
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : badge ? (
        <Text style={styles.badge}>{badge}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  // Uzun başlık aksiyon butonunu taşırmasın.
  textBlock: { flex: 1 },
  title: {
    ...Type.heading,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  action: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },
  actionPressed: {
    opacity: 0.6,
  },
  badge: {
    ...Type.caption,
    color: Colors.textMuted,
  },
});
