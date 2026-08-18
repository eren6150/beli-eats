import React from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserRanking } from '../../types';
import { placePhotoUrl } from '../../lib/places';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import StarRating from '../ui/StarRating';
import Icon from '../ui/Icon';

/**
 * Bir sıralama kaydının okuma görünümü: puan + TAM yorum metni.
 *
 * ── NEYİ KAPATIYOR ───────────────────────────────────────────────────────────
 * CLAUDE.md'deki **BOŞLUK 1**. `review_text` bugüne kadar yalnızca iki yerde
 * görünüyordu: satırda TEK SATIRA kırpılmış halde (`RankRow`) ve mekan
 * sayfasındaki düzenleme formunun içinde. İkincisi HER ZAMAN OTURUM SAHİBİNİN
 * kaydını gösteriyor (`useRankings(user?.id)`), yani **başkasının yorumunun tam
 * metnine ulaşan hiçbir yol yoktu**.
 *
 * ── AYNI HATANIN İKİZİ, PROJE BUNU BİR KEZ DÜZELTTİ ─────────────────────────
 * Günlük satırları da bir dönem mekan sayfasına gidiyordu ve aynı sebeple
 * yanlıştı: *"kullanıcı o kişinin ne düşündüğünü görmek istiyordu"*. O taraf
 * `DiaryEntryDetail` ile düzeltildi; sıralama tarafında aynı hata duruyordu.
 *
 * ── NEDEN ROTA DEĞİL BİLEŞEN ─────────────────────────────────────────────────
 * Sıralama satırları iki ekranda yaşıyor (`ProfileScreen`, `UserProfileScreen`)
 * ve onlar iki ayrı stack'te. Ekran yapmak iki param listesi + iki stack kaydı
 * demekti — `AddToListSheet`'in aynı gerekçesi. Üstelik "Senin Ziyaretlerin"
 * işinde tam bu tuzak (eksik rota kaydı → çalışma anında çökme) yeni kapatıldı;
 * ikincisini açmanın anlamı yok. Sheet'in rota riski SIFIR.
 *
 * ── NEDEN KAYDIRILABİLİR ─────────────────────────────────────────────────────
 * `review_text`'in HİÇBİR YERDE uzunluk sınırı yok — ne şemada (`review_text
 * text`) ne istemcide (`maxLength` yok). Projedeki diğer serbest metinlerin
 * hepsinin var (`note` 1000, `bio` 300, liste açıklaması 500), bu bir
 * tutarsızlık ve ayrı bir iş. Sonucu: "zaten kısa, olduğu gibi göster"
 * varsayımı burada geçersiz, metin kaydırılabilir olmak zorunda.
 *
 * ── SALT OKUNUR ──────────────────────────────────────────────────────────────
 * Kendi kaydın bile olsa burada düzenleme YOK. Yorumun evi mekan sayfasındaki
 * form ve orada çalışıyor; ikinci bir giriş noktası açmak aynı işi iki yerde
 * tutmak olurdu (`DiaryEntryDetail`'in kararının aynısı). Sheet bunun yerine
 * mekan sayfasına giden bir satır sunuyor.
 *
 * ── VERİ: YENİ SORGU YOK ─────────────────────────────────────────────────────
 * `UserRanking` satırı çağıranın elinde zaten tam olarak var (`review_text`
 * dahil, liste sorgusuyla geliyor). Sheet parametreyle besleniyor —
 * `ListDetail`/`DiaryEntryDetail`'in anlık görüntü kuralı.
 *
 * MEKANİK `MapSummarySheet` / `AddToListSheet` ile aynı: RN `Modal` +
 * `animationType="slide"`.
 */

export interface RankingReviewSheetProps {
  /**
   * Gösterilecek kayıt. `null` → sheet kapalı.
   *
   * Ayrı bir `visible` bayrağı YOK: iki kaynağı senkron tutmak "açık ama
   * verisi yok" ara durumunu mümkün kılardı. Tek kaynak = tek gerçek.
   */
  ranking: UserRanking | null;
  onClose: () => void;
  /**
   * "Mekan sayfasına git" — çağıran kendi stack'inde push ediyor.
   *
   * ZORUNLU. Bir dönem opsiyonel yapılmıştı (mekan sayfasının fotoğraf
   * ızgarasından açılınca satır gizlensin diye) ama o çağrı yeri kaldırıldı:
   * fotoğraf dokunuşu artık tam ekran görüntüleyiciye gidiyor, bu sheet'e
   * değil. Opsiyonel bırakmak, bugün kimsenin kullanmadığı bir dalı ayakta
   * tutmak olurdu — "bugün kullanılanı inşa et".
   */
  onPressPlace: (ranking: UserRanking) => void;
}

/** Mekan görselinin genişliği — Places Photo endpoint'ine gider. */
const PHOTO_WIDTH = 200;

/** Sheet ekranın tamamını kaplamasın; uzun yorumda içerik kendi içinde kayar. */
const MAX_SHEET_RATIO = 0.8;

export default function RankingReviewSheet({
  ranking,
  onClose,
  onPressPlace,
}: RankingReviewSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const review = ranking?.review_text?.trim();
  const thumb = placePhotoUrl(
    ranking?.places?.photo_base_urls?.[0],
    PHOTO_WIDTH
  );

  return (
    <Modal
      visible={ranking !== null}
      transparent
      animationType="slide"
      // Android donanım/jest geri tuşu — Modal'da bu olmadan kapanmaz.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              maxHeight: windowHeight * MAX_SHEET_RATIO,
              paddingBottom: insets.bottom + Spacing.sm,
            },
          ]}
        >
          <View style={styles.handleBar} />

          {/* `ranking` null iken Modal zaten görünmüyor; bu kontrol tipi
              daraltmak için. */}
          {ranking && (
            <>
              <View style={styles.header}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Icon name="restaurant" size={22} color={Colors.textMuted} />
                  </View>
                )}

                <View style={styles.headerText}>
                  <Text style={styles.title} numberOfLines={2}>
                    {ranking.restaurant_name}
                  </Text>
                  <StarRating rating={ranking.rating} size={16} showValue />
                </View>

                <Pressable
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => pressed && styles.pressed}
                  accessibilityRole="button"
                  accessibilityLabel="Kapat"
                >
                  <Icon name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>

              {/* Yorum — `flexShrink: 1` ŞART. RN'de varsayılan `flexShrink` 0,
                  onsuz uzun bir yorum sheet'in `maxHeight`'ini aşar ve kırpılan
                  ilk şey alttaki eylem satırı olurdu. `DiaryEntrySheet`'in
                  sabit footer dersinin aynısı. */}
              <ScrollView
                style={styles.reviewScroll}
                contentContainerStyle={styles.reviewContent}
                showsVerticalScrollIndicator={false}
              >
                {review ? (
                  <Text style={styles.review}>{review}</Text>
                ) : (
                  // Boş yorum GİZLENMİYOR: sheet zaten dokunarak açıldı, boş
                  // bir gövde "yüklenmedi mi" izlenimi verirdi.
                  <Text style={styles.emptyReview}>
                    Bu mekan için yorum yazılmamış.
                  </Text>
                )}
              </ScrollView>

              <Pressable
                onPress={() => onPressPlace(ranking)}
                style={({ pressed }) => [
                  styles.placeAction,
                  pressed && styles.placeActionPressed,
                ]}
                accessibilityRole="button"
              >
                <Icon name="restaurant" size={18} color={Colors.brandStrong} />
                <Text style={styles.placeActionText}>Mekan sayfasına git</Text>
                <Icon name="forward" size={18} color={Colors.brandStrong} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.scrimMedium,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    ...Elevation.sheet,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.borderMuted,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.canvasAlt,
  },
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, gap: Spacing.xxs },
  title: {
    ...Type.heading,
    color: Colors.textPrimary,
  },
  pressed: { opacity: 0.6 },

  reviewScroll: { flexShrink: 1 },
  reviewContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  review: {
    // `Type.body` + `textStrong`: liste açıklamasında verilen kararın aynısı —
    // istenen vurgu "küçük gri not" değil, okunur bir gövde metni.
    ...Type.body,
    color: Colors.textStrong,
  },
  emptyReview: {
    ...Type.body,
    color: Colors.textMuted,
  },

  placeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.brandSurface,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    borderRadius: Radius.lg,
  },
  placeActionPressed: { backgroundColor: Colors.brandSubtle },
  placeActionText: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
    flex: 1,
  },
});
