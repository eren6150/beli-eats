import React, { useCallback } from 'react';
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
import { DiaryEntryDetailParams } from '../types';
import { photoUrl } from '../lib/places';
import { photoPublicUrl } from '../lib/placePhotos';
import { formatVisitDate } from '../lib/date';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import Icon from '../components/ui/Icon';
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
    photoReference,
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
   * ⚠️ YAKLAŞIK EŞLEŞME — bilinçli ve v1 kararı.
   *
   * `place_photos` fotoğrafı MEKANA + KULLANICIYA bağlıyor, GİRİŞE DEĞİL.
   * Yani "bu ziyaretin fotoğrafları" diye bir şey şemada yok; buradakiler
   * yazarın o mekana yüklediği fotoğraflar ve BAŞKA BİR ZİYARETTEN olabilir.
   * Başlık bu yüzden "bu ziyaretin" demiyor, "bu mekandan" diyor — kullanıcıya
   * olmayan bir kesinlik vaat etmiyoruz.
   *
   * Doğru çözüm `place_photos`'a nullable `diary_entry_id` eklemek, ama o
   * fotoğraf YÜKLEME akışının da girişi bilmesini gerektiriyor — ayrı ve daha
   * büyük iş. Nullable kolon olduğu için sonradan eklemek ucuz.
   */
  const authorPhotos = photos.filter((p) => p.user_id === authorId);

  useFocusEffect(
    useCallback(() => {
      fetchLikes();
      fetchPhotos();
    }, [fetchLikes, fetchPhotos])
  );

  const heroUrl = photoUrl(photoReference, PLACE_PHOTO_WIDTH);
  const trimmedNote = note?.trim();

  const goToPlace = () =>
    navigation.navigate('RestaurantDetail', {
      placeId,
      placeName,
      photoReference,
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

        {/* ── Fotoğraflar ── başlık kasıtlı olarak "bu ziyaretin" demiyor. */}
        {authorPhotos.length > 0 && (
          <View style={styles.photoSection}>
            <Text style={styles.photoTitle}>
              @{authorUsername} · bu mekandan fotoğraflar
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {authorPhotos.map((photo) => {
                // Küçük kopya (`thumb_path`) — ücretsiz katmanda egress hesabı
                // buna dayanıyor, ızgara/şerit ASLA tam boyu kullanmamalı.
                const uri = photoPublicUrl(photo.thumb_path);
                return uri ? (
                  <Image key={photo.id} source={{ uri }} style={styles.photoTile} />
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
