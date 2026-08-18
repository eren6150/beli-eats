import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useRankings } from '../../hooks/useRankings';
import { useLists, itemCountOf } from '../../hooks/useLists';
import { UserRanking, ListWithItemCount } from '../../types';
import { placePhotoUrl } from '../../lib/places';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import SectionHeader from '../ui/SectionHeader';
import Icon from '../ui/Icon';
import RankRow from '../profile/RankRow';
import ListCard from '../lists/ListCard';

/**
 * Harita üstündeki bilgi kartına dokununca açılan KOMPAKT ÖZET.
 *
 * Amaç haritadan hızlı bir bakış — profilin kopyası değil. İki bölüm var ve
 * ikisi de sınırlı: en fazla `MAX_RANKINGS` mekan, `MAX_LISTS` liste; gerisi
 * "Tümünü gör" ile profile gidiyor.
 *
 * YENİ TASARIM DİLİ YOK: satırlar `RankRow`, kartlar `ListCard` (sıkı hali).
 * `RankRow` bu bağlamda ok tuşu ve çöp kutusu ALMIYOR — ikisi de opsiyonel
 * olduğu için o sütunlar hiç render edilmiyor (Diff B2'de tam bunun için
 * genişletilmişti).
 *
 * MEKANİK `AddToListSheet` ile aynı: RN `Modal` + `animationType="slide"`.
 * `RestaurantBottomSheet`'in reanimated + pan gesture kurulumu KOPYALANMADI —
 * o bileşenin kapanış animasyonu yalnızca sürüklemede oynuyor (bilinen açık
 * iş), aynı kusuru ikinci bir yere taşımanın anlamı yok.
 *
 * VERİ: `MapScreen`'in `rankedPlaces` state'i KULLANILMIYOR. O liste haritaya
 * çizilebilen (koordinatı olan) satırlarla sınırlı ve `RankedPlace` tipinde;
 * özet için doğru küme `useRankings`'in kendisi.
 */

export interface MapSummarySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Bir mekana gidilecek — `MapScreen` kendi stack'inde push ediyor. */
  onPressRanking: (ranking: UserRanking) => void;
  /** Bir listeye gidilecek. */
  onPressList: (list: ListWithItemCount) => void;
  /** "Tümünü gör" — profil sekmesine, istenen sekme açık olarak. */
  onSeeAllRankings: () => void;
  onSeeAllLists: () => void;
}

/** Özet sınırları — sheet bir listeye dönüşmesin. */
const MAX_RANKINGS = 5;
const MAX_LISTS = 4;

/** Sheet ekranın bu oranından uzun olamaz. */
const MAX_SHEET_RATIO = 0.8;

/** Satırdaki küçük görsel için yeterli genişlik. */
const THUMB_PHOTO_WIDTH = 200;

export default function MapSummarySheet({
  visible,
  onClose,
  onPressRanking,
  onPressList,
  onSeeAllRankings,
  onSeeAllLists,
}: MapSummarySheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();

  const {
    rankings,
    loading: rankingsLoading,
    error: rankingsError,
    fetchRankings,
  } = useRankings(user?.id);
  const {
    lists,
    loading: listsLoading,
    error: listsError,
    fetchLists,
  } = useLists(user?.id);

  // Her açılışta tazeleniyor: kullanıcı arada puan vermiş veya liste
  // oluşturmuş olabilir.
  useEffect(() => {
    if (!visible) return;
    fetchRankings();
    fetchLists();
  }, [visible, fetchRankings, fetchLists]);

  const topRankings = rankings.slice(0, MAX_RANKINGS);
  const topLists = lists.slice(0, MAX_LISTS);

  const loading = rankingsLoading || listsLoading;

  return (
    <Modal
      visible={visible}
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
            { maxHeight: windowHeight * MAX_SHEET_RATIO, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <Text style={styles.title}>Özet</Text>
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

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Puanladıklarım ── */}
            <SectionHeader
              title="Puanladıklarım"
              actionLabel={rankings.length > 0 ? 'Tümünü gör' : undefined}
              actionIsLink
              onAction={rankings.length > 0 ? onSeeAllRankings : undefined}
              style={styles.sectionHeader}
            />

            {loading && rankings.length === 0 ? (
              <ActivityIndicator color={Colors.brand} style={styles.loader} />
            ) : rankingsError && rankings.length === 0 ? (
              // Hata boş listeden AYRI gösterilir — "hiç mekan yok" yanılgısı
              // olmasın. `useRankings` ham `error.message` yazıyor (bilinen
              // teknik borç), o yüzden ekrana KENDİ kısa metnimiz çıkıyor.
              <Text style={styles.error}>Puanların yüklenemedi.</Text>
            ) : topRankings.length === 0 ? (
              // `EmptyState` KULLANILMIYOR: 72px rozet + geniş padding iki
              // bölümlü bir özete sığmıyor. Tek satır soluk metin yeterli.
              <Text style={styles.empty}>Henüz mekan puanlamadın.</Text>
            ) : (
              topRankings.map((ranking, index) => (
                <RankRow
                  key={ranking.id}
                  rank={index + 1}
                  name={ranking.restaurant_name}
                  rating={ranking.rating}
                  photoUrl={placePhotoUrl(
                    ranking.places?.photo_base_urls?.[0],
                    THUMB_PHOTO_WIDTH
                  )}
                  onPress={() => onPressRanking(ranking)}
                  // Sıra kontrolü ve silme YOK — özet salt okunur.
                />
              ))
            )}

            <View style={styles.divider} />

            {/* ── Listelerim ── */}
            <SectionHeader
              title="Listelerim"
              actionLabel={lists.length > 0 ? 'Tümünü gör' : undefined}
              actionIsLink
              onAction={lists.length > 0 ? onSeeAllLists : undefined}
              style={styles.sectionHeader}
            />

            {loading && lists.length === 0 ? (
              <ActivityIndicator color={Colors.brand} style={styles.loader} />
            ) : listsError && lists.length === 0 ? (
              <Text style={styles.error}>{listsError}</Text>
            ) : topLists.length === 0 ? (
              <Text style={styles.empty}>Henüz liste oluşturmadın.</Text>
            ) : (
              <View style={styles.listsWrap}>
                {topLists.map((list) => (
                  <ListCard
                    key={list.id}
                    title={list.title}
                    description={list.description}
                    itemCount={itemCountOf(list)}
                    isOrdered={list.is_ordered}
                    onPress={() => onPressList(list)}
                    // Uzun basışla silme YOK — özet ekranında yıkıcı eylem olmaz.
                    compact
                  />
                ))}
              </View>
            )}
          </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  title: {
    ...Type.title,
    color: Colors.textPrimary,
  },
  pressed: { opacity: 0.6 },

  sectionHeader: { paddingHorizontal: Spacing.lg },
  loader: { marginVertical: Spacing.lg },
  empty: {
    ...Type.caption,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  error: {
    ...Type.caption,
    color: Colors.danger,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },

  listsWrap: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginTop: Spacing.md,
  },
});
