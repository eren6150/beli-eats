import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../types';
import HomeStack from './HomeStack';
import SearchStack from './SearchStack';
import MapStack from './MapStack';
import ProfileStack from './ProfileStack';
import Icon, { IconName } from '../components/ui/Icon';
import { Colors, Type, Spacing } from '../constants/theme';

const Tab = createBottomTabNavigator<TabParamList>();

// ─── Tab icon mapping ─────────────────────────────────────────────────────────
//
// Emoji ikonlar kaldırıldı: cihaza göre farklı çiziliyorlardı, renklendirilemiyor
// ve aktif/pasif durumları olamıyordu. Aktiflik artık iki eksenden anlatılıyor:
// glif dolu/outline + renk (tint navigator'dan geliyor).
//
// Ekranlar/navigasyon ANLAMSAL isim kullanır; glif isimleri `Icon.tsx`'te.

const TAB_ICONS: Record<
  keyof TabParamList,
  { active: IconName; inactive: IconName }
> = {
  HomeTab: { active: 'homeActive', inactive: 'home' },
  SearchTab: { active: 'searchActive', inactive: 'search' },
  MapTab: { active: 'mapActive', inactive: 'map' },
  ProfileTab: { active: 'personActive', inactive: 'person' },
};

const TAB_LABELS: Record<keyof TabParamList, string> = {
  // "Keşfet" idi (2026-08-01'de değişti): ekran takip edilenlerin aktivitesini
  // ve "En Çok Puanlayanlar"ı gösteriyor — bu keşif değil giriş sayfası.
  // Ayrıca "Keşfet" ile "Ara" kullanıcı için fazla yakın iki vaatti.
  HomeTab: 'Ana Sayfa',
  SearchTab: 'Ara',
  MapTab: 'Harita',
  ProfileTab: 'Profil',
};

// ─── Tab Navigator ────────────────────────────────────────────────────────────

/** Sekme çubuğunun sistem inset'i hariç net yüksekliği. */
const TAB_BAR_CONTENT_HEIGHT = 60;

/** Inset'i olmayan cihazlarda (klasik 3 tuşlu navigasyon) taban boşluk. */
const TAB_BAR_MIN_BOTTOM_PADDING = Spacing.sm;

/**
 * Sekme ikonu boyutu — aktif/pasifte AYNI.
 * Emoji döneminde 22↔24 arası değişiyordu; sekme değişiminde ikon zıplıyordu.
 * Aktiflik zaten dolu glif + marka rengiyle anlatılıyor, boyuta gerek yok.
 */
const TAB_ICON_SIZE = 24;

export default function TabNavigator() {
  // Android'de gesture navigation kullanılıyorsa alt inset 0 değil — sabit
  // yükseklik verilirse ikonlar gesture çubuğunun altında kalıyordu.
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_PADDING);

  return (
    <Tab.Navigator
      /**
       * `history` — geri her zaman BİR ÖNCE BULUNULAN yere döner, sekmeler
       * arası dahil. Varsayılan `firstRoute` idi: hangi sekmede olursan ol geri
       * doğrudan Ana Sayfa'ya atlıyordu (Instagram deseni). Bir dönem bilinçli
       * olarak korunmuştu, 2026-08-01'de değiştirildi — "beklenen doğal geri
       * gezinme" Instagram taklidine tercih edildi: kullanıcı geldiği yolu
       * geri yürüyor, en sonunda Ana Sayfa'ya ulaşıyor ve oradan bir geri daha
       * uygulamadan çıkarıyor. Çoğu Android uygulamasının davranışı bu.
       *
       * DİKKAT: bu ayar yalnızca SEKME seviyesindeki geri hareketini belirler.
       * Sekmenin içindeki stack'ten pop etmek her zaman önce gelir.
       */
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          // Gölge YOK — Midas kararı: ayrım gölgeden değil ince kenarlık +
          // yüzey kontrastından geliyor (header'larda da böyle yapıldı).
          borderTopColor: Colors.borderSubtle,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: Spacing.sm,
        },
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          ...Type.micro,
          marginTop: Spacing.xxs,
        },
        // `color` navigator'dan geliyor (active/inactive tint); ikon artık
        // etiketle aynı rengi alıyor — emoji bunu yapamıyordu.
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name as keyof TabParamList];
          if (!icons) return null;
          return (
            <Icon
              name={focused ? icons.active : icons.inactive}
              size={TAB_ICON_SIZE}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{ tabBarLabel: TAB_LABELS.HomeTab }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStack}
        options={{ tabBarLabel: TAB_LABELS.SearchTab }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapStack}
        options={{ tabBarLabel: TAB_LABELS.MapTab }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ tabBarLabel: TAB_LABELS.ProfileTab }}
      />
    </Tab.Navigator>
  );
}
