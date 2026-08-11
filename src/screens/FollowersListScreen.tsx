import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
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
 *
 * ── KAYDIRMALI GEÇİŞ (2026-08-11) ────────────────────────────────────────────
 * Sekmeler arası sağa/sola kaydırma `react-native-pager-view` ile eklendi.
 *
 * Bu ekran bu iş için PROJEDEKİ EN UCUZ yerdi: başlık şeridi ve `SegmentedTabs`
 * zaten listenin DIŞINDA, sabit duruyor — yani yalnızca alttaki listeyi
 * sayfalamak yetti. `ProfileScreen`'de aynı şey pahalı, çünkü orada
 * `ProfileHeader` `ListHeaderComponent` olarak veriliyor ve içerikle birlikte
 * kayıyor (bilinçli Instagram davranışı); yan yana üç bağımsız liste kurmak
 * "çöken başlık" problemini doğuruyor ve o da `collapsible-tab-view` demek —
 * onun Reanimated 4 desteği doğrulanamadı (bkz. Bilinen Açık İşler).
 *
 * ── HER SAYFA KENDİ VERİSİNİ ÇEKİYOR ─────────────────────────────────────────
 * Eskiden tek `useFollowList` vardı ve `activeTab` değişince sorgu
 * tekrarlanıyordu. Kaydırmada bu YETMEZ: parmak sayfayı sürüklerken komşu
 * sayfa çoktan görünür oluyor, verisi o an gelmeye başlarsa kullanıcı boş bir
 * sayfayı sürüklemiş oluyor. Bu yüzden iki `FollowPage` kendi hook örneğini
 * kuruyor. Bedeli bir ek sorgu; karşılığı kaydırmanın dolu hissetmesi.
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

interface FollowPageProps {
  userId: string;
  /** Bu SAYFANIN türü — ekranın aktif sekmesi değil. */
  type: FollowTab;
  isSelf: boolean;
  username: string;
  onOpenUser: (item: FollowUser) => void;
}

/**
 * Tek bir sekmenin içeriği. Kendi `useFollowList` örneğini ve kendi odak
 * tazelemesini taşıyor — gerekçesi dosyanın başındaki "her sayfa kendi
 * verisini çekiyor" notunda.
 *
 * ⚠️ Boş durum metinleri `activeTab`'e DEĞİL `type`'a bakıyor. Aktif sekmeye
 * baksalardı, kullanıcı kaydırırken komşu sayfada bir an YANLIŞ metin
 * görünürdü ("kimse takip etmiyor" yerine "kimseyi takip etmiyor").
 */
function FollowPage({
  userId,
  type,
  isSelf,
  username,
  onOpenUser,
}: FollowPageProps) {
  const { users, loading, error, fetchList } = useFollowList(userId, type);

  /**
   * Odakta tazeleme: kullanıcı bir profile gidip takibi bırakıp geri
   * dönebiliyor; liste bayat kalmamalı.
   */
  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

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
            type === 'followers'
              ? `${who} henüz kimse takip etmiyor`
              : whoFollows
          }
          subtitle={
            type === 'followers'
              ? 'Puanladıkça ve günlük tuttukça takipçiler gelecek.'
              : 'Ana Sayfa’daki listeden birine dokunup profilinden takip edebilirsin.'
          }
        />
      </View>
    );
  };

  return (
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
            onPress={() => onOpenUser(item)}
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
  );
}

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
  const pagerRef = useRef<PagerView>(null);

  const initialPage = Math.max(
    0,
    TABS.findIndex((t) => t.key === initialType)
  );

  /**
   * ── İKİ YÖNLÜ SENKRON, AMA TEK DOĞRULUK KAYNAĞI PAGER ────────────────────
   * Sekmeye dokunmak sayfayı kaydırıyor; kaydırma da sekmeyi güncelliyor.
   * `setPage` sonrası `onPageSelected` yine ateşleniyor ve `setActiveTab`'i
   * AYNI değerle çağırıyor — döngü değil, etkisiz bir tekrar.
   *
   * `setPage` (animasyonlu) tercih edildi, `setPageWithoutAnimation` değil:
   * dokunma ile kaydırma aynı hareketi üretmezse iki giriş yolu birbirine
   * yabancı hissettirir.
   */
  const handleTabChange = (key: FollowTab) => {
    setActiveTab(key);
    pagerRef.current?.setPage(TABS.findIndex((t) => t.key === key));
  };

  const openUser = (item: FollowUser) => {
    // Kendine dokununca `UserProfile` yerine kendi sekmene — `HomeScreen`'in
    // leaderboard kararıyla aynı, en az sürpriz.
    if (item.id === user?.id) {
      navigation.getParent()?.navigate('ProfileTab', { screen: 'MyProfile' });
      return;
    }
    navigation.navigate('UserProfile', { userId: item.id, username: item.username });
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

      <SegmentedTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialPage}
        onPageSelected={(e) => {
          const next = TABS[e.nativeEvent.position];
          if (next) setActiveTab(next.key);
        }}
      >
        {/* PagerView'ın çocukları DOĞRUDAN View olmalı ve `key` taşımalı —
            native taraf sayfaları bu sırayla eşliyor. */}
        {TABS.map((t) => (
          <View key={t.key} style={styles.page}>
            <FollowPage
              userId={userId}
              type={t.key}
              isSelf={isSelf}
              username={username}
              onOpenUser={openUser}
            />
          </View>
        ))}
      </PagerView>
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

  // `flex: 1` PagerView'da ŞART: native sayfalayıcı kendi yüksekliğini
  // içerikten türetmiyor, ölçüsü verilmezse hiç görünmüyor.
  pager: { flex: 1 },
  page: { flex: 1 },

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
