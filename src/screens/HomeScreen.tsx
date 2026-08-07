import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { UserRanking, Profile, HomeStackParamList } from '../types';
import { photoUrl } from '../lib/places';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import { SkeletonActivityCard, SkeletonCard } from '../components/ui/SkeletonLoader';
import RestaurantCard, { RestaurantCompactCard } from '../components/ui/RestaurantCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';

/** Kart görselleri için istenen genişlik — Places Photo endpoint'ine gider. */
const CARD_PHOTO_WIDTH = 600;

/** İki sütunlu ızgarada kenarlar + aradaki boşluk. */
const GRID_INSET = 52;

interface ActivityFeedItem {
  ranking: UserRanking;
  profile: Profile;
}

/**
 * "En Çok Puanlayanlar" satırının ihtiyaç duyduğu ALANLAR — tam `Profile` DEĞİL.
 *
 * Neden dar tip: sorgu yalnızca üç kolon çekiyor (`id, username, avatar_url`).
 * Burayı `Profile` ilan etmek TİP YALANI olurdu — `Profile` `created_at` gibi
 * alanları zorunlu sayıyor ve onlar hiç gelmiyor.
 *
 * Bu yalan bir kez pahalıya patladı: sorguda `id` HİÇ SEÇİLMEMİŞTİ, `row: any`
 * yüzünden tsc susuyordu ve satırın `disabled={!profile.id}` koşulu sessizce
 * her zaman true oluyordu → satır tıklanamaz ama görünüşte sağlamdı, konsolda
 * da hiçbir iz yoktu. `Pick` ile daraltmak aynı hatayı DERLEME ZAMANINDA
 * yakalıyor.
 */
type LeaderUser = Pick<Profile, 'id' | 'username' | 'avatar_url'>;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  // Modül seviyesinde okunan Dimensions rotasyonda güncellenmiyordu.
  const { width } = useWindowDimensions();
  const { user } = useAuth();

  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [trendingPlaces, setTrendingPlaces] = useState<UserRanking[]>([]);
  const [popularLists, setPopularLists] = useState<
    { profile: LeaderUser; count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  const fetchData = useCallback(async () => {
    setLoading(true);

    // 1. Friend Activity Feed
    // userId yoksa bu sorguyu HİÇ atma: follower_id uuid kolonu ve boş string
    // Postgres'te 22P02 ("invalid input syntax for type uuid") ile 400 döner.
    if (userId) {
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);

      if (followsError) {
        console.error('[HomeScreen] takip listesi okunamadı:', followsError);
      } else if (follows && follows.length > 0) {
        const followingIds = follows.map((f: any) => f.following_id);
        const { data: recentRankings, error: feedError } = await supabase
          .from('user_rankings')
          .select('*, profiles(*)')
          .in('user_id', followingIds)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (feedError) {
          console.error('[HomeScreen] aktivite akışı okunamadı:', feedError);
        } else if (recentRankings) {
          setActivityFeed(
            recentRankings.map((r: any) => ({ ranking: r, profile: r.profiles }))
          );
        }
      } else {
        setActivityFeed([]);
      }
    }

    // 2. Trending Places
    const { data: trending, error: trendingError } = await supabase
      .from('user_rankings')
      .select('*')
      .order('rating', { ascending: false })
      .limit(6);

    if (trendingError) {
      console.error('[HomeScreen] trend mekanlar okunamadı:', trendingError);
    } else if (trending) {
      setTrendingPlaces(trending);
    }

    // 3. Popular Lists
    // `profiles(id, ...)` — `id` ŞART: satırın tıklanabilirliği ve
    // `UserProfile` navigasyonu ona dayanıyor. Bir dönem seçilmiyordu ve satır
    // sessizce tıklanamaz kalıyordu (gerekçe `LeaderUser` tanımında).
    const { data: listCounts, error: listsError } = await supabase
      .from('user_rankings')
      .select('user_id, profiles(id, username, avatar_url)')
      .limit(100);

    if (listsError) {
      console.error('[HomeScreen] popüler listeler okunamadı:', listsError);
    } else if (listCounts) {
      /**
       * Gömülü kaynak tipi: Supabase'in çıkarımı `profiles`'ı dizi sanıyor
       * (üretilmiş tipler olmadan ilişkinin tekil olduğunu bilemiyor), çalışma
       * anında nesne dönüyor. `useFollowList` ile aynı normalizasyon — `any`
       * ile geçiştirmek yerine iki şekli de karşılıyoruz.
       */
      type CountRow = { user_id: string; profiles: LeaderUser | LeaderUser[] | null };
      const rows = listCounts as unknown as CountRow[];

      const counts: Record<string, { profile: LeaderUser; count: number }> = {};
      rows.forEach((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        // Profil satırı yoksa sayacı da kurmuyoruz: adı ve id'si olmayan bir
        // satır ne gösterilebilir ne tıklanabilir.
        if (!profile?.id) return;

        if (!counts[row.user_id]) {
          counts[row.user_id] = { profile, count: 0 };
        }
        counts[row.user_id].count++;
      });

      const sorted = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
      setPopularLists(sorted);
    }

    setLoading(false);
  }, [userId]);

  // userId sonradan çözüldüğünde tekrar çalışsın (eskiden [] idi ve kaçırıyordu),
  // ayrıca sekmeye her dönüşte veri tazelensin.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const goToDetail = (place: UserRanking) =>
    navigation.navigate('RestaurantDetail', {
      placeId: place.place_id,
      placeName: place.restaurant_name,
      photoReference: place.photo_reference ?? undefined,
    });

  /**
   * "En Çok Puanlayanlar" satırından kullanıcı profiline.
   *
   * KENDİ SATIRIN `MyProfile`'A GİDİYOR, `UserProfile`'a değil. Sebep en az
   * sürpriz: kendi profilinde takip butonu, ayarlar ve düzenleme yolları
   * beklenir — `UserProfile` salt okunur bir ekran ve hiçbirini taşımıyor.
   * Sekme atlaması `MapSummarySheet`'in "Tümünü gör"üyle aynı desen.
   *
   * `UserProfile` ayrıca `isSelf` durumunu kendi içinde de karşılıyor (takip
   * butonunu gizliyor) — burası ana yol, o savunma katmanı.
   */
  const handleOpenUser = (profile: LeaderUser | undefined) => {
    if (!profile?.id) return;

    if (profile.id === userId) {
      navigation.getParent()?.navigate('ProfileTab', { screen: 'MyProfile' });
      return;
    }

    navigation.navigate('UserProfile', {
      userId: profile.id,
      username: profile.username,
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.greeting}>Merhaba</Text>
      <Text style={styles.headerTitle}>Ne yemek istersin?</Text>
    </View>
  );

  // ── Skeleton loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.section}>
            <SectionHeader title="Arkadaş Aktiviteleri" style={styles.sectionHeader} />
            <FlatList
              horizontal
              data={[1, 2, 3]}
              keyExtractor={(i) => String(i)}
              contentContainerStyle={styles.horizontalList}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={false}
              renderItem={() => <SkeletonActivityCard />}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Trend Mekanlar" style={styles.sectionHeader} />
            <View style={styles.grid}>
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} style={{ width: (width - GRID_INSET) / 2 }} />
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Ana render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── 1: Arkadaş aktiviteleri ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Arkadaş Aktiviteleri"
            badge={activityFeed.length > 0 ? `${activityFeed.length} yeni` : undefined}
            style={styles.sectionHeader}
          />

          {activityFeed.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="person"
                title="Henüz kimseyi takip etmiyorsun"
                subtitle="Takip ettiğin kişilerin puanlamaları burada görünecek."
              />
            </View>
          ) : (
            <FlatList
              horizontal
              data={activityFeed}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              keyExtractor={(item) => item.ranking.id}
              renderItem={({ item }) => (
                <RestaurantCompactCard
                  name={item.ranking.restaurant_name}
                  rating={item.ranking.rating}
                  photoUrl={photoUrl(item.ranking.photo_reference, CARD_PHOTO_WIDTH)}
                  onPress={() => goToDetail(item.ranking)}
                  style={styles.horizontalCard}
                />
              )}
            />
          )}
        </View>

        {/* ── 2: Trend mekanlar ── */}
        <View style={styles.section}>
          <SectionHeader title="Trend Mekanlar" style={styles.sectionHeader} />

          {trendingPlaces.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="rating"
                title="Henüz yeterli veri yok"
                subtitle="İlk puanlamayı sen yap."
              />
            </View>
          ) : (
            <View style={styles.grid}>
              {trendingPlaces.map((place) => (
                <RestaurantCard
                  key={place.id}
                  name={place.restaurant_name}
                  rating={place.rating}
                  photoUrl={photoUrl(place.photo_reference, CARD_PHOTO_WIDTH)}
                  onPress={() => goToDetail(place)}
                  width={(width - GRID_INSET) / 2}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── 3: En çok puanlayanlar ──
            NOT: bu bölümün başlığı "Popüler Listeler" idi ama gösterdiği veri
            `user_rankings`'ten hesaplanan KULLANICI BAŞINA MEKAN SAYISI — yani
            liste değil, en aktif kullanıcılar. Faz 2 gerçek `lists` tablosunu
            getireceği için isim çakışmasını şimdi çözdük. */}
        <View style={styles.section}>
          <SectionHeader title="En Çok Puanlayanlar" style={styles.sectionHeader} />

          {popularLists.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="person"
                title="Henüz kimse puanlamamış"
                subtitle="İlk puanlayan sen ol."
              />
            </View>
          ) : (
            popularLists.map((item, index) => (
              <Pressable
                key={item.profile?.id ?? index}
                onPress={() => handleOpenUser(item.profile)}
                // Profil satırı eksikse (silinmiş kullanıcı) dokunacak yer yok.
                disabled={!item.profile?.id}
                style={({ pressed }) => [
                  styles.userRow,
                  pressed && styles.userRowPressed,
                ]}
                accessibilityRole="button"
              >
                {/* Sıra numarası ProfileScreen'deki RankRow ile aynı dilde:
                    renkli daire değil, düz metin. */}
                <Text style={styles.userRank}>{index + 1}</Text>

                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarLetter}>
                    {item.profile?.username?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>

                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>
                    @{item.profile?.username ?? 'bilinmeyen'}
                  </Text>
                  <Text style={styles.userCount}>{item.count} mekan</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },

  // Midas kararı: header'ın gölgesi kaldırıldı, ayrım ince kenarlıktan geliyor.
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  greeting: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
  headerTitle: {
    ...Type.title,
    color: Colors.textPrimary,
    marginTop: 2,
  },

  section: {
    marginTop: Spacing.xl,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
  },
  horizontalList: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xxs,
  },
  horizontalCard: {
    marginRight: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  emptyWrap: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
  },

  // En çok puanlayanlar — RankRow ile aynı görsel dil: kart değil satır.
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  // Basılı geri bildirimi zemin rengiyle — satır artık tıklanabilir.
  userRowPressed: { backgroundColor: Colors.canvasAlt },
  userRank: {
    ...Type.body,
    width: 20,
    textAlign: 'right',
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarLetter: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },
  userInfo: { flex: 1 },
  userName: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  userCount: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
