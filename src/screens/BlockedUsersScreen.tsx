import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabaseClient';
import { useBlocks } from '../hooks/useBlocks';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import Icon from '../components/ui/Icon';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import { SkeletonListItem } from '../components/ui/SkeletonLoader';

/**
 * Engellediklerin — engeli kaldırmanın TEK yolu.
 *
 * ── NEDEN AYRI EKRAN ────────────────────────────────────────────────────────
 * Engellenen kişinin profili artık "Bulunamadı" gösteriyor, yani engeli
 * oradan kaldırmak İMKÂNSIZ. Bu ekran olmadan engelleme tek yönlü bir kapı
 * olurdu — `EditProfile`'da kullanıcı adının bir dönem kilitli olmasıyla aynı
 * hata: kullanıcı istemediği bir durumda KALICI olarak sıkışırdı.
 *
 * ── YALNIZCA `blockedByMe` ──────────────────────────────────────────────────
 * `useBlocks.blocked` iki yönü birden içeriyor (simetrik gizleme için), ama
 * BENİ engelleyen birinin engelini kaldıramam — migration 024'ün DELETE
 * politikası yalnızca `blocker_id`'ye izin veriyor. O kişileri burada
 * göstermek, tıklanabilir görünüp sessizce 0 satır silen bir buton olurdu:
 * "tıklanabilir görünüp tepki vermemek, hiç tıklanabilir görünmemekten kötü".
 *
 * ── PROFİLLER AYRI SORGUDA ──────────────────────────────────────────────────
 * `useBlocks` yalnızca id kümesi tutuyor (altı okuma yolunun ihtiyacı o) ve
 * her açılışta profilleri de çekmesi gereksiz yük olurdu. Adları bu ekran
 * kendi sorgusuyla alıyor — `RankingReviewSheet`'in "sorgu kullanıcı
 * dokunuşuyla, tek yüzey için" kararının aynısı.
 *
 * 🚩 `profiles` GÖMÜLMÜYOR, DOĞRUDAN sorgulanıyor (`.in('id', ...)`).
 * `blocks` üzerinden gömmek `blocks`'un kendisini ara tablo olarak
 * kullanmak demekti ve `blocker_id`/`blocked_id` ikisi de `profiles`'a
 * gittiği için FK adı yazmak zorunlu olurdu (PGRST201). Düz sorgu o yüzeye
 * hiç girmiyor.
 */
interface BlockedProfile {
  id: string;
  username: string;
  full_name: string | null;
}

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const { blockedByMe, ready, unblockUser } = useBlocks();

  const [profiles, setProfiles] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Hangi satır işleniyor — çift dokunuşu ve karışık spinner'ı önlüyor. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const ids = Array.from(blockedByMe);
  const idsKey = ids.slice().sort().join(',');

  const fetchProfiles = useCallback(async () => {
    if (!ready) return;

    if (ids.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', ids)
      .order('username');

    if (queryError) {
      console.error('[BlockedUsers] profiller okunamadı:', queryError);
      setError('Liste yüklenemedi.');
      setLoading(false);
      return;
    }

    setProfiles((data ?? []) as BlockedProfile[]);
    setLoading(false);
    // `idsKey` bilinçli: `ids` her render'da yeni dizi, bağımlılık olarak
    // sonsuz döngü kurardı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, ready]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  /**
   * Engeli kaldır — onaylı.
   *
   * ⚠️ Metin takibin geri GELMEYECEĞİNİ söylüyor. Kullanıcı "engeli
   * kaldırırsam eskisi gibi olur" bekleyebilir; olmayacak (migration 024).
   * Söylememek, bu projede dört kez pahalıya patlamış isim/davranış
   * uyumsuzluğunun bir örneği daha olurdu.
   */
  const handleUnblock = (target: BlockedProfile) => {
    Alert.alert(
      `@${target.username} için engel kaldırılsın mı?`,
      'Birbirinizin içeriğini yeniden görebilirsiniz. Önceki takipler geri gelmez — dilerseniz yeniden takip edebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engeli kaldır',
          onPress: async () => {
            setBusyId(target.id);
            const { error: unblockError } = await unblockUser(target.id);
            setBusyId(null);
            if (unblockError) Alert.alert('Kaldırılamadı', unblockError);
            // Başarıda ayrıca bir şey yapmıyoruz: `unblockUser` listeyi
            // tazeliyor, bu ekran `blockedByMe` değişince kendini yeniden
            // çiziyor.
          },
        },
      ]
    );
  };

  const renderBody = () => {
    if (!ready || loading) {
      return (
        <View style={styles.pad}>
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonListItem key={i} style={styles.skeleton} />
          ))}
        </View>
      );
    }

    if (error) {
      return <ErrorBanner message={error} onRetry={fetchProfiles} style={styles.banner} />;
    }

    if (profiles.length === 0) {
      return (
        <View style={styles.pad}>
          <EmptyState
            icon="person"
            title="Kimseyi engellemedin"
            subtitle="Bir kullanıcıyı profilinde uzun basarak engelleyebilirsin."
          />
        </View>
      );
    }

    return (
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Icon name="person" size={18} color={Colors.textMuted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.username} numberOfLines={1}>
                @{item.username}
              </Text>
              {!!item.full_name?.trim() && (
                <Text style={styles.fullName} numberOfLines={1}>
                  {item.full_name}
                </Text>
              )}
            </View>
            {/* Satırın kendisi TIKLANAMAZ: engellinin profiline gitmek
                "Bulunamadı" ekranına gitmek olurdu. Tek eylem butonda. */}
            <Pressable
              onPress={() => handleUnblock(item)}
              disabled={busyId === item.id}
              style={({ pressed }) => [
                styles.unblockBtn,
                pressed && styles.unblockBtnPressed,
                busyId === item.id && styles.unblockBtnDisabled,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`@${item.username} için engeli kaldır`}
            >
              <Text style={styles.unblockText}>Kaldır</Text>
            </Pressable>
          </View>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Icon name="back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Engellediklerin</Text>
        {/* Sağ yuva boş: başlık ortada kalsın. */}
        <View style={styles.headerSpacer} />
      </View>

      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  title: { ...Type.heading, color: Colors.textPrimary },
  headerSpacer: { width: 24 },
  pad: { padding: Spacing.lg },
  skeleton: { marginBottom: Spacing.sm },
  banner: { margin: Spacing.lg },
  list: { paddingVertical: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  rowText: { flex: 1 },
  username: { ...Type.bodyStrong, color: Colors.textPrimary },
  fullName: { ...Type.caption, color: Colors.textSecondary },
  unblockBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  unblockBtnPressed: { backgroundColor: Colors.canvas },
  unblockBtnDisabled: { opacity: 0.5 },
  unblockText: { ...Type.captionStrong, color: Colors.textPrimary },
});
