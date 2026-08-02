import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Type } from '../../constants/theme';

/**
 * Alt çizgili sekme şeridi.
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    // Aktif göstergenin 2px'i, kapsayıcının 1px alt çizgisini örtsün —
    // yoksa iki çizgi üst üste binip kalınlık tutarsız görünüyor.
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: Colors.brand,
  },
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    ...Type.bodyStrong,
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.textPrimary,
  },
});
