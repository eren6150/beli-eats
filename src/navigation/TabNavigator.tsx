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

/**
 * Sistem çubuğunun ÜSTÜNE eklenen nefes payı.
 *
 * ── ESKİ (YANLIŞ) MODEL ────────────────────────────────────────────────────
 * Burada bir dönem `TAB_BAR_MIN_BOTTOM_PADDING = Spacing.sm` vardı ve
 * `Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_PADDING)` olarak kullanılıyordu.
 * Yorumu şunu varsayıyordu: *"Inset'i olmayan cihazlarda (klasik 3 tuşlu
 * navigasyon) taban boşluk."* — yani 3 tuşlu navigasyonda `insets.bottom`'ın
 * **0** geleceği. Bu varsayım SDK 54'te ARTIK DOĞRU DEĞİL ve tam TERSİ:
 *
 *   Expo SDK 54'te edge-to-edge VARSAYILAN OLARAK AÇIK (ve Android 16 / API 36
 *   artık kapatılmasına izin vermiyor). Doğrulandı — projede `edgeToEdgeEnabled`
 *   hiç yazılmadığı için prebuild-config `raw !== false` ile onu true yapıyor:
 *   `@expo/prebuild-config/.../edge-to-edge/withEdgeToEdge.js`.
 *   Edge-to-edge'te pencere sistem çubuklarının ALTINA kadar uzanıyor, yani
 *   `insets.bottom` sıfır değil, sistem çubuğunun GERÇEK yüksekliği:
 *     · 3 tuşlu navigasyon → ~48dp (çubuğu butonlar TAMAMEN dolduruyor)
 *     · jest navigasyonu   → ~16-24dp (içinde yalnızca ince tutamaç var)
 *
 * Yani `max()` tabanı (12) hiçbir zaman devreye girmiyordu; iki modda da
 * `paddingBottom` tam olarak `insets.bottom` oluyordu.
 *
 * ── ASIL BUG ───────────────────────────────────────────────────────────────
 * `paddingBottom === insets.bottom` sekme içeriğini sistem çubuğunun tam
 * TEPESİNE oturtuyor — arada SIFIR boşluk bırakıyor. Bu iki modda farklı
 * görünüyor, sorunun cihaza değil navigasyon TÜRÜNE bağlı olmasının sebebi de bu:
 *   · jest navigasyonunda o 24dp'nin neredeyse tamamı boş → boşluk VARMIŞ gibi
 *   · 3 tuşlu navigasyonda o 48dp'nin tamamı buton → etiketler butonlara BİTİŞİK
 * (Geliştirme cihazı jest navigasyonu kullandığı için sorun hiç görülmedi.)
 *
 * Not: `@react-navigation/bottom-tabs@7` kendi varsayılanında da birebir
 * `paddingBottom: insets.bottom` yapıyor (`BottomTabBar.tsx:378`) — yani
 * override'ı silmek bug'ı çözmez, aynı formüle döner. Eksik olan nefes payı.
 *
 * ── DÜZELTME ───────────────────────────────────────────────────────────────
 * `max()` DEĞİL, TOPLAMA: `insets.bottom + TAB_BAR_BOTTOM_GAP`. Bu, ölçülen
 * inset değeri ne olursa olsun doğru — her iki navigasyon türünü de aynı kuralla
 * karşılıyor ve birine yaranıp diğerini bozmuyor:
 *     jest    → 24 + 8 = 32   (öncesi 24)
 *     3 tuşlu → 48 + 8 = 56   (öncesi 48, yani boşluk YOK)
 *     inset 0 → 0  + 8 =  8   (edge-to-edge kapalı bir dünyada bile makul)
 */
const TAB_BAR_BOTTOM_GAP = Spacing.xs;

/**
 * Sekme ikonu boyutu — aktif/pasifte AYNI.
 * Emoji döneminde 22↔24 arası değişiyordu; sekme değişiminde ikon zıplıyordu.
 * Aktiflik zaten dolu glif + marka rengiyle anlatılıyor, boyuta gerek yok.
 */
const TAB_ICON_SIZE = 24;

export default function TabNavigator() {
  // Edge-to-edge açık (SDK 54 varsayılanı) → `insets.bottom` sistem
  // navigasyon çubuğunun gerçek yüksekliği. Sekme çubuğu o alanın ÜSTÜNDE
  // kalmalı, üstelik araya nefes payı koyarak — gerekçe TAB_BAR_BOTTOM_GAP'te.
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + TAB_BAR_BOTTOM_GAP;

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
