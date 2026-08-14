import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';

/**
 * Segment sekme şeridi — tonlu yiv içinde beyaz aktif çip.
 *
 * Profil sekmelerinde (Sıralamam / Günlük / Listeler) kullanılıyor. Faz 2'de
 * mekan sayfasındaki fotoğraf türü sekmeleri (Menü / Yemek / Mekan) AYNI
 * bileşeni kullanacak — bu yüzden `key` tipi generic.
 */

export interface SegmentedTab<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  active: T;
  onChange: (key: T) => void;
  style?: ViewStyle;
}

export default function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  style,
}: SegmentedTabsProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * ── ALT ÇİZGİDEN BEYAZ ÇİPE (2026-08-13) ───────────────────────────────────
 * Önceki hal: şeffaf zemin + aktif sekmenin altında 2px marka çizgisi.
 * Yeni hal: tonlu bir yiv (`canvasAlt`) içinde, aktif sekme BEYAZ bir çip.
 *
 * Gerekçe tasarım turundan: alt çizgi seçili sekmeyi ancak dikkatle bakınca
 * belli ediyordu; dolu çip seçimi bir bakışta okutuyor ve sekme şeridini
 * içerikten net biçimde ayırıyor.
 *
 * ⚠️ GÖLGE YOK. Yükselti hissi yiv ile çip arasındaki YÜZEY KONTRASTINDAN
 * geliyor — projenin Midas kararı gölgeyi yalnızca birincil butona, bottom
 * sheet'e ve harita üstündeki karta ayırıyor.
 */
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.full,
    padding: Spacing.xxs,
    gap: Spacing.xxs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xxs,
    borderRadius: Radius.full,
  },
  tabActive: {
    backgroundColor: Colors.surface,
  },
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    ...Type.captionStrong,
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.textPrimary,
  },
});
