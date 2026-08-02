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
import { Place, RestaurantDetailStackParamList } from '../types';
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

// Ekran üç stack'te birden kayıtlı; route tipi bu yüzden tek bir stack'in
// param listesine değil, paylaşılan tipe bağlı.
type RouteType = RouteProp<RestaurantDetailStackParamList, 'RestaurantDetail'>;

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

// ─── Ekran ────────────────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation();
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
    }, [fetchRankings])
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
   */
  const handleDiarySaved = () => {
    setDiarySheetVisible(false);
    fetchRankings();
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

          {/* ── Yorum ── */}
          <View style={styles.reviewSection}>
            <SectionHeader title="Yorumun" subtitle="İsteğe bağlı" />
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
  /** Son butonun altında sekme çubuğuna kadar nefes payı. */
  lastButton: { marginBottom: Spacing['2xl'] },
  listButtonPressed: { backgroundColor: Colors.brandSubtle },
  listButtonText: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },
});
