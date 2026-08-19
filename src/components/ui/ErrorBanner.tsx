import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from './Icon';

/**
 * Hata şeridi — mesaj + opsiyonel "Tekrar dene".
 *
 * NEDEN BİLEŞEN: aynı iş üç ekranda üç farklı şekilde çözülmüştü.
 * `RestaurantDetailScreen` hatayı gösteriyor ama yeniden deneme yolu SUNMUYOR
 * (kullanıcı ekrandan çıkmak zorunda), `MapScreen` kendi buton stilini
 * kuruyor, `ProfileScreen` `EmptyState` üzerinden çözüyor. Tek desen.
 *
 * `MapScreen` İSTİSNASI — ✅ **KAPANDI: BİLİNÇLİ OLARAK YAPILMAYACAK**
 * (2026-08-19). Harita üstü bilgi kartı kendi "Tekrar dene" butonunu çizmeye
 * DEVAM EDECEK. Uzun süre "ertelenmiş açık iş" diye duruyordu; teşhis edilince
 * dönüşümün kullanıcıya hiçbir kazancı olmadığı, karşılığında gerçek
 * regresyon riski taşıdığı görüldü:
 *   • Kartın SAĞ YUVASI üç yönlü (spinner / "Tekrar dene" / "N puanlanan"),
 *     sol sütunu üç ayrı satır çizebiliyor (fallback · hata · POI bildirimi).
 *     `ErrorBanner` tek mesaj + tek buton çizen bir şerit; yuva kavramı yok.
 *   • Kartın kendi zemini var — şeridi içine koymak KART İÇİNDE ÇERÇEVE olur.
 *   • Hata anında kartın YERİNE geçmek ise kullanıcının özet sheet'ine
 *     erişimini koparırdı (kart o sheet'in tek giriş noktası).
 * Geriye kalan tek gerçek tekrar üç stil satırı ve `RetryButton` çıkarımı
 * projenin kendi eşiğinin ALTINDA: ortak parça ölçütü "İKİDEN FAZLA yerde
 * aynı eşleşme" ve burada iki yer var. Stiller Faz 1b adım 7'de zaten aynı
 * token'lara bağlandı, yani görsel drift riski de yok.
 * **Tetikleyici:** kartın düzeni başka bir sebeple elden geçerse yeniden bak.
 *
 * `onRetry` verilmezse buton hiç çizilmez — her hata yeniden denenebilir
 * değil (ör. doğrulama hatası).
 */
export interface ErrorBannerProps {
  /** Kullanıcıya gösterilecek hata metni. Teknik detay değil, ne olduğu. */
  message: string;
  /** Verilirse "Tekrar dene" butonu çıkar. */
  onRetry?: () => void;
  /** Buton etiketi — varsayılan "Tekrar dene". */
  retryLabel?: string;
  style?: ViewStyle;
}

export default function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Tekrar dene',
  style,
}: ErrorBannerProps) {
  return (
    <View style={[styles.banner, style]} accessibilityRole="alert">
      <Icon name="alert" size={16} color={Colors.danger} />
      <Text style={styles.message}>{message}</Text>

      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerSurface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  message: {
    ...Type.caption,
    color: Colors.danger,
    // Uzun mesaj butonu ezmesin; buton kendi genişliğinde kalır.
    flex: 1,
  },
  retryBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.xs,
  },
  retryBtnPressed: {
    backgroundColor: Colors.dangerSurface,
  },
  retryText: {
    ...Type.micro,
    color: Colors.danger,
  },
});
