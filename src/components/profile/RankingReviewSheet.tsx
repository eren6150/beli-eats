import React, { useEffect, useState } from 'react';
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
import { PlacePhoto, UserRanking } from '../../types';
import { placePhotoUrl } from '../../lib/places';
import { photoPublicUrl } from '../../lib/placePhotos';
import { buildPhotoInfo } from '../../lib/photoInfo';
import { useRankingPhotos } from '../../hooks/useRankingPhotos';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import StarRating from '../ui/StarRating';
import Icon from '../ui/Icon';
import PhotoViewer from '../photos/PhotoViewer';

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

/** Şeritteki karelerin kenarı. `thumb_path` uzun kenarı 400, yani fazlasıyla yeter. */
const STRIP_THUMB_SIZE = 76;

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

  /**
   * ⚠️ SHEET ARTIK SORGU ATIYOR — "anlık görüntü" kuralının BİLİNÇLİ delinmesi.
   *
   * Bileşen bugüne kadar yalnızca parametreyle besleniyordu. Fotoğrafları
   * çağırandan almak `ProfileScreen`/`UserProfileScreen`'in listedeki HER
   * sıralama için fotoğraf yüklemesi demekti (N+1 ya da gereksiz toplu sorgu);
   * oysa burada sorgu kullanıcı dokunuşuyla, tek kayıt için atılıyor.
   * `usePlaceVisits`'in kabul edilmiş deseni.
   */
  const { photos, error: photosError, fetchPhotos, clearPhotos } =
    useRankingPhotos(ranking?.user_id, ranking?.place_id);

  /** Tam ekran görüntüleyicide açık olan kare. */
  const [viewing, setViewing] = useState<PlacePhoto | null>(null);

  useEffect(() => {
    if (ranking) {
      fetchPhotos();
    } else {
      // Sheet kapandı: hem kareler hem görüntüleyici sıfırlanıyor, yoksa
      // bir sonraki açılışta önceki mekanın fotoğrafları bir kare görünürdü.
      clearPhotos();
      setViewing(null);
    }
  }, [ranking, fetchPhotos, clearPhotos]);

  /**
   * `buildPhotoInfo`'nun puan dalını besliyor. Sheet'in elindeki kayıt zaten
   * doğru olanı — ayrıca sorgulamaya gerek yok.
   *
   * Bu şeritteki her karenin `entry_id`'si null olduğu için `buildPhotoInfo`
   * ziyaret dalına HİÇ girmiyor; şeritte puan + yorum çıkıyor, tarih ÇIKMIYOR
   * (bir puanın ziyaret tarihi yoktur — o kararın gerekçesi `photoInfo.ts`'te).
   */
  const rankingOf = (userId: string) =>
    ranking && ranking.user_id === userId ? ranking : null;

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

              {/* ── Fotoğraf şeridi ──────────────────────────────────────
                  YORUM `ScrollView`'UNUN DIŞINDA ve SABİT YÜKSEKLİKTE.
                  İçine koymak `DiaryEntrySheet`'in dersini tekrarlamak
                  olurdu: sheet `maxHeight` ile sınırlı ve uzun bir yorumda
                  kırpılan ilk şey en alttaki eleman olur.

                  ⚠️ BAŞLIK "BU PUANLAMANIN FOTOĞRAFLARI" DEĞİL — kümede
                  ızgaradan yüklenmiş mekan katkıları da var ve şema ikisini
                  ayırt edemiyor (gerekçe `useRankingPhotos`'ta). Kareyi
                  puanın malı gibi etiketlemek, bu projenin dört kez pahalıya
                  patlattığı isim/davranış uyumsuzluğu olurdu. */}
              {photos.length > 0 && (
                <View style={styles.photoSection}>
                  <Text style={styles.photoTitle}>Bu mekandaki fotoğrafların</Text>
                  {/* Sanallaştırma YOK (`ListPicker`'ın dersi): birkaç kare
                      için `FlatList` sıfır fayda, karşılığında bayat hücre
                      hata sınıfı getiriyor. */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoStrip}
                  >
                    {photos.map((photo) => {
                      const uri = photoPublicUrl(photo.thumb_path);
                      return (
                        <Pressable
                          key={photo.id}
                          onPress={() => setViewing(photo)}
                          style={({ pressed }) => pressed && styles.pressed}
                          accessibilityRole="button"
                          accessibilityLabel="Fotoğrafı tam ekran aç"
                        >
                          {uri ? (
                            <Image source={{ uri }} style={styles.stripThumb} />
                          ) : (
                            <View style={[styles.stripThumb, styles.thumbFallback]}>
                              <Icon name="photo" size={20} color={Colors.textMuted} />
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Yükleme durumunda hiçbir şey çizilmiyor ("Senin Ziyaretlerin"
                  ile aynı karar): birkaç karelik bir şerit için iskelet,
                  yalnızca yerleşim zıplaması üretirdi. Hata ise sessiz
                  geçilmiyor. */}
              {photosError && (
                <Text style={styles.photoError}>{photosError}</Text>
              )}

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

      {/**
        * ⚠️ İÇ İÇE `Modal` — bu dosyanın CİHAZDA İLK DOĞRULANACAK yeri.
        *
        * `PhotoViewer` kendisi bir `Modal` ve burada sheet'in `Modal`'ının
        * İÇİNDE render ediliyor. Uygulamadaki diğer iki çağrı yeri
        * (`PhotoGrid`, `DiaryEntryDetailScreen`) düz EKRAN, yani bu desen
        * projede ilk kez kuruluyor.
        *
        * Alternatifler ve neden seçilmediler:
        *   • Kareleri tıklanamaz bırakmak → ziyaret detayında tam olarak bu
        *     sahada şikayet olmuştu ("dokunuyorum, hiçbir şey olmuyor").
        *   • Dokununca sheet'i kapatıp mekan sayfasına gitmek → zaten alttaki
        *     "Mekan sayfasına git" butonunun işi; ikinci bir kopya olurdu.
        *
        * İç içe `Modal` beklendiği gibi çalışmazsa (Android'de bilinen bir
        * kırılganlık) GERİ ÇEKİLME TEK SATIR: `setViewing(photo)` yerine
        * `onClose()` + mekan sayfasına yönlendirme.
        */}
      <PhotoViewer
        photo={viewing}
        info={viewing ? buildPhotoInfo(viewing, rankingOf) : null}
        onClose={() => setViewing(null)}
        /**
         * `onPressAuthor` VERİLMİYOR — ad düz metin kalıyor. Kareler zaten bu
         * sıralamanın sahibine ait ve sheet onun profilinden/ya da onun
         * kaydından açılıyor; oraya bir daha gitmeyi önermek döngü olurdu.
         * Ayrıca bir `Modal`'ın içinden `navigate` etmek sheet'i de kapatmayı
         * gerektirirdi (`MapSummarySheet`'in dersi).
         */
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** Şerit bloğu — SABİT yükseklik, yorumun kaydırma alanına dahil değil. */
  photoSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  photoTitle: {
    ...Type.captionStrong,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  photoStrip: {
    gap: Spacing.xs,
    paddingRight: Spacing.lg,
  },
  stripThumb: {
    width: STRIP_THUMB_SIZE,
    height: STRIP_THUMB_SIZE,
    borderRadius: Radius.md,
    backgroundColor: Colors.canvas,
  },
  photoError: {
    ...Type.caption,
    color: Colors.danger,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
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
