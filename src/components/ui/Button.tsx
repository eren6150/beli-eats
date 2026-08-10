import React from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Icon, { IconName } from './Icon';

/**
 * Birincil/ikincil buton — form ekranlarının ortak parçası.
 *
 * `TextField` ile aynı gerekçeyle şimdi çıkarıldı (bkz. o dosyanın başı):
 * tetikleyici üçüncü form ekranıydı ve `EditProfile` o ekran.
 *
 * ── GÖLGE YALNIZCA `primary`'DE ──────────────────────────────────────────────
 * Midas kararı gereği projede gölge istisna: kart ayrımı ince kenarlıktan
 * geliyor. Kalan üç gölgeden biri birincil buton (`Elevation.brand`) — o
 * bilinçli, çünkü buton "havada duran" tek eylem. `secondary` gölgesiz.
 *
 * ── YÜKLENİRKEN METİN YERİNE SPINNER ─────────────────────────────────────────
 * Buton `loading` iken metni spinner'la değiştiriyor ve kendini `disabled`
 * yapıyor: "kaydettim mi acaba" belirsizliğini kaldırıyor ve çift göndermeyi
 * engelliyor. Aynı desen `DiaryEntrySheet`'in Kaydet butonunda da var.
 */

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /**
   * Etiketin SOLUNA ikon. Verilmezse hiç render edilmiyor ve yerleşim
   * değişmiyor — `RankRow`/`DiaryRow`'un opsiyonel parça deseni.
   * Renk metinle aynı: buton tek bir görsel birim, ikon ayrı bir vurgu değil.
   */
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const inert = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (inert || pressed) && styles.dimmed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? Colors.textOnBrand : Colors.brand}
        />
      ) : (
        <>
          {icon ? (
            <Icon
              name={icon}
              size={18}
              color={isPrimary ? Colors.textOnBrand : Colors.textPrimary}
            />
          ) : null}
          <Text style={isPrimary ? styles.primaryText : styles.secondaryText}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    // `row` + `gap` ikonsuz butonda da güvenli: tek çocuk varken satır
    // yönünün bir etkisi yok, `gap` da uygulanmıyor. Yani ikon eklemek
    // mevcut butonların görünümünü DEĞİŞTİRMİYOR.
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.brand,
    ...Elevation.brand,
  },
  secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  dimmed: { opacity: 0.7 },
  primaryText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
  secondaryText: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
});
