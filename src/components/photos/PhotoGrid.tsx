import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { PlacePhoto } from '../../types';
import { photoPublicUrl } from '../../lib/placePhotos';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';
import PhotoViewer, { PhotoViewerInfo } from './PhotoViewer';

/**
 * Mekan fotoğrafları ızgarası.
 *
 * ── ⚠️ IZGARA YALNIZCA `thumb_path` KULLANIR ─────────────────────────────────
 * Bu bir optimizasyon değil, ücretsiz katmana sığmanın koşulu. Hesap:
 * listelerde tam boy servis edilirse aylık egress ~11 GB (sınır 5 GB),
 * küçük kopyayla ~1,6 GB. Tam boy YALNIZCA kullanıcı bir kareye dokununca
 * indiriliyor (`PhotoViewer`) — yani egress kullanıcının gerçek ilgisiyle
 * orantılı. Buraya `storage_path` yazmak sınırı sessizce aşmanın en kolay yolu.
 *
 * ── GÖRÜNTÜLEYİCİ ARTIK AYRI BİLEŞEN ────────────────────────────────────────
 * Tam ekran görünüm `PhotoViewer`'a taşındı (üç katmanlı jest yapısı ve ileride
 * ziyaret detayındaki yatay şeritten de açılabilmesi için). AÇIK/KAPALI STATE'İ
 * BURADA KALDI: mekan sayfası tarafında hiçbir şey değişmesin diye — her yüzey
 * kendi açık fotoğrafını kendi tutuyor.
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
  /**
   * Tam ekran görüntüleyicinin şeritlerinde ne yazacağı.
   *
   * ── ⚠️ BU PROP BİR TASARIM KARARININ TERSİNE ÇEVRİLMESİ ─────────────────
   * Bir dönem burada `onPhotoPress: (photo) => boolean` vardı ve dokunuş
   * fotoğrafı HİÇ GÖSTERMEDEN doğrudan ziyaret detayına / puan yorumuna
   * gidiyordu. Karar tersine çevrildi: dokunuş artık HER ZAMAN fotoğrafı tam
   * ekran açıyor, ziyaret/puan bilgisi fotoğrafın ÜSTÜNDEKİ şeritlere taşındı.
   *
   * `null` döndürmek geçerli: o fotoğrafın anlatacak bir hikâyesi yok, şeritler
   * hiç açılmıyor, fotoğraf yine tam ekran görünüyor.
   *
   * ── NEDEN KARAR BU BİLEŞENDE DEĞİL ──────────────────────────────────────
   * Bilgi iki ayrı kaynaktan geliyor (`diary_entries` gömülü satırı ve
   * `user_rankings`) ve ikincisi çağıranın elinde. Izgara bunları bilseydi tek
   * işi olan "kareleri çiz"in dışına çıkardı.
   */
  infoOf?: (photo: PlacePhoto) => PhotoViewerInfo | null;
  /**
   * Tam ekran görüntüleyicide kullanıcı adına dokunulunca — çağıran kendi
   * stack'inde push ediyor.
   *
   * ⚠️ KENDİ FOTOĞRAFINDA HİÇ KURULMUYOR; kararı burası veriyor çünkü sahiplik
   * bilgisi (`currentUserId`) zaten burada, uzun basış dalı için. Gerekçe
   * `PhotoViewer.onPressAuthor`'ın yorumunda (kendi profiline gitmek "en az
   * sürpriz" kuralına aykırı).
   */
  onPressAuthor?: (photo: PlacePhoto) => void;
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
  /**
   * Görsel indirilemedi mi (404, ağ, bozuk dosya).
   *
   * ⚠️ ONSUZ SESSİZ BİR BOŞLUK KALIYORDU: kare `opacity: 0` ile başlıyor ve
   * yalnızca `onLoad` ile 1'e çıkıyor, yani yükleme başarısız olunca opaklık
   * 0'da KALIYOR ve kullanıcı boş gri bir kare görüyor — hiçbir açıklama yok.
   * Sahada görüldü: Storage'daki dosyalar silinince satırlar kaldı ve ızgara
   * sessizce boşaldı.
   */
  const [failed, setFailed] = useState(false);

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
        onError={() => setFailed(true)}
      />

      {/* Kırık kare — boş gri bir kutu yerine ne olduğunu söylüyor. */}
      {failed && (
        <View style={styles.cellFallback}>
          <Icon name="photo" size={20} color={Colors.textMuted} />
          <Text style={styles.cellFallbackText}>Yüklenemedi</Text>
        </View>
      )}

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
  infoOf,
  onPressAuthor,
  emptyLabel,
  pending = 0,
}: PhotoGridProps) {
  const { width } = useWindowDimensions();
  /**
   * Açık olan fotoğraf. Yükleme/hata/şerit durumları `PhotoViewer`'ın kendi
   * içinde — ızgaranın onları bilmesi gerekmiyor.
   */
  const [viewing, setViewing] = useState<PlacePhoto | null>(null);

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
              // Dokunuş HER FOTOĞRAFTA aynı: tam ekran aç. Ziyaret/puan
              // bilgisi oraya, fotoğrafın üstündeki şeritlere taşındı.
              onPress={() => setViewing(photo)}
              onLongPress={longPress || undefined}
            />
          );
        })}
      </View>

      {/* Tam boy görüntüleyici — `storage_path` yalnızca ORADA okunuyor.
          `infoOf` verilmezse şeritler hiç açılmaz, saf fotoğraf görünümü. */}
      <PhotoViewer
        photo={viewing}
        info={viewing && infoOf ? infoOf(viewing) : null}
        onClose={() => setViewing(null)}
        // Kendi karende callback HİÇ verilmiyor → ad düz metin olarak çiziliyor.
        onPressAuthor={
          viewing && onPressAuthor && viewing.user_id !== currentUserId
            ? () => {
                // ⚠️ GÖRÜNTÜLEYİCİ ÖNCE KAPANIYOR: açık bir RN `Modal` hedef
                // ekranın ÖNÜNDE kalır ve kullanıcı siyah bir katmana bakardı
                // (`MapSummarySheet`/`RankingReviewSheet` aynı sebeple önce
                // kapanıyor). State burada olduğu için kapatma da burada.
                setViewing(null);
                onPressAuthor(viewing);
              }
            : undefined
        }
      />
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

  /** Kırık kare — görselin yerine, kutuyu tamamen dolduruyor. */
  cellFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xxs,
    backgroundColor: Colors.canvasAlt,
  },
  cellFallbackText: {
    ...Type.micro,
    color: Colors.textMuted,
  },

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
});
