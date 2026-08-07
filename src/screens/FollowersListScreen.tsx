import React, { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet } from 'react-native';
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
import { useFollowList, FollowUser } from '../hooks/useFollow';
import { FollowersListParams } from '../types';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import Icon from '../components/ui/Icon';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonListItem } from '../components/ui/SkeletonLoader';
import SegmentedTabs, { SegmentedTab } from '../components/ui/SegmentedTabs';

/**
 * TAKİPÇİLER / TAKİP EDİLENLER — Faz 3 / Diff C.
 *
 * ── TEK EKRAN, İKİ SEKME ─────────────────────────────────────────────────────
 * İki ayrı ekran yazmak %90'ı kopya iki dosya olurdu (`ListFormScreen`'in
 * "tek ekran iki mod" kararıyla aynı aile). Sekme sayesinde kullanıcı geri
 * gidip tekrar girmeden iki liste arasında geçebiliyor.
 *
 * `useFollowList(userId, type)` — `type` bağımlılıkta olduğu için sekme
 * değişince sorgu kendiliğinden tekrarlanıyor; ayrı bir tetikleyici yok.
 *
 * ── SATIRDA TAKİP BUTONU YOK — bilinçli ──────────────────────────────────────
 * Instagram'da her satırda "Takip et" var. Burada olmamasının sebebi maliyet:
 * N satır için N ayrı "bunu takip ediyor muyum" sorusu demek. Toplu bir sorgu
 * yazılabilir ama bugün gerçek bir gerekçe yok — satıra dokununca zaten
 * profiline gidiliyor ve buton orada.
 *
 * ── SATIR BİLEŞENİ DIŞARI ÇIKARILMADI ────────────────────────────────────────
 * `HomeScreen`'in leaderboard satırı benziyor ama aynı değil (sıra numarası +
 * mekan sayısı taşıyor). Projenin eşiği "ikiden fazla yerde aynı eşleşme";
 * üçüncü bir kullanıcı listesi doğduğunda (ör. beğenenler) çıkarılır.
 */

type RouteType = RouteProp<
  { FollowersList: FollowersListParams },
  'FollowersList'
>;

type FollowTab = 'followers' | 'following';

const TABS: ReadonlyArray<SegmentedTab<FollowTab>> = [
  { key: 'followers', label: 'Takipçiler' },
  { key: 'following', label: 'Takip Edilenler' },
];

export default function FollowersListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteType>();
  const { userId, username, initialType } = route.params;

  const { user } = useAuth();
  const isSelf = user?.id === userId;

  /**
   * Parametre yalnızca AÇILIŞ sekmesini belirliyor. `ProfileScreen`'deki gibi
   * `setParams` ile temizlemeye gerek yok: bu ekran her seferinde push edilip
   * geri dönüşte unmount oluyor, yani bayat bir istek geride kalmıyor.
   */
  const [activeTab, setActiveTab] = useState<FollowTab>(initialType);

  const { users, loading, error, fetchList } = useFollowList(userId, activeTab);

  /**
   * Odakta tazeleme: kullanıcı bir profile gidip takibi bırakıp geri
   * dönebiliyor; liste bayat kalmamalı.
   */
  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  const openUser = (item: FollowUser) => {
    // Kendine dokununca `UserProfile` yerine kendi sekmene — `HomeScreen`'in
    // leaderboard kararıyla aynı, en az sürpriz.
    if (item.id === user?.id) {
      navigation.getParent()?.navigate('ProfileTab', { screen: 'MyProfile' });
      return;
    }
    navigation.navigate('UserProfile', { userId: item.id, username: item.username });
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonListItem key={i} style={styles.skeletonItem} />
          ))}
        </View>
      );
    }

    // Hata boş listeden AYRI: "kimse takip etmiyor" ile "sorgu patladı" aynı
    // ekrana düşerse yalan olur. `useFollowList` bu ayrımı Diff A'da kazandı.
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert"
            title="Liste yüklenemedi"
            subtitle={error}
            actionLabel="Tekrar dene"
            onAction={fetchList}
          />
        </View>
      );
    }

    const who = isSelf ? 'Seni' : `@${username} kullanıcısını`;
    const whoFollows = isSelf ? 'Henüz kimseyi takip etmiyorsun' : `@${username} henüz kimseyi takip etmiyor`;

    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="person"
          title={
            activeTab === 'followers'
              ? `${who} henüz kimse takip etmiyor`
              : whoFollows
          }
          subtitle={
            activeTab === 'followers'
              ? 'Puanladıkça ve günlük tuttukça takipçiler gelecek.'
              : 'Ana Sayfa’daki listeden birine dokunup profilinden takip edebilirsin.'
          }
        />
      </View>
    );
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
        <Text style={styles.barTitle} numberOfLines={1}>
          @{username}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <SegmentedTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const primary = item.full_name?.trim() || `@${item.username}`;
          const initial = primary.replace('@', '').charAt(0).toUpperCase() || '?';

          return (
            <Pressable
              onPress={() => openUser(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{initial}</Text>
                </View>
              )}

              <View style={styles.info}>
                <Text style={styles.primaryName} numberOfLines={1}>
                  {primary}
                </Text>
                {/* İkinci satır yalnızca ad varsa: yoksa `@kullanici` zaten
                    üstte, aynı metni iki kez yazmıyoruz. */}
                {item.full_name?.trim() ? (
                  <Text style={styles.username} numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
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

  content: { paddingBottom: Spacing['2xl'] },

  // Kart değil SATIR — ayrım tek alt çizgiden geliyor (Midas kararı, `RankRow`
  // ile aynı dil).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  rowPressed: { backgroundColor: Colors.canvasAlt },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    ...Type.heading,
    color: Colors.brandStrong,
  },
  info: { flex: 1 },
  primaryName: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  username: {
    ...Type.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },

  skeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  skeletonItem: { marginBottom: Spacing.xs },
  emptyWrap: { paddingTop: Spacing.xl },
});
