import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { usePlacePhotos } from '../hooks/usePlacePhotos';
import { useEntryLikes } from '../hooks/useEntryLikes';
import { DiaryEntryDetailParams, PlacePhoto } from '../types';
import { placePhotoUrl } from '../lib/places';
import { photoPublicUrl } from '../lib/placePhotos';
import { buildPhotoInfo } from '../lib/photoInfo';
import { formatVisitDate } from '../lib/date';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import Icon from '../components/ui/Icon';
import PhotoViewer from '../components/photos/PhotoViewer';
import StarRating from '../components/ui/StarRating';
import ErrorBanner from '../components/ui/ErrorBanner';

/**
 * TEK BİR ZİYARETİN DETAYI — Faz 3 / Diff E.
 *
 * ── NEDEN AYRI EKRAN, MEKAN SAYFASINA GÖMÜLÜ DEĞİL ───────────────────────────
 * Bir günlük girişi birinci sınıf bir nesne (`diary_entries.id`) ve ÜÇ
 * çağıranı var: kendi günlüğün, `UserProfile`'ın günlük sekmesi ve (Diff D)
 * aktivite akışı — akış zaten baştan sona bu nesnelerden oluşacak. Mekan
 * sayfası ise KANONİK ve PAYLAŞILAN; oraya belirli bir kişinin ziyaretini
 * gömmek "mekan" ile "bir kişinin o mekana gidişi"ni karıştırırdı.
 *
 * ── İSİM: "ZİYARET", "İNCELEME" DEĞİL ────────────────────────────────────────
 * Uygulamada her yerde "Ziyaret" ve "Günlük" geçiyor ("Ziyaret Ekle").
 * Buraya "İnceleme" demek isim/davranış uyumsuzluğunun BEŞİNCİSİ olurdu — bu
 * proje o hatayı dört kez ödedi ("Listeme Ekle", "Popüler Listeler",
 * "Etrafındaki Mekanlar", `CreateList`). Terim değişecekse HER YERDE birden
 * değişmeli, ayrı bir diff olarak.
 *
 * ── SALT OKUNUR ──────────────────────────────────────────────────────────────
 * Kendi girişin bile olsa burada düzenleme/silme YOK. O yollar kendi
 * profilindeki uzun basış menüsünde duruyor ve orada cihazda doğrulanmış;
 * ikinci bir giriş noktası açmak aynı işi iki yerde tutmak olurdu.
 */

type RouteType = RouteProp<
  { DiaryEntryDetail: DiaryEntryDetailParams },
  'DiaryEntryDetail'
>;

/** Mekan görseli — kart genişliğinde tek görsel. */
const PLACE_PHOTO_WIDTH = 600;

/** Fotoğraf şeridindeki kare boyu. */
const PHOTO_TILE = 96;

export default function DiaryEntryDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteType>();
  const {
    entryId,
    authorId,
    authorUsername,
    placeId,
    placeName,
    photoBaseUrl,
    visitedAt,
    rating,
    note,
  } = route.params;

  const { user } = useAuth();
  const isOwn = user?.id === authorId;

  const {
    count,
    liked,
    loading: likeLoading,
    checking: likeChecking,
    error: likeError,
    toggleLike,
    fetchLikes,
  } = useEntryLikes(entryId, user?.id);

  const { photos, fetchPhotos } = usePlacePhotos(placeId);

  /**
   * BU ZİYARETİN fotoğrafları — tam eşleşme (2026-08-13).
   *
   * ── ESKİDEN YAKLAŞIK EŞLEŞMEYDİ ─────────────────────────────────────────
   * Filtre `user_id === authorId` idi, yani yazarın o mekana yüklediği TÜM
   * fotoğraflar; başlık da bu yüzden "bu ziyaretin" değil "bu mekandan"
   * diyordu. Kod yorumu *"doğru çözüm `place_photos`'a nullable bir giriş
   * kolonu eklemek"* diye not düşmüştü — **migration 020 o kolonu ekledi**
   * (`entry_id`, FK + `idx_place_photos_entry_id`), ama filtre eski mantıkta
   * kalmıştı.
   *
   * Tutarsızlık `PhotoViewer`'ın bilgi şeritleri gelene kadar GÖRÜNMÜYORDU:
   * başka bir ziyaretten gelen kareye dokununca üst şeritte sayfanın
   * tarihiyle çelişen bir tarih çıkıyordu. Sahada bu şekilde fark edildi.
   *
   * ── NEDEN "SADECE BU ZİYARET", NEDEN İKİ GRUP DEĞİL ─────────────────────
   * `entry_id`'si BOŞ fotoğraf geçici değil KALICI bir kategori: "Puanı
   * Kaydet" ve ızgaranın "Menü/Yemek ekle" yolları onu üretmeye devam ediyor
   * ve etmeli — menü fotoğrafı bir ziyaret anısı değil, MEKANA yapılan bir
   * katkı (fotoğraf özelliğinin varlık sebebi de tam olarak bu, bkz. Faz 2).
   * Dolayısıyla onların evi mekan sayfasının dört sekmeli ızgarası; ziyaret
   * sayfasına ikinci kez, sekmesiz bir kopya olarak taşımak bu sayfanın tek
   * konusunu (bir ziyaret) boğardı. Değerlendirilen "Bu ziyaretten / Bu
   * mekandan diğerleri" ikili gruplaması bu yüzden REDDEDİLDİ.
   *
   * Ziyarette fotoğraf yoksa bölüm HİÇ ÇİZİLMİYOR (aşağıda) — bu eksik bir
   * cevap değil, doğru cevap.
   *
   * ⚠️ `authorId` KONTROLÜ GEREKMİYOR: migration 020'nin INSERT politikası bir
   * kullanıcının fotoğrafını yalnızca KENDİ ziyaretine bağlamasına izin
   * veriyor, yani `entry_id` eşleşmesi yazarı da garanti ediyor.
   */
  const entryPhotos = photos.filter((p) => p.entry_id === entryId);

  /**
   * Şeritteki kareler artık TAM EKRAN AÇILIYOR.
   *
   * Öncesinde düz `<Image>`'lardı — dokunuşun hiçbir karşılığı yoktu ve sahada
   * "dokunuyorum, hiçbir şey olmuyor" olarak bildirildi. Projenin *"tıklanabilir
   * görünüp tepki vermemek, hiç tıklanabilir görünmemekten kötü"* ilkesinin
   * karşılığı; fotoğraf zaten dokunulası bir yüzey.
   *
   * `PhotoViewer` mekan sayfasındakiyle AYNI bileşen — zaten bu ikinci yüzey
   * için `PhotoGrid`'den çıkarılmıştı. Açık fotoğraf state'i HER YÜZEYDE KENDİ
   * içinde duruyor.
   */
  const [viewing, setViewing] = useState<PlacePhoto | null>(null);

  /**
   * ⚠️ `usePlaceRankings` BU EKRANDA YOK — ve FİLTREYE BAĞLI.
   *
   * O hook, `entry_id`'si BOŞ bir karenin şeridini doldurmak için gerekiyor
   * (`buildPhotoInfo`'nun ikinci dalı). Filtre `entry_id === entryId` olduğu
   * için bu şeritte öyle bir kare **olamaz**: her karenin `entry_id`'si dolu,
   * yani `buildPhotoInfo` her zaman BİRİNCİ dala giriyor ve ziyaret verisini
   * fotoğraf sorgusundan gömülü olarak alıyor. Hook burada ölü koddu ve
   * ziyaret detayı başına bir sorgu yakıyordu; kaldırıldı.
   *
   * 🔗 FİLTRE GEVŞETİLİRSE GERİ GELMELİ. Bu şeride `entry_id`'si boş bir kare
   * girdiği an (ör. "bu mekandan diğerleri" grubu eklenirse) puan/yorum
   * şeritleri SESSİZCE boş kalır — hata vermez, sadece bilgi kaybolur.
   * `rankingOf` o zaman tekrar `buildPhotoInfo`'ya verilmeli.
   */

  useFocusEffect(
    useCallback(() => {
      fetchLikes();
      fetchPhotos();
    }, [fetchLikes, fetchPhotos])
  );

  const heroUrl = placePhotoUrl(photoBaseUrl, PLACE_PHOTO_WIDTH);
  const trimmedNote = note?.trim();

  const goToPlace = () =>
    navigation.navigate('RestaurantDetail', {
      placeId,
      placeName,
      photoBaseUrl,
    });

  /**
   * Yazarın profiline. Kendi girişinse gitmiyoruz: `UserProfile` salt okunur
   * ve kendi profilinde ayarlar/düzenleme beklenir — `HomeScreen`'in
   * leaderboard satırındaki kararla aynı, en az sürpriz.
   */
  const goToAuthor = () => {
    if (isOwn) return;
    navigation.navigate('UserProfile', { userId: authorId, username: authorUsername });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Şerit — projede hiçbir ekran native header göstermiyor. */}
      <View style={styles.bar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Icon name="back" size={22} color={Colors.textStrong} />
        </Pressable>
        <Text style={styles.barTitle}>Ziyaret</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Yazar ── */}
        <Pressable
          onPress={goToAuthor}
          disabled={isOwn}
          style={({ pressed }) => [styles.authorRow, pressed && styles.pressed]}
          accessibilityRole={isOwn ? undefined : 'button'}
        >
          <View style={styles.authorAvatar}>
            <Text style={styles.authorAvatarLetter}>
              {authorUsername.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>@{authorUsername}</Text>
            <Text style={styles.visitDate}>{formatVisitDate(visitedAt)}</Text>
          </View>
        </Pressable>

        {/* ── Mekan ── */}
        <Pressable
          onPress={goToPlace}
          style={({ pressed }) => [styles.placeCard, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          {heroUrl ? (
            <Image source={{ uri: heroUrl }} style={styles.placePhoto} />
          ) : (
            <View style={[styles.placePhoto, styles.placePhotoFallback]}>
              <Icon name="restaurant" size={28} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.placeInfo}>
            <Text style={styles.placeName} numberOfLines={2}>
              {placeName}
            </Text>
            <Text style={styles.placeLink}>Mekan sayfasını aç ›</Text>
          </View>
        </Pressable>

        {/* ── Puan ── Puansız giriş mümkün (diary'nin ana kararı), o durumda
            bölüm hiç render edilmiyor: "0 yıldız" göstermek yanlış olurdu. */}
        {rating != null && (
          <View style={styles.ratingRow}>
            {/* `showValue` primitive'in kendi prop'u — sayıyı burada elle
                yazmak ikinci bir biçimlendirme kaynağı olurdu. */}
            <StarRating rating={rating} size={24} showValue />
          </View>
        )}

        {/* ── Not ── KIRPILMIYOR: bu ekranın varlık sebebi tam olarak notu
            eksiksiz okuyabilmek. Listede 2 satıra sığdırılıyor, burada değil. */}
        {trimmedNote ? (
          <Text style={styles.note}>{trimmedNote}</Text>
        ) : (
          <Text style={styles.noteEmpty}>Bu ziyarete not eklenmemiş.</Text>
        )}

        {/* ── Fotoğraflar ──
            Başlık artık gerçeği söylüyor: bunlar TAM OLARAK bu ziyaretin
            kareleri (gerekçe `entryPhotos`'un yorumunda). İsim/davranış
            uyumsuzluğu bu projede dört kez pahalıya patladı.

            BOŞSA HİÇ ÇİZİLMİYOR: `EmptyState` bu ölçekte orantısız ve ekran
            salt okunur — "fotoğraf ekle" çağrısı da konmuyor, yükleme yolu
            ziyaret formunda. Liste açıklamasının ve "Senin Ziyaretlerin"in
            aynı kararı. */}
        {entryPhotos.length > 0 && (
          <View style={styles.photoSection}>
            <Text style={styles.photoTitle}>Bu ziyaretten fotoğraflar</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {entryPhotos.map((photo) => {
                // Küçük kopya (`thumb_path`) — ücretsiz katmanda egress hesabı
                // buna dayanıyor, ızgara/şerit ASLA tam boyu kullanmamalı.
                // Tam boy YALNIZCA `PhotoViewer`'da iniyor.
                const uri = photoPublicUrl(photo.thumb_path);
                return uri ? (
                  <Pressable
                    key={photo.id}
                    onPress={() => setViewing(photo)}
                    style={({ pressed }) => pressed && styles.photoTilePressed}
                  >
                    <Image source={{ uri }} style={styles.photoTile} />
                  </Pressable>
                ) : null;
              })}
            </ScrollView>
          </View>
        )}

        {likeError && <ErrorBanner message={likeError} style={styles.banner} />}
      </ScrollView>

      {/* ── Beğeni şeridi — SABİT, ScrollView'ın DIŞINDA ──────────────────────
          `DiaryEntrySheet`'in Kaydet butonundan öğrenilen ders: uzun bir not
          alt kısmı ekranın dışına iterdi ve tek etkileşim erişilemez kalırdı. */}
      <View style={styles.likeBar}>
        <Pressable
          onPress={toggleLike}
          // Kendi girişini beğenme ARAYÜZDE kapalı (veritabanı serbest —
          // gerekçe migration 016'da). `useFollow`'un `isSelf` deseni.
          disabled={isOwn || likeLoading || likeChecking}
          style={({ pressed }) => [
            styles.likeBtn,
            liked && styles.likeBtnActive,
            (pressed || likeLoading) && styles.pressed,
            isOwn && styles.likeBtnHidden,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: liked, disabled: isOwn }}
        >
          <Icon
            name={liked ? 'heartActive' : 'heart'}
            size={20}
            color={liked ? Colors.textOnBrand : Colors.textStrong}
          />
          <Text style={[styles.likeLabel, liked && styles.likeLabelActive]}>
            {liked ? 'Beğendin' : 'Beğen'}
          </Text>
        </Pressable>

        {/* Sayaç kendi girişinde de görünüyor: beğenemesen bile kaç kişinin
            beğendiğini görmek istersin. */}
        <Text style={styles.likeCount}>
          {count === 0 ? 'Henüz beğeni yok' : `${count} beğeni`}
        </Text>
      </View>

      {/* Tam ekran görüntüleyici — mekan sayfasındakiyle AYNI bileşen, aynı üç
          katmanlı jest yapısı. Şeritlerin içeriğini `buildPhotoInfo` üretiyor,
          yani iki yüzey tek kuralı paylaşıyor. */}
      <PhotoViewer
        photo={viewing}
        // `rankingOf` yerine hep-null: bu şeritteki her karenin `entry_id`'si
        // dolu, yani `buildPhotoInfo` ikinci dala HİÇ girmiyor. Gerekçe ve
        // filtreye bağımlılık uyarısı yukarıda.
        info={viewing ? buildPhotoInfo(viewing, () => null) : null}
        onClose={() => setViewing(null)}
        /**
         * Kullanıcı adına dokunuş → yükleyicinin profili.
         *
         * KENDİ FOTOĞRAFINDA callback HİÇ verilmiyor (ad düz metin olur) —
         * `PhotoGrid`'in aynı kararı, gerekçe `PhotoViewer.onPressAuthor`'da.
         * Bu ekranın kendi başlığındaki yazar adı da aynı kuralla çalışıyor
         * (`goToAuthor`), yani iki yüzey tutarlı.
         *
         * ⚠️ Görüntüleyici ÖNCE kapatılıyor: açık bir `Modal` hedef ekranın
         * önünde kalır.
         *
         * NOT: bu şeritteki kareler yazarın kendi fotoğrafları olduğu için
         * hedef pratikte her zaman `authorId`; yine de `photo.user_id`
         * kullanılıyor — filtre bir gün değişirse (bilinen bayat filtre işi)
         * burası kendiliğinden doğru kalsın.
         */
        onPressAuthor={
          viewing && viewing.user_id !== user?.id && viewing.profiles?.username
            ? () => {
                const target = viewing;
                const username = target.profiles?.username;
                if (!username) return;
                setViewing(null);
                navigation.navigate('UserProfile', {
                  userId: target.user_id,
                  username,
                });
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  barTitle: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },

  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarLetter: {
    ...Type.heading,
    color: Colors.brandStrong,
  },
  authorInfo: { flex: 1 },
  authorName: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  visitDate: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Gölge YOK — Midas kararı: ayrım ince kenarlık + yüzey kontrastından.
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.canvasAlt,
  },
  placePhoto: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  placePhotoFallback: {
    backgroundColor: Colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeInfo: { flex: 1 },
  placeName: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  placeLink: {
    ...Type.caption,
    color: Colors.brandStrong,
    marginTop: 2,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },

  note: {
    ...Type.body,
    color: Colors.textStrong,
    marginTop: Spacing.lg,
  },
  noteEmpty: {
    ...Type.caption,
    color: Colors.textMuted,
    marginTop: Spacing.lg,
  },

  photoSection: { marginTop: Spacing.xl },
  photoTitle: {
    ...Type.captionStrong,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  photoStrip: { gap: Spacing.xs },
  /** Basılı geri bildirimi — uygulamanın geri kalanıyla aynı 0.7 opaklık. */
  photoTilePressed: { opacity: 0.7 },
  photoTile: {
    width: PHOTO_TILE,
    height: PHOTO_TILE,
    borderRadius: Radius.md,
    backgroundColor: Colors.canvasAlt,
  },

  banner: { marginTop: Spacing.lg },

  likeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  likeBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  // Kendi girişinde buton HİÇ görünmüyor; şerit yalnızca sayacı taşıyor.
  likeBtnHidden: { display: 'none' },
  likeLabel: {
    ...Type.captionStrong,
    color: Colors.textStrong,
  },
  likeLabelActive: { color: Colors.textOnBrand },
  likeCount: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
});
