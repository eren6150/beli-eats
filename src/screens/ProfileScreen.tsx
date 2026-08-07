import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
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
import { useRankings } from '../hooks/useRankings';
import { useProfile } from '../hooks/useProfile';
import { useLists, itemCountOf } from '../hooks/useLists';
import { useDiary } from '../hooks/useDiary';
import {
  UserRanking,
  ListWithItemCount,
  DiaryEntry,
  ProfileStackParamList,
  ProfileTabKey,
} from '../types';
import { photoUrl } from '../lib/places';
import { Colors, Spacing } from '../constants/theme';
import { SkeletonListItem } from '../components/ui/SkeletonLoader';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SectionHeader from '../components/ui/SectionHeader';
import SegmentedTabs, { SegmentedTab } from '../components/ui/SegmentedTabs';
import ProfileHeader from '../components/profile/ProfileHeader';
import RankRow from '../components/profile/RankRow';
import ListCard from '../components/lists/ListCard';
import DiaryRow from '../components/diary/DiaryRow';
import DiaryEntrySheet from '../components/diary/DiaryEntrySheet';

// ─── Sekmeler ─────────────────────────────────────────────────────────────────

// `ProfileTabKey` artık `types/index.ts`'te: harita özetindeki "Tümünü gör"
// açılış sekmesini navigasyon parametresi olarak gönderiyor.

/**
 * Üç sekmenin ikisi Faz 2'de doluyor. Kabuğu ŞİMDİ kurmak bilinçli: sonradan
 * eklemek header'ı ve kaydırma kapsayıcısını tekrar elden geçirmek demekti.
 */
const TABS: ReadonlyArray<SegmentedTab<ProfileTabKey>> = [
  { key: 'rankings', label: 'Sıralamam' },
  { key: 'diary', label: 'Günlük' },
  { key: 'lists', label: 'Listeler' },
];

/** Sıralama listesindeki küçük görsel için yeterli genişlik. */
const THUMB_PHOTO_WIDTH = 200;

/**
 * FlatList tek; içeriği aktif sekme belirliyor. Ayrıştırıcılar her tipte
 * YALNIZCA o tipte bulunan bir alana bakıyor: `title` listelerde,
 * `visited_at` günlük girişlerinde var.
 */
type ProfileRow = UserRanking | ListWithItemCount | DiaryEntry;

function isListRow(row: ProfileRow): row is ListWithItemCount {
  return 'title' in row;
}

function isDiaryRow(row: ProfileRow): row is DiaryEntry {
  return 'visited_at' in row;
}

// ─── Ekran ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const route = useRoute<RouteProp<ProfileStackParamList, 'MyProfile'>>();
  const requestedTab = route.params?.tab;
  const { user, signOut } = useAuth();
  const {
    rankings,
    loading: rankingsLoading,
    error: rankingsError,
    fetchRankings,
    moveRanking,
    deleteRanking,
  } = useRankings(user?.id);
  const {
    profile,
    error: profileError,
    fetchProfile,
  } = useProfile(user?.id);
  const {
    lists,
    loading: listsLoading,
    error: listsError,
    fetchLists,
    deleteList,
  } = useLists(user?.id);
  const {
    entries,
    loading: diaryLoading,
    error: diaryError,
    fetchEntries,
    removeEntry,
  } = useDiary(user?.id);

  // Açılış sekmesi parametreden gelebiliyor (harita özetindeki "Tümünü gör").
  const [activeTab, setActiveTab] = useState<ProfileTabKey>(
    requestedTab ?? 'rankings'
  );

  /**
   * Düzenlenen günlük girişi. Sheet ROTA DEĞİL BİLEŞEN olduğu için burada
   * render ediliyor — `RestaurantDetail`'deki ekleme örneğinden bağımsız
   * ikinci bir örnek.
   */
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null);

  /**
   * Parametre bir kerelik İSTEK: uygulandıktan sonra TEMİZLENİYOR.
   * Temizlenmezse kullanıcı sekmeyi elle değiştirip (ör. mekan detayına gidip
   * geri dönerek) ekrana döndüğünde eski istek tekrar uygulanır ve sekme
   * kendiliğinden zıplar.
   */
  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    navigation.setParams({ tab: undefined });
  }, [requestedTab, navigation]);

  // fetchRankings / fetchProfile, userId'ye bağlı useCallback'ler. Bağımlılığa
  // onları vermek iki işi birden görüyor: oturum sonradan çözülünce sorgu
  // tekrarlanıyor (eskiden [] olduğu için kaçırılıyordu) ve sekmeye her
  // dönüşte tazeleniyor.
  useFocusEffect(
    useCallback(() => {
      fetchRankings();
      fetchProfile();
      // Liste oluşturma modal'ı kapandığında da burası tekrar çalışıyor —
      // yeni liste ayrıca tetiklemeye gerek kalmadan görünüyor.
      fetchLists();
      fetchEntries();
    }, [fetchRankings, fetchProfile, fetchLists, fetchEntries])
  );

  const handleCreateList = () => navigation.navigate('ListForm');

  const handleEditList = (list: ListWithItemCount) =>
    navigation.navigate('ListForm', {
      listId: list.id,
      title: list.title,
      description: list.description,
      isOrdered: list.is_ordered,
    });

  /**
   * Başlık, açıklama ve `is_ordered` parametreyle taşınıyor — detay ekranı
   * listenin kendisi için ayrı sorgu atmıyor, yalnızca öğelerini çekiyor.
   */
  const handleOpenList = (list: ListWithItemCount) =>
    navigation.navigate('ListDetail', {
      listId: list.id,
      title: list.title,
      isOrdered: list.is_ordered,
      description: list.description,
    });

  /**
   * Günlük satırı ZİYARET DETAYINA gidiyor (eskiden mekan sayfasına gidiyordu).
   *
   * Kendi günlüğünde de aynı hedef — `UserProfile` ile TUTARLI olsun diye:
   * aynı görünen satırın iki ekranda iki farklı yere gitmesi sürpriz olurdu.
   * Detay ekranı ayrıca kendi girişinin kaç beğeni aldığını gösteren tek yer.
   * Düzenleme/silme YOLU DEĞİŞMEDİ — uzun basış menüsü burada duruyor.
   */
  const handleOpenEntry = (entry: DiaryEntry) =>
    navigation.navigate('DiaryEntryDetail', {
      entryId: entry.id,
      authorId: entry.user_id,
      authorUsername: profile?.username ?? user?.email?.split('@')[0] ?? '',
      placeId: entry.place_id,
      placeName: entry.places?.name ?? 'Mekan',
      photoReference: entry.places?.photo_refs?.[0],
      visitedAt: entry.visited_at,
      rating: entry.rating,
      note: entry.note,
    });

  /**
   * Uzun basış MENÜSÜ — `ListCard` ile aynı desen: menüdeki "Sil" doğrudan
   * silmiyor, onay diyaloğunu açıyor (iki adım).
   *
   * Android `Alert` üç düğmeyi kendi neutral/negative/positive sırasına
   * yerleştiriyor; dizilim iOS'takiyle birebir aynı olmayabilir.
   */
  const handleLongPressEntry = (entry: DiaryEntry) => {
    Alert.alert(entry.places?.name ?? 'Günlük girişi', undefined, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Düzenle', onPress: () => setEditingEntry(entry) },
      { text: 'Sil', style: 'destructive', onPress: () => confirmDeleteEntry(entry) },
    ]);
  };

  const handleEntrySaved = () => {
    setEditingEntry(null);
    // Sheet kendi `useDiary` örneğini kullanmıyor (modül fonksiyonu ile
    // yazıyor), o yüzden listeyi burada tazeliyoruz.
    fetchEntries();
    // Puan değişmiş olabilir — "Sıralamam" sekmesi de bayat kalmasın.
    fetchRankings();
  };

  /**
   * Günlük girişi silme — onaylı.
   *
   * `user_rankings` GERİ ALINMIYOR: puanlı bir giriş silinse de sıralamadaki
   * puan kalıyor (gerekçe `useDiary.removeEntry`'de). Onay metni bunu
   * söylemiyor — kullanıcıya "puanın da silinecek" gibi bir vaat vermemek için
   * metin sade tutuldu.
   */
  const confirmDeleteEntry = (entry: DiaryEntry) => {
    Alert.alert(
      'Girişi sil',
      `${entry.places?.name ?? 'Bu mekan'} ziyaretin günlüğünden silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error: removeError } = await removeEntry(entry.id);
            if (removeError) {
              Alert.alert('Silinemedi', 'Giriş silinemedi. Tekrar dene.');
            }
          },
        },
      ]
    );
  };

  // Sıralama satırı da mekan detayına gidiyor. İki sekmeden birinin tıklanabilir
  // olup diğerinin olmaması aynı ekran içinde tutarsızlık olurdu.
  const handleOpenRanking = (ranking: UserRanking) =>
    navigation.navigate('RestaurantDetail', {
      placeId: ranking.place_id,
      placeName: ranking.restaurant_name,
      photoReference: ranking.photo_reference ?? undefined,
    });

  const handleSettings = () => {
    // Şu an tek ayar çıkış. EditProfile ekranı geldiğinde buraya eklenecek.
    Alert.alert('Ayarlar', undefined, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDelete = (ranking: UserRanking) => {
    Alert.alert('Kaldır', `"${ranking.restaurant_name}" listenden kaldırılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () => deleteRanking(ranking.id),
      },
    ]);
  };

  /**
   * Uzun basış MENÜSÜ — kart üzerinde ayrı düzenle/sil ikonları göstermek her
   * satırı gürültülendirirdi.
   *
   * Android `Alert` en fazla üç düğme alıyor ve onları kendi
   * neutral/negative/positive sırasına yerleştiriyor; dizilim iOS'takiyle
   * birebir aynı olmayabilir — davranış doğru, yalnızca konumlar farklı.
   */
  const handleLongPressList = (list: ListWithItemCount) => {
    Alert.alert(list.title, undefined, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Düzenle', onPress: () => handleEditList(list) },
      { text: 'Sil', style: 'destructive', onPress: () => confirmDeleteList(list) },
    ]);
  };

  /**
   * Silme ayrıca onaylanıyor: yıkıcı ve geri alınamaz, içindeki mekanlar
   * `on delete cascade` ile birlikte gidiyor (migration 005).
   */
  const confirmDeleteList = (list: ListWithItemCount) => {
    const count = itemCountOf(list);
    Alert.alert(
      'Listeyi sil',
      count > 0
        ? `"${list.title}" ve içindeki ${count} mekan silinsin mi? Bu geri alınamaz.`
        : `"${list.title}" silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error: deleteError } = await deleteList(list.id);
            if (deleteError) {
              Alert.alert('Silinemedi', 'Liste silinemedi. Tekrar dene.');
            }
          },
        },
      ]
    );
  };

  // ── Başlık: header + hata şeridi + sekmeler ────────────────────────────────
  //
  // FlatList'in ListHeaderComponent'i olarak veriliyor ki listeyle birlikte
  // kaydırılsın (Instagram davranışı). Sabit tutmak profil bilgisini ekranın
  // yarısında tutar ve listeye az yer bırakırdı.
  const renderHeader = () => (
    <View>
      <ProfileHeader
        // profile henüz gelmediyse e-postanın kullanıcı adı kısmına düşüyoruz;
        // ekran boş görünmesin.
        username={profile?.username ?? user?.email?.split('@')[0] ?? '—'}
        fullName={profile?.full_name}
        bio={profile?.bio}
        avatarUrl={profile?.avatar_url}
        stats={{
          // rankingsCount profile sorgusundan gelir; o gelmeden yerel liste
          // uzunluğu daha doğru bir tahmin.
          rankings: profile?.rankingsCount ?? rankings.length,
          followers: profile?.followersCount ?? 0,
          following: profile?.followingCount ?? 0,
        }}
        onSettings={handleSettings}
        // Sayaçlar Faz 3 / Diff C'de tıklanabilir oldu. `user` ve `profile`
        // henüz gelmediyse verilmiyor: parametresiz açılan bir liste yanlış
        // kullanıcının takipçilerini gösterirdi.
        onPressFollowers={
          user && profile
            ? () =>
                navigation.navigate('FollowersList', {
                  userId: user.id,
                  username: profile.username,
                  initialType: 'followers',
                })
            : undefined
        }
        onPressFollowing={
          user && profile
            ? () =>
                navigation.navigate('FollowersList', {
                  userId: user.id,
                  username: profile.username,
                  initialType: 'following',
                })
            : undefined
        }
        // Profil henüz gelmediyse buton gösterilmiyor: parametresiz açılan bir
        // düzenleme ekranı alanları boş doldurup kullanıcının adını silmesine
        // yol açabilirdi.
        onEdit={
          profile
            ? () =>
                navigation.navigate('EditProfile', {
                  username: profile.username,
                  fullName: profile.full_name ?? null,
                  bio: profile.bio ?? null,
                })
            : undefined
        }
      />

      {profileError && (
        <ErrorBanner
          // Şablonlama YOK — hook kısa ve tam bir cümle döndürüyor.
          message={profileError}
          onRetry={fetchProfile}
          style={styles.banner}
        />
      )}

      <SegmentedTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* "Yeni liste" yalnızca Listeler sekmesinde; boş durumda EmptyState
          kendi butonunu gösterdiği için orada tekrarlanmıyor. */}
      {activeTab === 'lists' && lists.length > 0 && (
        <SectionHeader
          title="Listelerim"
          actionLabel="+ Yeni liste"
          onAction={handleCreateList}
          style={styles.listsHeader}
        />
      )}
    </View>
  );

  // ── Sekme içerikleri ───────────────────────────────────────────────────────

  const renderRankingsEmpty = () => {
    if (rankingsLoading) {
      return (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonListItem key={i} style={styles.skeletonItem} />
          ))}
        </View>
      );
    }

    // Hata boş listeden AYRI gösterilir — "hiç mekan yok" yanılgısı olmasın.
    if (rankingsError) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert"
            title="Liste yüklenemedi"
            subtitle={rankingsError}
            actionLabel="Tekrar dene"
            onAction={fetchRankings}
          />
        </View>
      );
    }

    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="restaurant"
          title="Henüz bir mekan eklemedin"
          subtitle="Ara sekmesinden bir mekan bul ve puanla."
        />
      </View>
    );
  };

  const renderEmptyForTab = () => {
    if (activeTab === 'rankings') return renderRankingsEmpty();

    if (activeTab === 'diary') {
      if (diaryLoading) {
        return (
          <View style={styles.skeletonWrap}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonListItem key={i} style={styles.skeletonItem} />
            ))}
          </View>
        );
      }

      // Hata boş listeden AYRI gösterilir — "hiç giriş yok" yanılgısı olmasın.
      if (diaryError) {
        return (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="alert"
              title="Günlük yüklenemedi"
              subtitle={diaryError}
              actionLabel="Tekrar dene"
              onAction={fetchEntries}
            />
          </View>
        );
      }

      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="diary"
            title="Henüz günlük girişin yok"
            subtitle="Bir mekanın sayfasını açıp 'Ziyaret Ekle' ile tarihini ve notunu kaydedebilirsin."
          />
        </View>
      );
    }

    // ── Listeler ──
    if (listsLoading) {
      return (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3].map((i) => (
            <SkeletonListItem key={i} style={styles.skeletonItem} />
          ))}
        </View>
      );
    }

    if (listsError) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert"
            title="Listeler yüklenemedi"
            subtitle={listsError}
            actionLabel="Tekrar dene"
            onAction={fetchLists}
          />
        </View>
      );
    }

    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="list"
          title="Henüz liste oluşturmadın"
          subtitle="Kendi koleksiyonlarını oluşturup mekanları gruplayabilirsin."
          actionLabel="Liste oluştur"
          onAction={handleCreateList}
        />
      </View>
    );
  };

  const listData: ProfileRow[] =
    activeTab === 'rankings' ? rankings : activeTab === 'lists' ? lists : entries;

  return (
    // Alt kenar sekme çubuğunun sorumluluğunda — burada yalnızca üst inset.
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
            <DiaryRow
              visitedAt={item.visited_at}
              name={item.places?.name ?? 'Bilinmeyen mekan'}
              rating={item.rating}
              note={item.note}
              photoUrl={photoUrl(item.places?.photo_refs?.[0], THUMB_PHOTO_WIDTH)}
              onPress={() => handleOpenEntry(item)}
              onLongPress={() => handleLongPressEntry(item)}
            />
          ) : isListRow(item) ? (
            <ListCard
              title={item.title}
              description={item.description}
              itemCount={itemCountOf(item)}
              isOrdered={item.is_ordered}
              onPress={() => handleOpenList(item)}
              onLongPress={() => handleLongPressList(item)}
              style={styles.listCard}
            />
          ) : (
            <RankRow
              rank={index + 1}
              name={item.restaurant_name}
              rating={item.rating}
              photoUrl={photoUrl(item.photo_reference, THUMB_PHOTO_WIDTH)}
              reviewText={item.review_text}
              onPress={() => handleOpenRanking(item)}
              isFirst={index === 0}
              isLast={index === rankings.length - 1}
              onMoveUp={() => moveRanking(index, 'up')}
              onMoveDown={() => moveRanking(index, 'down')}
              onDelete={() => handleDelete(item)}
            />
          )
        }
      />

      {/* Düzenleme sheet'i — `editingEntry` null iken kapalı. `placeId`/
          `placeName` düzenlemede yalnızca başlık için kullanılıyor; mekan
          değiştirilemiyor. */}
      <DiaryEntrySheet
        visible={editingEntry !== null}
        placeId={editingEntry?.place_id ?? ''}
        placeName={editingEntry?.places?.name ?? 'Mekan'}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={handleEntrySaved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    paddingBottom: Spacing['2xl'],
  },
  banner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  skeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  skeletonItem: {
    marginBottom: Spacing.xs,
  },
  emptyWrap: {
    paddingTop: Spacing.lg,
  },
  listsHeader: {
    paddingHorizontal: Spacing.lg,
  },
  listCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
});
