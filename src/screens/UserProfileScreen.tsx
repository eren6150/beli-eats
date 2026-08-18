import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
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
import { useProfile } from '../hooks/useProfile';
import { useRankings } from '../hooks/useRankings';
import { useLists, itemCountOf } from '../hooks/useLists';
import { useDiary } from '../hooks/useDiary';
import { useFollow } from '../hooks/useFollow';
import {
  UserRanking,
  ListWithItemCount,
  DiaryEntry,
  ProfileTabKey,
  UserProfileParams,
} from '../types';
import { photoUrl, placePhotoUrl } from '../lib/places';
import { Colors, Spacing } from '../constants/theme';
import { SkeletonListItem } from '../components/ui/SkeletonLoader';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SegmentedTabs, { SegmentedTab } from '../components/ui/SegmentedTabs';
import ProfileHeader from '../components/profile/ProfileHeader';
import RankRow from '../components/profile/RankRow';
import RankingReviewSheet from '../components/profile/RankingReviewSheet';
import ListCard from '../components/lists/ListCard';
import DiaryRow from '../components/diary/DiaryRow';

/**
 * BAŞKA BİR KULLANICININ PROFİLİ — Faz 3'ün ilk sosyal ekranı.
 *
 * ── `ProfileScreen`'İN KOPYASI DEĞİL, SALT OKUNUR KARDEŞİ ────────────────────
 * Aynı üç sekmeyi gösteriyor ama YAZMA yollarının HİÇBİRİ yok: sıra değiştirme
 * okları, silme, uzun basış menüleri, "yeni liste", günlük düzenleme sheet'i.
 * Bu yüzden `ProfileScreen`'i "başkasının profili de olabilir" diye
 * genişletmek YERİNE ayrı ekran yazıldı — o dosya zaten 570 satır ve her
 * satırında `if (isOwnProfile)` taşımak onu okunamaz hale getirirdi.
 * `DiaryRow`'un `RankRow`'dan ayrılma gerekçesiyle aynı: eksen değişiyor.
 *
 * Paylaşılan her parça yeniden kullanılıyor (`ProfileHeader`, `RankRow`,
 * `DiaryRow`, `ListCard`, `SegmentedTabs`, `EmptyState`) — yeni tasarım dili
 * YOK.
 *
 * ── GÜNLÜK SEKMESİ VAR, ÇÜNKÜ RLS AÇILDI (migration 015) ─────────────────────
 * `diary_entries`'in SELECT politikası bir dönem sahiplik istiyordu ve bu
 * ekran o yüzden günlüğü gösteremeyecekti. Ürün kararıyla değişti: bu ürünün
 * temel fikri "Letterboxd'un restoranlar için yapması" ve orada diary herkese
 * açık. Yazma politikaları DEĞİŞMEDİ — başkasının girişi görülebiliyor ama
 * değiştirilemiyor/silinemiyor, arayüzde de yolu yok.
 *
 * ── KENDİ PROFİLİNE DÜŞMEK ───────────────────────────────────────────────────
 * Çağıranlar (bugün `HomeScreen`) kendi satırında `MyProfile`'a yönlendiriyor,
 * yani buraya normalde hiç gelinmiyor. Yine de gelinirse ekran çalışıyor:
 * `useFollow.isSelf` true dönüyor ve takip butonu HİÇ render edilmiyor.
 * Savunma katmanı, ana yol değil.
 */

const TABS: ReadonlyArray<SegmentedTab<ProfileTabKey>> = [
  { key: 'rankings', label: 'Sıralama' },
  { key: 'diary', label: 'Günlük' },
  { key: 'lists', label: 'Listeler' },
];

/** `ProfileScreen` ile aynı — küçük görsel için yeterli genişlik. */
const THUMB_PHOTO_WIDTH = 200;

type ProfileRow = UserRanking | ListWithItemCount | DiaryEntry;

function isListRow(row: ProfileRow): row is ListWithItemCount {
  return 'title' in row;
}

function isDiaryRow(row: ProfileRow): row is DiaryEntry {
  return 'visited_at' in row;
}

type RouteType = RouteProp<{ UserProfile: UserProfileParams }, 'UserProfile'>;

export default function UserProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteType>();
  const { userId, username } = route.params;

  const { user } = useAuth();
  const { profile, error: profileError, fetchProfile } = useProfile(userId);
  const {
    rankings,
    loading: rankingsLoading,
    error: rankingsError,
    fetchRankings,
  } = useRankings(userId);
  const {
    lists,
    loading: listsLoading,
    error: listsError,
    fetchLists,
  } = useLists(userId);
  const {
    entries,
    loading: diaryLoading,
    error: diaryError,
    fetchEntries,
  } = useDiary(userId);

  const {
    isFollowing,
    loading: followLoading,
    checking: followChecking,
    error: followError,
    isSelf,
    toggleFollow,
  } = useFollow(user?.id, userId);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>('rankings');
  /** Yorumu okunacak sıralama kaydı — `null` ise sheet kapalı. */
  const [reviewRanking, setReviewRanking] = useState<UserRanking | null>(null);

  /**
   * `ProfileScreen` ile aynı kalıp: `fetchX`'ler `userId`'ye bağlı
   * `useCallback`'ler, bağımlılığa onları vermek hem oturum sonradan
   * çözülünce sorguyu tekrarlıyor hem ekrana her dönüşte tazeliyor.
   */
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchRankings();
      fetchLists();
      fetchEntries();
    }, [fetchProfile, fetchRankings, fetchLists, fetchEntries])
  );

  /**
   * Takip sayısı DEĞİŞTİĞİ İÇİN profil yeniden okunuyor: "Takipçi" sayacı bu
   * ekranda görünüyor ve takip edilince anında artmalı. `toggleFollow` iyimser
   * güncelleme yapıyor ama sayaç sunucudan geliyor.
   */
  const handleToggleFollow = async () => {
    const { error: toggleError } = await toggleFollow();
    if (!toggleError) fetchProfile();
  };

  /**
   * Sıralama satırı artık MEKAN SAYFASINA DEĞİL, o kişinin yorumunu gösteren
   * sheet'e gidiyor.
   *
   * Eskiden mekan sayfası açılıyordu ve bu yanlıştı — günlük satırlarında bir
   * kez düzeltilen hatanın aynısı: kullanıcı **o kişinin ne düşündüğünü** görmek
   * istiyor, ama mekan sayfası HER ZAMAN OTURUM SAHİBİNİN kaydını yüklüyor
   * (`useRankings(user?.id)`). Yani o kişinin yorumunun tam metnine ulaşan
   * hiçbir yol yoktu (CLAUDE.md → BOŞLUK 1).
   *
   * Mekan sayfası kaybolmadı, sheet'in içindeki satırdan bir dokunuş uzakta.
   */
  const handleOpenRanking = (ranking: UserRanking) => setReviewRanking(ranking);

  const handleOpenPlaceFromReview = (ranking: UserRanking) => {
    // Sheet ÖNCE kapanıyor: RN `Modal` uygulamanın görünüm hiyerarşisinin
    // üstünde ayrı bir katman, açık kalırsa hedef ekran onun ARKASINDA kalır
    // (`MapSummarySheet`'in aynı kararı).
    setReviewRanking(null);
    navigation.navigate('RestaurantDetail', {
      placeId: ranking.place_id,
      placeName: ranking.restaurant_name,
      photoReference: ranking.photo_reference ?? undefined,
    });
  };

  /**
   * Günlük satırı artık ZİYARET DETAYINA gidiyor, mekan sayfasına değil.
   *
   * Eskiden mekan sayfası açılıyordu ve bu yanlıştı: kullanıcı o kişinin ne
   * yazdığını okumak isterken kanonik mekan sayfasına düşüyordu. Mekana gitmek
   * hâlâ mümkün — detay ekranının mekan kartından.
   */
  const handleOpenEntry = (entry: DiaryEntry) =>
    navigation.navigate('DiaryEntryDetail', {
      entryId: entry.id,
      authorId: userId,
      authorUsername: profile?.username ?? username,
      placeId: entry.place_id,
      placeName: entry.places?.name ?? 'Mekan',
      photoReference: entry.places?.photo_refs?.[0],
      visitedAt: entry.visited_at,
      rating: entry.rating,
      note: entry.note,
    });

  const handleOpenList = (list: ListWithItemCount) =>
    navigation.navigate('ListDetail', {
      listId: list.id,
      title: list.title,
      isOrdered: list.is_ordered,
      description: list.description,
    });

  // ── Başlık ─────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View>
      <ProfileHeader
        // Parametreden gelen ad ilk karede doğru yazıyor; profil dönünce
        // kanonik değere geçiyor.
        username={profile?.username ?? username}
        fullName={profile?.full_name}
        bio={profile?.bio}
        avatarUrl={profile?.avatar_url}
        stats={{
          rankings: profile?.rankingsCount ?? rankings.length,
          followers: profile?.followersCount ?? 0,
          following: profile?.followingCount ?? 0,
        }}
        title={`@${profile?.username ?? username}`}
        onBack={() => navigation.goBack()}
        onPressFollowers={() =>
          navigation.navigate('FollowersList', {
            userId,
            username: profile?.username ?? username,
            initialType: 'followers',
          })
        }
        onPressFollowing={() =>
          navigation.navigate('FollowersList', {
            userId,
            username: profile?.username ?? username,
            initialType: 'following',
          })
        }
        // Ayarlar YOK: başkasının profilinde ayarlanacak bir şey yok.
        // Takip butonu yalnızca başkasının profilinde.
        follow={
          isSelf
            ? undefined
            : {
                isFollowing,
                busy: followLoading || followChecking,
                onToggle: handleToggleFollow,
              }
        }
      />

      {profileError && (
        <ErrorBanner
          message={profileError}
          onRetry={fetchProfile}
          style={styles.banner}
        />
      )}

      {/* Takip hatası profil hatasından AYRI: biri "profil okunamadı", diğeri
          "işlem tamamlanamadı" — aynı şerit ikisini birden anlatamaz. */}
      {followError && <ErrorBanner message={followError} style={styles.banner} />}

      <SegmentedTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
    </View>
  );

  // ── Boş / yükleniyor / hata durumları ──────────────────────────────────────
  //
  // Hata boş listeden AYRI gösteriliyor: "hiç mekan yok" ile "sorgu patladı"
  // aynı ekrana düşerse yalan olur. Bu ayrım projede birden çok yerde var.

  const renderSkeleton = (count: number) => (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListItem key={i} style={styles.skeletonItem} />
      ))}
    </View>
  );

  const renderError = (title: string, message: string, onRetry: () => void) => (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon="alert"
        title={title}
        subtitle={message}
        actionLabel="Tekrar dene"
        onAction={onRetry}
      />
    </View>
  );

  const displayName = profile?.full_name?.trim() || `@${profile?.username ?? username}`;

  const renderEmptyForTab = () => {
    if (activeTab === 'rankings') {
      if (rankingsLoading) return renderSkeleton(5);
      if (rankingsError)
        return renderError('Sıralama yüklenemedi', rankingsError, fetchRankings);
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="restaurant"
            title="Henüz mekan puanlamamış"
            subtitle={`${displayName} bir mekan puanladığında burada görünecek.`}
          />
        </View>
      );
    }

    if (activeTab === 'diary') {
      if (diaryLoading) return renderSkeleton(4);
      if (diaryError) return renderError('Günlük yüklenemedi', diaryError, fetchEntries);
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="diary"
            title="Henüz günlük girişi yok"
            subtitle={`${displayName} bir ziyaret kaydettiğinde burada görünecek.`}
          />
        </View>
      );
    }

    if (listsLoading) return renderSkeleton(3);
    if (listsError) return renderError('Listeler yüklenemedi', listsError, fetchLists);
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="list"
          title="Henüz liste yok"
          subtitle={`${displayName} bir liste oluşturduğunda burada görünecek.`}
        />
      </View>
    );
  };

  const listData: ProfileRow[] =
    activeTab === 'rankings' ? rankings : activeTab === 'lists' ? lists : entries;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyForTab}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) =>
          isDiaryRow(item) ? (
            // `onLongPress` YOK: düzenle/sil menüsü yalnızca kendi günlüğünde.
            <DiaryRow
              visitedAt={item.visited_at}
              name={item.places?.name ?? 'Bilinmeyen mekan'}
              rating={item.rating}
              note={item.note}
              photoUrl={placePhotoUrl(
                      item.places?.photo_base_urls?.[0],
                      THUMB_PHOTO_WIDTH
                    )}
              onPress={() => handleOpenEntry(item)}
            />
          ) : isListRow(item) ? (
            // `onLongPress` YOK: düzenle/sil başkasının listesinde olmaz.
            <ListCard
              title={item.title}
              description={item.description}
              itemCount={itemCountOf(item)}
              isOrdered={item.is_ordered}
              onPress={() => handleOpenList(item)}
              style={styles.listCard}
            />
          ) : (
            // Ok tuşları ve çöp kutusu YOK — `RankRow`'un opsiyonel parçaları
            // verilmediğinde hiç render edilmiyor, boş yer de tutmuyor.
            <RankRow
              rank={index + 1}
              name={item.restaurant_name}
              rating={item.rating}
              photoUrl={photoUrl(item.photo_reference, THUMB_PHOTO_WIDTH)}
              reviewText={item.review_text}
              onPress={() => handleOpenRanking(item)}
            />
          )
        }
      />

      <RankingReviewSheet
        ranking={reviewRanking}
        onClose={() => setReviewRanking(null)}
        onPressPlace={handleOpenPlaceFromReview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingBottom: Spacing['2xl'] },
  banner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  skeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  skeletonItem: { marginBottom: Spacing.xs },
  emptyWrap: { paddingTop: Spacing.lg },
  listCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
});
