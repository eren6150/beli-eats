import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Pressable,
  Modal,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { PlacePhoto } from '../../types';
import { photoPublicUrl } from '../../lib/placePhotos';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Mekan fotoğrafları ızgarası + tam boy görüntüleyici.
 *
 * ── ⚠️ IZGARA YALNIZCA `thumb_path` KULLANIR ─────────────────────────────────
 * Bu bir optimizasyon değil, ücretsiz katmana sığmanın koşulu. Hesap:
 * listelerde tam boy servis edilirse aylık egress ~11 GB (sınır 5 GB),
 * küçük kopyayla ~1,6 GB. Tam boy YALNIZCA kullanıcı bir kareye dokununca
 * indiriliyor — yani egress kullanıcının gerçek ilgisiyle orantılı.
 * Buraya `storage_path` yazmak sınırı sessizce aşmanın en kolay yolu.
 *
 * Üç sütun sabit değil, ekran genişliğinden hesaplanıyor: `DiaryEntrySheet`
 * dersinden sonra sabit piksel varsayımı yapmıyoruz.
 */

const COLUMNS = 3;
const GAP = Spacing.xxs;

export interface PhotoGridProps {
  photos: PlacePhoto[];
  /** Yatay padding — kare boyutunu doğru hesaplamak için gerekiyor. */
  horizontalPadding: number;
  /**
   * Oturum sahibi. Uzun basışın hangi dala gideceğini bu belirliyor:
   * kendi fotoğrafı → sil, başkasınınki → bildir.
   */
  currentUserId?: string;
  onDelete?: (photo: PlacePhoto) => void;
  /**
   * Başkasının fotoğrafında uzun basış → şikayet seçicisi.
   *
   * Verilmezse o dal HİÇ kurulmuyor — `onDelete`'in aynı kuralı ve projenin
   * "tıklanabilir görünüp tepki vermemek, hiç tıklanabilir görünmemekten
   * kötü" ilkesi.
   */
  onReport?: (photo: PlacePhoto) => void;
  emptyLabel: string;
  /**
   * Uçuştaki yükleme sayısı — her biri için spinner'lı bir yer tutucu kare.
   *
   * Geri bildirimin IZGARADA olması bilinçli: kullanıcı "dokunuşum işe yaradı
   * mı" sorusunu, sonucun belireceği yere bakarak cevaplıyor. Öncesinde tek
   * sinyal bölüm başlığındaki küçük "Yükleniyor…" metniydi ve arkadaş
   * testinde fark edilmedi — birkaç saniye hiçbir şey olmuyor, sonra fotoğraf
   * aniden beliriyordu.
   */
  pending?: number;
}

/**
 * Tek kare — kendi fade-in animasyonunu taşıyor.
 *
 * AYRI BİLEŞEN, çünkü her karenin KENDİ `Animated.Value`'una ihtiyacı var;
 * `map` içinde ref oluşturulamaz. `useNativeDriver` opacity'de çalışıyor,
 * yani animasyon JS thread'ini meşgul etmiyor.
 */
function PhotoCell({
  photo,
  size,
  onPress,
  onLongPress,
}: {
  photo: PlacePhoto;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  return (
    <Pressable
      onPress={onPress}
      // Uzun basış → KENDİ fotoğrafında sil, BAŞKASININKİNDE bildir. Projedeki
      // yıkıcı/ikincil eylem deseni bu (`ListCard`, `DiaryRow`): her kareye
      // ikon koymak ızgarayı gürültülendirirdi. "Bildir" için ayrı bir yüzey
      // açılmadı çünkü bu dal zaten BOŞTU — başkasının fotoğrafında uzun
      // basışın hiçbir karşılığı yoktu.
      onLongPress={onLongPress}
      style={({ pressed }) => [
        { width: size, height: size },
        styles.cell,
        pressed && styles.cellPressed,
      ]}
    >
      <Animated.Image
        source={{ uri: photoPublicUrl(photo.thumb_path) ?? undefined }}
        style={[styles.thumb, { opacity }]}
        resizeMode="cover"
        // Görsel hazır olunca beliriyor. Yeni fotoğrafa özel kod YOK: her
        // kare aynı yolu izliyor, bu da genel "pop-in" hissini de kaldırıyor.
        onLoad={() =>
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }).start()
        }
      />

      {/**
        * "Gizlendi" etiketi — YALNIZCA yükleyicinin kendi karesinde görünür.
        *
        * Politika gizli satırları başkasına HİÇ döndürmüyor (migration 018:
        * `not hidden or auth.uid() = user_id`), yani bu rozet mantıken zaten
        * yalnızca sahibine çiziliyor; ekstra bir sahiplik kontrolü gereksiz.
        *
        * Etiket olmadan kullanıcı fotoğrafını sessizce KAYBOLMUŞ görürdü
        * (başkalarında görünmüyor) ve bunu bir hata sanardı.
        */}
      {photo.hidden && (
        <View style={styles.hiddenBadge}>
          <Text style={styles.hiddenBadgeText}>Gizlendi</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function PhotoGrid({
  photos,
  horizontalPadding,
  currentUserId,
  onDelete,
  onReport,
  emptyLabel,
  pending = 0,
}: PhotoGridProps) {
  const { width } = useWindowDimensions();
  const [viewing, setViewing] = useState<PlacePhoto | null>(null);
  const [fullLoading, setFullLoading] = useState(false);

  const size = (width - horizontalPadding * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  // Boş metin YALNIZCA gerçekten boşken. Uçuşta bir yükleme varsa ızgara
  // çiziliyor ki yer tutucu görünsün — ilk fotoğrafını yükleyen kullanıcı
  // "henüz fotoğraf yok" yazısına bakarken hiçbir geri bildirim almazdı.
  if (photos.length === 0 && pending === 0) {
    // `EmptyState` KULLANILMIYOR: 72px rozet + geniş padding, sekmeli bir
    // bölümde orantısız kalıyor (harita özetiyle aynı gerekçe).
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <>
      <View style={styles.grid}>
        {/* Yer tutucular BAŞTA: liste `created_at desc` sıralı, yani yeni
            fotoğraf sol üste düşecek. Spinner'ın sonucun belireceği yerde
            olması, bekleme ile sonucu aynı noktada birleştiriyor. */}
        {Array.from({ length: pending }).map((_, i) => (
          <View
            key={`pending-${i}`}
            style={[{ width: size, height: size }, styles.cell, styles.pendingCell]}
          >
            <ActivityIndicator color={Colors.brand} />
          </View>
        ))}

        {photos.map((photo) => {
          const mine = Boolean(currentUserId && photo.user_id === currentUserId);

          /**
           * Uzun basış TEK jest, İKİ anlam — hangisi olduğunu sahiplik
           * belirliyor. Oturum yoksa (`currentUserId` undefined) ikisi de
           * kurulmuyor: şikayet RLS'te `auth.uid()` istiyor, anon bir
           * kullanıcıya tepki vermeyecek bir jest sunmak yanıltıcı olurdu.
           */
          const longPress = !currentUserId
            ? undefined
            : mine
              ? onDelete && (() => onDelete(photo))
              : onReport && (() => onReport(photo));

          return (
            <PhotoCell
              key={photo.id}
              photo={photo}
              size={size}
              onPress={() => {
                setFullLoading(true);
                setViewing(photo);
              }}
              onLongPress={longPress || undefined}
            />
          );
        })}
      </View>

      {/* Tam boy görüntüleyici — `storage_path` yalnızca BURADA okunuyor. */}
      <Modal
        visible={viewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.viewerRoot} onPress={() => setViewing(null)}>
          {fullLoading && <ActivityIndicator color={Colors.textOnBrand} />}
          {viewing && (
            <Image
              source={{ uri: photoPublicUrl(viewing.storage_path) ?? undefined }}
              style={styles.full}
              resizeMode="contain"
              onLoadEnd={() => setFullLoading(false)}
            />
          )}
          <View style={styles.viewerClose}>
            <Icon name="close" size={24} color={Colors.textOnBrand} />
          </View>
          {viewing?.caption ? (
            <Text style={styles.viewerCaption}>{viewing.caption}</Text>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.canvasAlt,
  },
  cellPressed: { opacity: 0.7 },
  pendingCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  thumb: { width: '100%', height: '100%' },

  /** Karenin altına oturan şerit — görselin kendisini kapatmıyor. */
  hiddenBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrimStrong,
    paddingVertical: Spacing.xxs,
    alignItems: 'center',
  },
  hiddenBadgeText: {
    ...Type.micro,
    color: Colors.textOnBrand,
  },

  empty: {
    ...Type.caption,
    color: Colors.textMuted,
    paddingVertical: Spacing.md,
  },

  viewerRoot: {
    flex: 1,
    backgroundColor: Colors.scrimStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  full: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: Spacing['3xl'],
    right: Spacing.lg,
  },
  viewerCaption: {
    ...Type.body,
    color: Colors.textOnBrand,
    position: 'absolute',
    bottom: Spacing['3xl'],
    paddingHorizontal: Spacing.lg,
    textAlign: 'center',
  },
});
