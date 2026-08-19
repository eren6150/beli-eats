import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { placePhotoUrl } from '../../lib/places';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import StarRating from '../ui/StarRating';
import Chip from '../ui/Chip';
import Icon from '../ui/Icon';

// ─── Ölçüler ──────────────────────────────────────────────────────────────────
//
// YÜKSEKLİK ARTIK SABİT DEĞİL — bu bilinçli bir değişiklik.
//
// Önceden `CONTENT_BLOCK_HEIGHT = 330` diye elle hesaplanmış bir sabit vardı ve
// sheet'e `height` olarak veriliyordu. İçerik (2 satır isim + 2 satır adres +
// yıldızlar + "Detayları gör" şeridi + ayraç + Kapat) bu sayıyı aşınca
// `overflow: 'hidden'` alttaki butonu kırpıyordu. Sabit bu yüzden bir kez
// 296'dan 330'a çıkarılmış.
//
// Tipografi rol bazlı ölçeğe geçince (Faz 1b) o sayı yeniden yanlış hale geldi.
// Sayıyı tekrar elle hesaplamak yerine kaynağı kaldırdık: sheet'in yüksekliği
// artık İÇERİĞİNDEN geliyor (explicit `height` yok). Animasyon için gereken
// ekran-altı mesafesi `onLayout` ile ölçülüyor. Böylece metin uzunluğu veya
// tipografi değişse de kırpılma sınıfı hata bir daha oluşmuyor.

/** Görselin ekran yüksekliğine oranı ve üst sınırı. */
const IMAGE_RATIO = 0.16;
const IMAGE_MAX_HEIGHT = 150;

/** Sheet ekranın bu oranından uzun olamaz — çok uzun adreslerde tavan. */
const MAX_SHEET_RATIO = 0.85;

/** Sürükleyerek kapatma eşiği: ölçülen yüksekliğin bu oranı. */
const DISMISS_RATIO = 0.3;

/** Hız eşiği (px/s) — bu hızın üstünde mesafeye bakılmaz, kapatılır. */
const DISMISS_VELOCITY = 800;

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.8,
};

const EXIT_TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };

/** Örtünün açıkken opaklığı. */
const OVERLAY_OPACITY = 0.55;

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface RestaurantSheetData {
  id: string;
  restaurant_name: string;
  /** KULLANICININ kendi puanı. Puanlamadığı mekanlarda null. */
  rating: number | null;
  /**
   * Google'ın ortalama puanı. Kullanıcının kendi puanı yoksa bu gösterilir.
   * İkisi ayrı alanlar — aynı alana yazmak "bunu ben puanlamışım" yanılgısı
   * yaratırdı.
   */
  googleRating?: number | null;
  /** Kapak fotoğrafının taban adresi (`places.photo_base_urls[0]`). */
  photo_base_url: string | null;
  place_id: string;
  cuisine?: string;
  address?: string;
  /**
   * 'ranked' = kullanıcı puanlamış
   * 'nearby' = Nearby Search'ten gelen çevre mekanı
   * 'poi'    = haritanın native Google POI'sine dokunuldu
   *
   * Şu an yalnızca bilgi amaçlı; hiçbir görsel farklılık yaratmıyor.
   */
  source?: 'ranked' | 'nearby' | 'poi';
}

interface RestaurantBottomSheetProps {
  restaurant: RestaurantSheetData | null;
  onClose: () => void;
  /** Verilirse "Detayları gör" şeridi çıkar ve detay sayfasına yönlendirir. */
  onPressDetail?: () => void;
}

// ─── Kategori etiketi ─────────────────────────────────────────────────────────

/** Places `types` değerlerinin Türkçe karşılıkları. */
const CUISINE_TR: Record<string, string> = {
  restaurant: 'Restoran',
  cafe: 'Kafe',
  bar: 'Bar',
  bakery: 'Fırın',
  meal_takeaway: 'Paket Servis',
  meal_delivery: 'Delivery',
  food: 'Yemek',
  fast_food: 'Fast Food',
  pizza: 'Pizza',
  night_club: 'Gece Kulübü',
};

function cuisineLabelOf(raw: string | undefined): string {
  if (!raw) return 'Restoran';
  return CUISINE_TR[raw] ?? raw;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function RestaurantBottomSheet({
  restaurant,
  onClose,
  onPressDetail,
}: RestaurantBottomSheetProps) {
  // Modül seviyesinde okunan Dimensions rotasyonda güncellenmiyordu.
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const imageHeight = Math.min(windowHeight * IMAGE_RATIO, IMAGE_MAX_HEIGHT);
  const maxSheetHeight = windowHeight * MAX_SHEET_RATIO;

  /** onLayout ile ölçülen gerçek sheet yüksekliği. Animasyon mesafesi bu. */
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  /**
   * Sheet şu an açık mı. Bu ref olmadan `restaurant` her değiştiğinde
   * (MapScreen provisional veriyi enriched ile değiştiriyor) giriş animasyonu
   * baştan oynuyordu.
   */
  const isOpenRef = useRef(false);

  // Ölçüm gelmeden sheet ekran altında dursun.
  const translateY = useSharedValue(windowHeight);
  const overlayOpacity = useSharedValue(0);
  const startY = useSharedValue(0);

  /** Kapanış animasyonu + JS callback'i. */
  function dismissSheet(distance: number) {
    'worklet';
    translateY.value = withTiming(distance, EXIT_TIMING);
    overlayOpacity.value = withTiming(0, { duration: EXIT_TIMING.duration }, () => {
      runOnJS(onClose)();
    });
  }

  useEffect(() => {
    if (restaurant) {
      // Ölçüm gelmeden animasyon başlatmıyoruz: başlangıç noktası yanlış
      // olursa sheet ekranın ortasından fırlamış gibi görünür.
      if (sheetHeight === null) return;

      // Zaten açıkken hiçbir şey yapma. Veri güncellemesi (provisional →
      // enriched) animasyonu tekrar tetiklemesin.
      if (isOpenRef.current) return;

      isOpenRef.current = true;
      // Tam ekran altına yerleştir, sonra yukarı yay.
      translateY.value = sheetHeight;
      translateY.value = withSpring(0, SPRING_CONFIG);
      overlayOpacity.value = withTiming(OVERLAY_OPACITY, { duration: 300 });
    } else if (isOpenRef.current) {
      isOpenRef.current = false;
      dismissSheet(sheetHeight ?? windowHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, sheetHeight]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Yukarı çekmeye izin yok; sheet sabit yüksekliğinde.
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      const height = sheetHeight ?? windowHeight;
      if (e.translationY > height * DISMISS_RATIO || e.velocityY > DISMISS_VELOCITY) {
        dismissSheet(height);
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
        overlayOpacity.value = withTiming(OVERLAY_OPACITY, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const handleSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    // Aynı değeri tekrar yazmak gereksiz render tetiklemesin.
    if (h > 0 && h !== sheetHeight) setSheetHeight(h);
  };

  if (!restaurant) return null;

  // Adres artık `places.photo_base_urls`'ten geliyor; anahtar burada YOK.
  // Bir dönem bu URL elle kuruluyordu ve `photoUrl(` grep'i onu kaçırıyordu.
  const photoUrl = placePhotoUrl(restaurant.photo_base_url, 800);

  // Üç durum: (a) kendi puanım, (b) yoksa Google ortalaması, (c) hiçbiri.
  const ownRating = restaurant.rating;
  const googleRating = restaurant.googleRating ?? null;
  const displayRating = ownRating ?? googleRating;
  const isGoogleRating = ownRating === null && googleRating !== null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Karartma örtüsü */}
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet — `height` YOK, yükseklik içerikten geliyor (yukarıdaki not) */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          onLayout={handleSheetLayout}
          style={[styles.sheet, { maxHeight: maxSheetHeight }, sheetStyle]}
        >
          {/* Sürükleme tutamacı */}
          <View style={styles.handleBar} />

          {/* Kart gövdesi bilinçli olarak tıklanabilir DEĞİL — detay sayfasına
              yalnızca aşağıdaki "Detayları gör" şeridi götürür. */}
          <View style={[styles.imageContainer, { height: imageHeight }]}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.imageFallback]}>
                <Icon name="restaurant" size={36} color={Colors.textMuted} />
              </View>
            )}

            {/* Fotoğraf üstü puan rozeti — koyu zemin okunabilirlik için */}
            {displayRating !== null && (
              <Chip
                label={displayRating.toFixed(1)}
                variant="onImage"
                icon="rating"
                style={styles.ratingBadge}
              />
            )}
          </View>

          {/* Bilgi — alt kenarda gesture çubuğunun altında kalmasın */}
          <View style={[styles.info, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <Chip label={cuisineLabelOf(restaurant.cuisine)} variant="brand" />

            <Text style={styles.name} numberOfLines={2}>
              {restaurant.restaurant_name}
            </Text>

            {restaurant.address ? (
              <View style={styles.addressRow}>
                <Icon name="location" size={14} color={Colors.textMuted} />
                <Text style={styles.address} numberOfLines={2}>
                  {restaurant.address}
                </Text>
              </View>
            ) : null}

            {displayRating !== null ? (
              <View style={styles.ratingRow}>
                <StarRating rating={displayRating} size={16} showValue />
                {/* Kimin puanı olduğu belirsiz kalmasın. */}
                {isGoogleRating && (
                  <Text style={styles.ratingSource}>Google ortalaması</Text>
                )}
              </View>
            ) : (
              <Text style={styles.unrated}>Henüz puanlanmamış</Text>
            )}

            {/* Detay sayfasına giden TEK tıklanabilir alan. */}
            {onPressDetail && (
              <Pressable
                style={({ pressed }) => [
                  styles.detailHint,
                  pressed && styles.detailHintPressed,
                ]}
                onPress={onPressDetail}
                android_ripple={{ color: Colors.brandSubtle, borderless: false }}
                accessibilityRole="button"
                accessibilityLabel={`${restaurant.restaurant_name} detaylarını aç`}
              >
                <Text style={styles.detailHintText}>Detayları gör</Text>
                <Icon name="forward" size={18} color={Colors.brandStrong} />
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
              onPress={onClose}
              android_ripple={{ color: Colors.brandSubtle, borderless: false }}
              accessibilityRole="button"
            >
              <Text style={styles.closeButtonText}>Kapat</Text>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Opak taban; görünürlüğü animasyonlu `opacity` belirliyor.
    backgroundColor: Colors.scrimBase,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // `height` BİLİNÇLİ OLARAK YOK — dosya başındaki nota bak.
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    ...Elevation.sheet,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.borderMuted,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xxs,
  },

  imageContainer: {
    position: 'relative',
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: {
    backgroundColor: Colors.canvasAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },

  info: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  name: {
    ...Type.title,
    color: Colors.textPrimary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxs,
  },
  address: {
    ...Type.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  ratingSource: {
    ...Type.micro,
    color: Colors.textMuted,
  },
  unrated: {
    ...Type.caption,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  detailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.brandSurface,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xxs,
  },
  // iOS'ta ripple yok; basılı geri bildirimi buradan geliyor.
  detailHintPressed: { backgroundColor: Colors.brandSubtle },
  detailHintText: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },

  closeButton: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xxs,
  },
  closeButtonPressed: { backgroundColor: Colors.canvasAlt },
  closeButtonText: {
    ...Type.bodyStrong,
    color: Colors.textStrong,
  },
});
