import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Type } from '../../constants/theme';
import Icon from './Icon';

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
  /**
   * Aksiyon bir EYLEM değil GEZİNME ise `true`: etiketin sonuna ok ekleniyor.
   *
   * Ayrım kasıtlı. "Menü ekle" bir eylemdir, sonuna ok koymak "bir yere
   * gidiyorsun" diye yanlış söz verir; "Tümünü gör" ise gerçekten başka bir
   * ekrana götürüyor. Varsayılan `false`, yani mevcut çağıranların hiçbiri
   * değişmiyor.
   */
  actionIsLink?: boolean;
  style?: ViewStyle;
}

export default function SectionHeader({
  title,
  subtitle,
  badge,
  actionLabel,
  onAction,
  actionIsLink = false,
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
            <View style={[styles.actionRow, pressed && styles.actionPressed]}>
              <Text style={styles.action}>{actionLabel}</Text>
              {actionIsLink ? (
                <Icon name="forward" size={16} color={Colors.brandStrong} />
              ) : null}
            </View>
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
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
