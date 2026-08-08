import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  Place,
  PlacePhoto,
  PlacePhotoKind,
  RestaurantDetailStackParamList,
} from '../types';
import { useAuth } from '../hooks/useAuth';
import { useRankings } from '../hooks/useRankings';
import { photoUrl } from '../lib/places';
import { peekPlace, resolvePlace } from '../lib/placeCache';
import { Colors, Elevation, Radius, Spacing, Type } from '../constants/theme';
import StarRating from '../components/ui/StarRating';
import ErrorBanner from '../components/ui/ErrorBanner';
import SectionHeader from '../components/ui/SectionHeader';
import Chip from '../components/ui/Chip';
import Icon from '../components/ui/Icon';
import AddToListSheet from '../components/lists/AddToListSheet';
import DiaryEntrySheet from '../components/diary/DiaryEntrySheet';
import DiaryRow from '../components/diary/DiaryRow';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import PhotoGrid from '../components/photos/PhotoGrid';
import { usePlacePhotos } from '../hooks/usePlacePhotos';
import { usePlaceVisits } from '../hooks/usePlaceVisits';
import { makePhotoRenditions, uploadPlacePhoto } from '../lib/placePhotos';

// Ekran üç stack'te birden kayıtlı; route tipi bu yüzden tek bir stack'in
// param listesine değil, paylaşılan tipe bağlı.
type RouteType = RouteProp<RestaurantDetailStackParamList, 'RestaurantDetail'>;

/**
 * Navigasyon tipi de aynı paylaşılan listeye bağlı. `any` DEĞİL — bu ekranın
 * tek `navigate` hedefi `DiaryEntryDetail` ve o rota dört stack'in dördünde de
 * kayıtlı olmak ZORUNDA. Tipi gerçek listeye bağlamak, eksik bir kayıt
 * durumunda hatayı çalışma anı yerine derleme anında yakalıyor.
 */
type NavigationType = NativeStackNavigationProp<RestaurantDetailStackParamList>;

/** Hero görselinin yüksekliği. */
const HERO_HEIGHT = 280;

/** Galeride gösterilecek en fazla fotoğraf. */
const MAX_PHOTOS = 8;

// ─── Puan seçici ──────────────────────────────────────────────────────────────

function RatingSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.selector}>
      <StarRating rating={value} size={32} onChange={onChange} />
      <Text style={styles.selectorValue}>
        {value > 0 ? `${value.toFixed(1)} / 5.0` : 'Puan seçmek için dokun'}
      </Text>
    </View>
  );
}

// ─── Fotoğraf sekmeleri ───────────────────────────────────────────────────────
//
// Değerler İngilizce (DB'deki `place_photos_kind_valid` kısıtıyla birebir),
// etiketler Türkçe — `SearchScreen`'in CUISINE_TR haritasıyla aynı ayrım.
// Buraya tür eklemek migration 013'teki CHECK kısıtını da güncellemek demek.

const PHOTO_TABS: ReadonlyArray<{ key: PlacePhotoKind; label: string }> = [
  { key: 'menu', label: 'Menü' },
  { key: 'food', label: 'Yemek' },
  { key: 'venue', label: 'Mekan' },
  { key: 'other', label: 'Diğer' },
];

/** Aksiyon butonu aktif sekmeye göre konuşuyor — tür bağlamdan geliyor. */
const PHOTO_ADD_LABEL: Record<PlacePhotoKind, string> = {
  menu: 'Menü ekle',
  food: 'Yemek ekle',
  venue: 'Mekan ekle',
  other: 'Fotoğraf ekle',
};

const PHOTO_EMPTY_LABEL: Record<PlacePhotoKind, string> = {
  menu: 'Henüz menü fotoğrafı yok. İlk ekleyen sen ol.',
  food: 'Henüz yemek fotoğrafı yok.',
  venue: 'Henüz mekan fotoğrafı yok.',
  other: 'Henüz fotoğraf yok.',
};

// ─── Ekran ────────────────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationType>();
  // Modül seviyesinde okunan Dimensions rotasyonda güncellenmiyordu.
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { placeId, placeName, photoReference } = route.params;

  const {
    rankings,
    error: rankingsError,
    fetchRankings,
    addOrUpdateRanking,
  } = useRankings(user?.id);

  // Başlangıç değeri BELLEKTEN senkron okunuyor. Cilalama işi buydu: eskiden
  // `loading` her mount'ta true başlıyordu ve cache hit'te bile bir kare
  // spinner görünüyordu. peekPlace I/O yapmaz.
  const [place, setPlace] = useState<Place | null>(() => peekPlace(placeId));
  const [loading, setLoading] = useState(() => peekPlace(placeId) === null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState(false);

  /** "Listeye Ekle" seçicisi ve onu açmadan önceki cache hazırlığı. */
  const [listSheetVisible, setListSheetVisible] = useState(false);
  const [preparingList, setPreparingList] = useState(false);

  /** "Ziyaret Ekle" formu — aynı cache ön koşuluna tabi. */
  const [diarySheetVisible, setDiarySheetVisible] = useState(false);
  const [preparingDiary, setPreparingDiary] = useState(false);

  /** "Tekrar dene" bunu artırıyor; effect bağımlılığı olduğu için yükleme tekrarlanır. */
  const [reloadToken, setReloadToken] = useState(0);

  /** Fotoğraf bölümü — aktif sekme, yükleme durumu ve kısa hata metni. */
  const [photoTab, setPhotoTab] = useState<PlacePhotoKind>('menu');
  /**
   * Yükleme HANGİ TÜRE yapılıyor — boolean DEĞİL, bilinçli.
   * Yer tutucu kare yalnızca hedef sekmede görünmeli: kullanıcı yükleme
   * sürerken başka sekmeye geçerse, boolean'la spinner yanlış sekmede
   * belirir ve oraya bir fotoğraf gelecekmiş gibi görünürdü.
   */
  const [uploadingKind, setUploadingKind] = useState<PlacePhotoKind | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const {
    fetchPhotos,
    byKind,
    countOf,
    removePhoto,
    error: photoFetchError,
  } = usePlacePhotos(placeId);

  /** "Senin Ziyaretlerin" — bu kullanıcının BU mekana ait günlük girişleri. */
  const { visits, fetchVisits } = usePlaceVisits(user?.id, placeId);

  const existingRanking = rankings.find((r) => r.place_id === placeId);

  // Fotoğraf URL'leri cache satırından türetiliyor — ayrı state tutmak iki
  // kaynağı senkron tutma derdi demekti.
  const photos = useMemo(
    () =>
      (place?.photo_refs ?? [])
        .slice(0, MAX_PHOTOS)
        .map((ref) => photoUrl(ref, 800))
        .filter((u): u is string => u !== null),
    [place]
  );

  // Mekan bilgisi `places` cache'inden geliyor, doğrudan Google'dan değil.
  // resolvePlace: L1 bellek → L2 tablo → L3 Google. Taze ise çağrı yok;
  // bayat ise cache gösterilip arka planda yenilenir.
  useEffect(() => {
    // placeId değişirse veya ekran kapanırsa geç gelen yanıt state'i ezmesin.
    let cancelled = false;

    const warm = peekPlace(placeId);
    if (warm) setPlace(warm);
    // Bellekte veri varsa spinner HİÇ gösterilmiyor.
    setLoading(warm === null);
    setDetailsError(null);

    resolvePlace(placeId, {
      fallbackName: placeName,
      // Bayat satır arka planda yenilenince ekran kendini günceller.
      onRevalidated: (fresh) => {
        if (!cancelled) setPlace(fresh);
      },
    })
      .then((result) => {
        if (!cancelled) setPlace(result);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[RestaurantDetail] mekan bilgisi alınamadı:', e);
        setDetailsError(
          e instanceof Error ? e.message : 'Mekan bilgisi alınamadı.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placeId, placeName, reloadToken]);

  // Kendi puanım oturuma bağlı. Bağımlılık eskiden [placeId] idi; mount anında
  // useAuth henüz çözülmediği için fetchRankings userId yok diye sessizce
  // çıkıyor ve bir daha tetiklenmiyordu. fetchRankings zaten userId'ye bağlı
  // bir useCallback — bağımlılığa onu vermek oturum gelince sorguyu tekrarlatır,
  // useFocusEffect de ekrana her dönüşte tazeler.
  useFocusEffect(
    useCallback(() => {
      fetchRankings();
      // Fotoğraflar da odakta tazeleniyor: başka bir cihazdan/kullanıcıdan
      // eklenen kareler geri dönüşte görünsün.
      fetchPhotos();
      // Ziyaretler de: kullanıcı bir satırdan detaya gidip orada bir şey
      // değiştirdiyse (ya da profilinden sildiyse) geri dönüşte bayat kalmasın.
      fetchVisits();
    }, [fetchRankings, fetchPhotos, fetchVisits])
  );

  useEffect(() => {
    if (existingRanking) {
      setRating(existingRanking.rating);
      setReviewText(existingRanking.review_text ?? '');
    }
  }, [existingRanking]);

  const handleRetryDetails = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  /**
   * `places` cache satırının VAR OLDUĞUNU garanti eder.
   *
   * İki yazma yolunun da ortak ön koşulu: `user_rankings.place_id` (migration
   * 003) ve `list_items.place_id` (migration 005) ikisi de `places`'e FK.
   * Okuma yolu normalde satırı zaten yazdı; yazamadıysa (ağ hatası) burada bir
   * kez daha deniyoruz. Yine olmazsa çağıran HİÇBİR ŞEY yazmamalı — yoksa FK
   * ihlali kullanıcıya anlamsız bir Postgres hatası olarak dönerdi.
   */
  const ensurePlaceCached = useCallback(async (): Promise<Place | null> => {
    if (place) return place;

    try {
      const resolved = await resolvePlace(placeId, { fallbackName: placeName });
      if (resolved) setPlace(resolved);
      return resolved;
    } catch (e) {
      console.error('[RestaurantDetail] mekan cache\'e yazılamadı:', e);
      return null;
    }
  }, [place, placeId, placeName]);

  /**
   * Fotoğraf ekleme — tür AKTİF SEKMEDEN geliyor, ayrı bir seçici yok.
   *
   * `ensurePlaceCached()` galeriyi açmadan ÖNCE çalışıyor: `place_photos`
   * `places`'e FK ve cache satırı garanti edilemiyorsa kullanıcıya fotoğraf
   * seçtirip sonra hata göstermek olurdu — hatanın yeri seçilen fotoğraf
   * değil, mekanın kendisi. `AddToListSheet`'te kurulan desenin aynısı.
   *
   * İki kopya (1280px tam boy + 400px ızgara) `makePhotoRenditions` ile
   * İSTEMCİDE üretiliyor: Supabase Free planda sunucu tarafı görsel
   * dönüştürme yok ve ızgaranın küçük kopyayı kullanması egress'in 5 GB
   * sınırına sığmasının koşulu.
   */
  const handleAddPhoto = async () => {
    if (!user) {
      Alert.alert('Giriş gerekli', 'Fotoğraf eklemek için giriş yapmalısın.');
      return;
    }

    const resolved = await ensurePlaceCached();
    if (!resolved) {
      setPhotoError('Mekan bilgisi alınamadı, tekrar dene.');
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'İzin gerekli',
        'Fotoğraf eklemek için galeri erişimine izin vermelisin.'
      );
      return;
    }

    // `quality: 1` — burada SIKIŞTIRMA YOK. Sıkıştırmayı `makePhotoRenditions`
    // yapıyor; burada da sıkıştırmak çift kayıp olur ve kaliteyi boşuna düşürür.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];

    // Hedef tür SEÇİM ANINDA sabitleniyor: kullanıcı yükleme sürerken sekme
    // değiştirse bile fotoğraf başladığı sekmeye gitmeli.
    const targetKind = photoTab;
    setUploadingKind(targetKind);
    setPhotoError(null);

    try {
      const { fullUri, thumbUri } = await makePhotoRenditions({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });

      const { error: uploadError } = await uploadPlacePhoto({
        placeId,
        userId: user.id,
        kind: targetKind,
        fullUri,
        thumbUri,
      });

      if (uploadError) {
        // Ekrana kısa metin, konsola tam nesne — projenin hata kuralı.
        // Ham mesaj ŞABLONLANMIYOR.
        setPhotoError('Fotoğraf yüklenemedi. Bağlantını kontrol et.');
        return;
      }

      await fetchPhotos();
    } catch (e) {
      // Küçültme/kaydetme aşaması: bozuk veya desteklenmeyen görsel.
      console.error('[RestaurantDetail] fotoğraf hazırlanamadı:', e);
      setPhotoError('Fotoğraf işlenemedi. Başka bir görsel dene.');
    } finally {
      setUploadingKind(null);
    }
  };

  /** Uzun basış → onaylı silme. `ListCard` / `DiaryRow` ile aynı desen. */
  const handleDeletePhoto = (photo: PlacePhoto) => {
    Alert.alert('Fotoğrafı sil', 'Bu fotoğraf kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error: deleteError } = await removePhoto(photo);
          if (deleteError) {
            setPhotoError('Fotoğraf silinemedi, tekrar dene.');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (rating === 0) {
      Alert.alert('Puan Gerekli', 'Lütfen bir puan seç.');
      return;
    }

    setSaving(true);

    const resolved = await ensurePlaceCached();

    if (!resolved) {
      setSaving(false);
      Alert.alert(
        'Kaydedilemedi',
        'Mekan bilgisi alınamadı. Bağlantını kontrol edip tekrar dene.'
      );
      return;
    }

    // `restaurantName` / `photoReference` / koordinat GÖNDERİLMİYOR: RPC
    // onları `places`'ten okuyor. `ensurePlaceCached` yukarıda o satırın
    // varlığını zaten garantiledi.
    const { error } = await addOrUpdateRanking({
      placeId,
      rating,
      reviewText: reviewText || undefined,
    });

    setSaving(false);
    if (error) {
      // Hook artık kısa Türkçe metin döndürüyor; ham Postgres/ağ mesajı
      // console'da kalıyor.
      Alert.alert('Hata', error.message);
    } else {
      Alert.alert('Kaydedildi', 'Puanın sıralamana işlendi.');
    }
  };

  /**
   * Seçiciyi açmadan ÖNCE cache satırını garantiliyoruz. Sonradan denemek,
   * kullanıcı bir listeye dokunduktan sonra FK hatası göstermek demekti —
   * hatanın yeri seçilen liste değil, mekanın kendisi.
   *
   * Puan ZORUNLU DEĞİL: "gidilecekler" listesi tam olarak henüz gitmediğin
   * yerler için.
   */
  const handleOpenListSheet = async () => {
    setPreparingList(true);
    const resolved = await ensurePlaceCached();
    setPreparingList(false);

    if (!resolved) {
      Alert.alert(
        'Açılamadı',
        'Mekan bilgisi alınamadı. Bağlantını kontrol edip tekrar dene.'
      );
      return;
    }

    setListSheetVisible(true);
  };

  /**
   * Ziyaret formu da aynı ön koşula tabi: `diary_entries.place_id` de
   * `places`'e FK (migration 009).
   */
  const handleOpenDiarySheet = async () => {
    setPreparingDiary(true);
    const resolved = await ensurePlaceCached();
    setPreparingDiary(false);

    if (!resolved) {
      Alert.alert(
        'Açılamadı',
        'Mekan bilgisi alınamadı. Bağlantını kontrol edip tekrar dene.'
      );
      return;
    }

    setDiarySheetVisible(true);
  };

  /**
   * Kayıt sonrası sıralamayı tazeliyoruz: puanlı bir giriş `user_rankings`'i
   * de güncelledi (migration 010'daki RPC), ekrandaki "Puanını Güncelle"
   * kartı bayat kalmasın.
   *
   * Ziyaret listesi de tazeleniyor — yeni giriş "Senin Ziyaretlerin"
   * bölümünde hemen görünsün. Bölüm butonların hemen altında olduğu için
   * kullanıcı kaydettiği ziyaretin listeye düştüğünü aynı ekranda görüyor.
   */
  const handleDiarySaved = () => {
    setDiarySheetVisible(false);
    fetchRankings();
    fetchVisits();
    Alert.alert('Kaydedildi', 'Ziyaretin günlüğüne eklendi.');
  };

  return (
    // Hero bilinçli olarak tam kanamalı (status bar'ın altına uzanıyor),
    // bu yüzden kapsayıcıya üst inset verilmiyor — geri butonuna veriliyor.
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces>
        {/* ── Hero: fotoğraf galerisi ── */}
        {loading ? (
          <View style={[styles.hero, styles.heroPlaceholder, { width }]}>
            <ActivityIndicator color={Colors.brand} size="large" />
          </View>
        ) : photos.length > 0 ? (
          <FlatList
            horizontal
            data={photos}
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => `photo-${i}`}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={[styles.hero, { width }]}
                resizeMode="cover"
              />
            )}
          />
        ) : (
          <View style={[styles.hero, styles.heroFallback, { width }]}>
            <Icon name="restaurant" size={44} color={Colors.textMuted} />
          </View>
        )}

        {/* ── Geri butonu — status bar / çentik altında kalmasın ── */}
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            { top: insets.top + Spacing.sm },
            pressed && styles.backBtnPressed,
          ]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" size={22} color={Colors.textPrimary} />
        </Pressable>

        {/* ── İçerik ── */}
        <View style={styles.content}>
          {/* Hatalar sessizce yutulmasın — boş ekran yerine sebebi ve
              yeniden deneme yolu göster. */}
          {detailsError && (
            <ErrorBanner
              message={detailsError}
              onRetry={handleRetryDetails}
              style={styles.banner}
            />
          )}
          {rankingsError && (
            <ErrorBanner
              // Şablonlama YOK: hook artık kısa ve tam bir cümle döndürüyor,
              // önüne ikinci bir başlık eklemek "... okunamadı: ... yüklenemedi"
              // gibi tekrarlı bir metin üretiyordu.
              message={rankingsError}
              onRetry={fetchRankings}
              style={styles.banner}
            />
          )}

          {/* ── Mekan bilgisi ── */}
          <Text style={styles.name}>{place?.name ?? placeName}</Text>

          {place?.formatted_address ? (
            <View style={styles.addressRow}>
              <Icon name="location" size={15} color={Colors.textMuted} />
              <Text style={styles.address}>{place.formatted_address}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            {/* `place?.google_rating &&` YAZMA: rating 0 ise JSX ekrana "0"
                basar. typeof kontrolü boolean döndürdüğü için o tuzağa düşmez. */}
            {typeof place?.google_rating === 'number' && (
              <Chip
                label={`Google ${place.google_rating.toFixed(1)}`}
                variant="rating"
                icon="rating"
              />
            )}
            {place?.types?.[0] ? (
              <Chip label={place.types[0]} variant="brand" humanize />
            ) : null}
          </View>

          <View style={styles.divider} />

          {/* ── Puanlama ── */}
          <View style={styles.card}>
            <SectionHeader
              title={existingRanking ? 'Puanını Güncelle' : 'Puan Ver'}
              subtitle="Yarım yıldız hassasiyetinde puanlayabilirsin."
            />
            <RatingSelector value={rating} onChange={setRating} />
          </View>

          {/* ── Fotoğraflar ──
              Sekmeler `SegmentedTabs` ile: CLAUDE.md'de "Faz 2'de fotoğraf
              türü sekmeleri aynısını kullanacak" diye zaten planlanmıştı.

              DÖRT SEKME DE HER ZAMAN GÖRÜNÜR, boş olan gizlenmiyor. Dolu
              olana göre sekme gizlemek, aynı mekanda sekmelerin yer
              değiştirmesine yol açardı; proje "sekmeler arası geçerken göz
              kaymasın" ilkesini birden çok yerde uyguladı. */}
          <View style={styles.photosSection}>
            <SectionHeader
              title="Fotoğraflar"
              subtitle="Menü, yemek ve mekan kareleri"
              // Aksiyon etiketi AKTİF SEKMEYE göre değişiyor — yükleme türünü
              // ayrı bir seçiciyle sormak yerine bağlamdan alıyoruz. Ekstra
              // sheet yok, kullanıcı zaten baktığı sekmeye ekliyor.
              actionLabel={
                uploadingKind ? 'Yükleniyor…' : PHOTO_ADD_LABEL[photoTab]
              }
              onAction={uploadingKind ? undefined : handleAddPhoto}
            />

            {/* Yükleme/silme hatası ile okuma hatası aynı şeride düşüyor:
                kullanıcı için ikisi de "fotoğraflarda bir sorun var".
                Yazma hatası önceliklendiriliyor — o, kullanıcının az önce
                yaptığı bir eylemin sonucu. */}
            {(photoError ?? photoFetchError) && (
              <ErrorBanner
                message={(photoError ?? photoFetchError) as string}
                style={styles.photoBanner}
              />
            )}

            <SegmentedTabs
              tabs={PHOTO_TABS.map((t) => ({
                key: t.key,
                label: `${t.label} (${countOf(t.key)})`,
              }))}
              active={photoTab}
              onChange={setPhotoTab}
              style={styles.photoTabs}
            />

            <PhotoGrid
              photos={byKind(photoTab)}
              horizontalPadding={Spacing.lg}
              currentUserId={user?.id}
              onDelete={handleDeletePhoto}
              emptyLabel={PHOTO_EMPTY_LABEL[photoTab]}
              // Yer tutucu YALNIZCA yüklemenin hedeflendiği sekmede.
              pending={uploadingKind === photoTab ? 1 : 0}
            />
          </View>

          {/* ── Yorum ──
              Altyazı "İsteğe bağlı" DEĞİL, ne olduğunu söylüyor: aynı ekranda
              artık iki metin alanı görünüyor (`user_rankings.review_text` ile
              `diary_entries.note`) ve ikisi KASITLI olarak farklı işler
              yapıyor. Bkz. CLAUDE.md → "Puanlama ile günlük arasındaki iş
              bölümü". Opsiyonelliği zaten boş bırakılabilmesi anlatıyor. */}
          <View style={styles.reviewSection}>
            <SectionHeader
              title="Yorumun"
              subtitle="Mekan hakkındaki genel görüşün"
            />
            <TextInput
              style={styles.reviewInput}
              placeholder="Bu mekan hakkında ne düşünüyorsun?"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              value={reviewText}
              onChangeText={setReviewText}
              textAlignVertical="top"
            />
          </View>

          {/* ── Kaydet ──
              Metin bilinçli olarak "Puanı Kaydet": eskiden "Listeme Ekle"
              yazıyordu ama yaptığı iş puan yazmak. Altındaki "Listeye Ekle"
              gelince iki buton neredeyse aynı şeyi vaat ediyordu. */}
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (saving || pressed) && styles.saveButtonPressed,
            ]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={Colors.textOnBrand} />
            ) : (
              <>
                <Icon
                  name={existingRanking ? 'check' : 'rating'}
                  size={20}
                  color={Colors.textOnBrand}
                />
                <Text style={styles.saveButtonText}>
                  {existingRanking ? 'Puanı Güncelle' : 'Puanı Kaydet'}
                </Text>
              </>
            )}
          </Pressable>

          {/* ── İkincil eylemler — ikisi de puandan bağımsız ── */}
          <Pressable
            style={({ pressed }) => [
              styles.listButton,
              (preparingDiary || pressed) && styles.listButtonPressed,
            ]}
            onPress={handleOpenDiarySheet}
            disabled={preparingDiary}
            accessibilityRole="button"
          >
            {preparingDiary ? (
              <ActivityIndicator color={Colors.brandStrong} />
            ) : (
              <>
                <Icon name="diary" size={20} color={Colors.brandStrong} />
                <Text style={styles.listButtonText}>Ziyaret Ekle</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.listButton,
              styles.lastButton,
              (preparingList || pressed) && styles.listButtonPressed,
            ]}
            onPress={handleOpenListSheet}
            disabled={preparingList}
            accessibilityRole="button"
          >
            {preparingList ? (
              <ActivityIndicator color={Colors.brandStrong} />
            ) : (
              <>
                <Icon name="list" size={20} color={Colors.brandStrong} />
                <Text style={styles.listButtonText}>Listeye Ekle</Text>
              </>
            )}
          </Pressable>

          {/* ── Senin Ziyaretlerin ──
              `user_rankings` ile `diary_entries` arayüzde İLK KEZ buluşuyor:
              ikisi veritabanında `place_id` ile bağlıydı ama "bu mekana kaç kez
              gittin" bilgisi hiçbir ekranda yoktu.

              YERİ BİLİNÇLİ — üç butonun ALTINDA. Butonlar tutarlı bir eylem
              bloğu, arasına bölüm sokmak onu bölerdi; ayrıca "Ziyaret Ekle"nin
              hemen altında olması kaydedilen ziyaretin listeye düştüğünü aynı
              karede gösteriyor.

              SALT OKUNUR: uzun basış yok. Satır `DiaryEntryDetail`'e götürüyor,
              düzenleme/silme profil sekmesindeki menüde kalıyor — bu ekran
              mekanın evi, günlüğün değil.

              BOŞSA HİÇ RENDER EDİLMİYOR. `EmptyState` kullanılmadı: 72px rozet
              ekranın dibinde orantısız olurdu ve keşif zaten hemen üstteki
              "Ziyaret Ekle" butonundan sağlanıyor (liste açıklamasının boşken
              hiç çizilmemesiyle aynı karar). Yükleme durumunda da bir şey
              çizilmiyor — iskelet burada yalnızca layout zıplaması üretirdi. */}
          {visits.length > 0 ? (
            <View style={styles.visitsSection}>
              <SectionHeader
                title="Senin Ziyaretlerin"
                subtitle="Bu mekana yaptığın ziyaretler"
                badge={`${visits.length} ziyaret`}
              />
              {visits.map((visit) => (
                <DiaryRow
                  key={visit.id}
                  visitedAt={visit.visited_at}
                  // `name` ve görsel BİLİNÇLİ OLARAK verilmiyor: mekan zaten bu
                  // ekranın konusu, her satırda tekrarlamak gürültü olurdu.
                  rating={visit.rating}
                  note={visit.note}
                  onPress={() =>
                    navigation.navigate('DiaryEntryDetail', {
                      entryId: visit.id,
                      authorId: visit.user_id,
                      authorUsername: visit.authorUsername,
                      placeId,
                      placeName: place?.name ?? placeName,
                      photoReference: place?.photo_refs?.[0] ?? photoReference,
                      visitedAt: visit.visited_at,
                      rating: visit.rating,
                      note: visit.note,
                    })
                  }
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AddToListSheet
        visible={listSheetVisible}
        placeId={placeId}
        placeName={place?.name ?? placeName}
        onClose={() => setListSheetVisible(false)}
      />

      <DiaryEntrySheet
        visible={diarySheetVisible}
        placeId={placeId}
        placeName={place?.name ?? placeName}
        onClose={() => setDiarySheetVisible(false)}
        onSaved={handleDiarySaved}
      />
    </View>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Hero
  hero: { height: HERO_HEIGHT },
  heroPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvasAlt,
  },
  heroFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvas,
  },

  backBtn: {
    position: 'absolute',
    left: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceTranslucent,
    justifyContent: 'center',
    alignItems: 'center',
    ...Elevation.floating,
  },
  backBtnPressed: { opacity: 0.7 },

  // İçerik
  content: { padding: Spacing.lg },
  banner: { marginBottom: Spacing.md },

  name: {
    ...Type.display,
    color: Colors.textPrimary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxs,
    marginTop: Spacing.xs,
  },
  address: {
    ...Type.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xxs,
    marginTop: Spacing.sm,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: Spacing.xl,
  },

  // Midas kararı: kart ayrımı gölge yerine ince kenarlık + yüzey kontrastı.
  card: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.lg,
  },

  selector: { alignItems: 'center', paddingTop: Spacing.xs },
  selectorValue: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
    marginTop: Spacing.xs,
  },

  photosSection: { marginBottom: Spacing.xl },
  photoTabs: { marginBottom: Spacing.sm },
  photoBanner: { marginBottom: Spacing.sm },

  reviewSection: { marginBottom: Spacing.xl },
  reviewInput: {
    ...Type.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 104,
  },

  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    ...Elevation.brand,
  },
  saveButtonPressed: { opacity: 0.75 },
  saveButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },

  // İkincil eylem: Midas kararı gereği gölge yok, ayrım kenarlık + yüzeyden.
  listButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brandSurface,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  /**
   * Son butonun altında nefes payı. Ziyaret bölümü varsa bu boşluk eylem
   * bloğunu kayıt bölümünden ayırıyor; yoksa sekme çubuğuna kadar olan paya
   * dönüşüyor. Tek değer iki işi de doğru görüyor.
   */
  lastButton: { marginBottom: Spacing['2xl'] },

  /** Ziyaret bölümü ekranın son parçası — altında sekme çubuğu payı. */
  visitsSection: { marginBottom: Spacing['2xl'] },
  listButtonPressed: { backgroundColor: Colors.brandSubtle },
  listButtonText: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },
});
