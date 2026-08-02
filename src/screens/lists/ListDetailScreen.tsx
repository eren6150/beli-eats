import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  BackHandler,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useListItems } from '../../hooks/useListItems';
import { ListItem, ListDetailStackParamList } from '../../types';
import { photoUrl } from '../../lib/places';
import { Colors, Spacing, Type } from '../../constants/theme';
import { SkeletonListItem } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import RankRow from '../../components/profile/RankRow';
import MoveToListSheet from '../../components/lists/MoveToListSheet';

/**
 * Tek bir listenin içeriği.
 *
 * Başlık ve `isOrdered` route parametresinden geliyor, ayrı sorgu YOK
 * (gerekçesi `ListDetailParams`'ta yazılı). Ekran yalnızca öğeleri çekiyor.
 *
 * SIRALAMA sürükle-bırak DEĞİL, yukarı/aşağı ok: sürükle-bırak yeni bir
 * bağımlılık demekti, oklar hem "Sıralamam" sekmesiyle aynı dil hem
 * `reorder_list_items()` RPC'sine birebir oturuyor.
 *
 * İKİ STACK'TE kayıtlı (Profil, Harita) — bu yüzden route/navigation tipi tek
 * bir stack'in param listesine değil `ListDetailStackParamList`'e bağlı.
 */

type RouteType = RouteProp<ListDetailStackParamList, 'ListDetail'>;

/** Satırdaki küçük görsel için yeterli genişlik. */
const THUMB_PHOTO_WIDTH = 200;

export default function ListDetailScreen() {
  const route = useRoute<RouteType>();
  const navigation =
    useNavigation<NativeStackNavigationProp<ListDetailStackParamList>>();
  const { listId, title, isOrdered, description } = route.params;

  const {
    items,
    loading,
    error,
    fetchItems,
    removeItem,
    removeItems,
    moveItems,
    reorderItems,
  } = useListItems(listId);

  /** Hedef liste seçici — seçim modundaki "taşı" aksiyonundan açılıyor. */
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);

  /**
   * Çoklu seçim — AYRI BİR `selectionMode` bayrağı YOK, seçim modu
   * `selectedIds.length > 0` demek. Android galerisinin davranışı bu: son
   * öğenin seçimi kalkınca mod kendiliğinden kapanır, "boş seçim modunda
   * takılı kalma" durumu hiç doğmaz.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionMode = selectedIds.length > 0;

  const toggleSelect = (itemId: string) =>
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );

  const clearSelection = () => setSelectedIds([]);

  // Ekrana her dönüşte tazeleniyor: mekan detayından "Listeye Ekle" ile bu
  // listeye eklenmiş olabilir.
  useFocusEffect(
    useCallback(() => {
      fetchItems();
    }, [fetchItems])
  );

  /**
   * Seçim modunda geri tuşu EKRANDAN DEĞİL MODDAN çıkarır.
   *
   * `useFocusEffect` içinde: abonelik ekran odakta değilken yaşarsa başka bir
   * ekranın geri tuşunu yutar. Mod kapalıyken hiç abone olunmuyor, yani normal
   * geri davranışı (listeden çıkış) olduğu gibi kalıyor.
   */
  useFocusEffect(
    useCallback(() => {
      if (!selectionMode) return;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        clearSelection();
        return true; // olayı TÜKET — ekran kapanmasın
      });

      return () => subscription.remove();
    }, [selectionMode])
  );

  const nameOf = (item: ListItem) => item.places?.name ?? 'Bilinmeyen mekan';

  const handleOpenPlace = (item: ListItem) => {
    navigation.navigate('RestaurantDetail', {
      placeId: item.place_id,
      placeName: nameOf(item),
      photoReference: item.places?.photo_refs?.[0],
    });
  };

  /**
   * Komşu iki öğenin yerini değiştirip TÜM sıralı id dizisini gönderiyor.
   * `position` istemcide hesaplanmıyor — RPC `with ordinality` ile sunucuda
   * yazıyor. Hook iyimser güncelleme yapıp hata halinde geri alıyor.
   */
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;

    const orderedIds = items.map((i) => i.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];

    const { error: reorderError } = await reorderItems(orderedIds);
    if (reorderError) {
      Alert.alert('Sıralanamadı', reorderError.message);
    }
  };

  /**
   * Taşıma/kopyalama ONAYSIZ: yıkıcı değil, mekanlar kaybolmuyor.
   * Hedef seçimi zaten bilinçli bir adım.
   */
  const handleMoveTo = (targetListId: string, removeFromSource: boolean) =>
    moveItems(targetListId, selectedIds, removeFromSource);

  const handleMoved = () => {
    setMoveSheetVisible(false);
    clearSelection();
  };

  /** Toplu çıkarma — tek sorgu (`removeItems`), onaylı. */
  const handleBulkRemove = () => {
    const count = selectedIds.length;

    Alert.alert(
      'Listeden çıkar',
      count === 1
        ? 'Seçili mekan bu listeden çıkarılsın mı?'
        : `Seçili ${count} mekan bu listeden çıkarılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: async () => {
            const { error: removeError } = await removeItems(selectedIds);
            if (removeError) {
              // Seçim KORUNUYOR: kullanıcı tekrar deneyebilsin.
              Alert.alert('Çıkarılamadı', 'Mekanlar çıkarılamadı. Tekrar dene.');
              return;
            }
            clearSelection();
          },
        },
      ]
    );
  };

  const handleRemove = (item: ListItem) => {
    Alert.alert('Listeden çıkar', `"${nameOf(item)}" bu listeden çıkarılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkar',
        style: 'destructive',
        onPress: async () => {
          const { error: removeError } = await removeItem(item.id);
          if (removeError) {
            Alert.alert('Çıkarılamadı', 'Mekan listeden çıkarılamadı. Tekrar dene.');
          }
        },
      },
    ]);
  };

  // ── Başlık şeridi ──────────────────────────────────────────────────────────
  // Native header açılmıyor: uygulamadaki hiçbir ekran header göstermiyor.

  const countLabel =
    items.length === 0 ? 'Henüz mekan yok' : `${items.length} mekan`;

  /**
   * Açıklama bloğu — şeridin İÇİNDE değil, listenin başlığı olarak.
   *
   * Şeride koymak uzun bir açıklamada ekranın yarısını KALICI olarak yerdi;
   * burada içerikle birlikte kayıp gidiyor (`ProfileScreen`'de `ProfileHeader`
   * aynı sebeple `ListHeaderComponent`).
   *
   * KISALTMA YOK: alan DB'de 500 karakterle sınırlı (~8-10 satır) ve blok
   * zaten kaydırılabilir. "Devamını gör" için `onTextLayout` ile satır ölçmek
   * + bir state daha gerekirdi — sınırlı bir metin için orantısız.
   *
   * Tipografi `Type.body` + `textStrong`: `caption` "küçük gri not" demek
   * olurdu, oysa istenen vurgu Letterboxd'daki gibi okunur bir gövde metni.
   * Zemin/sol kenarlık YOK — Midas kararı gereği ağırlık boyut ve boşluktan
   * geliyor, dekoratif renkten değil.
   */
  const renderHeader = () =>
    description?.trim() ? (
      <View style={styles.descriptionBlock}>
        <Text style={styles.description}>{description.trim()}</Text>
      </View>
    ) : null;

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonListItem key={i} style={styles.skeletonItem} />
          ))}
        </View>
      );
    }

    // Hata boş listeden AYRI gösterilir — "liste boş" yanılgısı olmasın.
    if (error) {
      return (
        <EmptyState
          icon="alert"
          title="Liste yüklenemedi"
          subtitle={error}
          actionLabel="Tekrar dene"
          onAction={fetchItems}
        />
      );
    }

    return (
      <EmptyState
        icon="restaurant"
        title="Bu liste boş"
        subtitle="Bir mekanın sayfasını açıp 'Listeye Ekle' ile buraya ekleyebilirsin."
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Şerit MODA GÖRE içerik değiştiriyor — ayrı bir aksiyon çubuğu
          eklemek ekranda ikinci bir üst bant demekti. */}
      <View style={styles.header}>
        <Pressable
          onPress={selectionMode ? clearSelection : () => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={selectionMode ? 'Seçimi iptal et' : 'Geri'}
        >
          <Icon
            name={selectionMode ? 'close' : 'back'}
            size={24}
            color={Colors.textPrimary}
          />
        </Pressable>

        {selectionMode ? (
          <>
            <View style={styles.headerText}>
              <Text style={styles.title}>{selectedIds.length} seçili</Text>
            </View>
            <Pressable
              onPress={() => setMoveSheetVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Seçili mekanları başka listeye taşı"
            >
              {/* Taşıma yıkıcı DEĞİL — nötr renkte, çöp kutusu kırmızı kalıyor. */}
              <Icon name="list" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={handleBulkRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Seçili mekanları listeden çıkar"
            >
              <Icon name="trash" size={22} color={Colors.danger} />
            </Pressable>
          </>
        ) : (
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle}>
              {isOrdered ? `${countLabel} · Sıralı liste` : countLabel}
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <RankRow
            // Sırasız listede numara ve ok tuşları HİÇ çizilmiyor — `is_ordered`
            // arayüz sözleşmesi tam olarak bu (DB tarafında bir farkı yok).
            rank={isOrdered ? index + 1 : undefined}
            name={nameOf(item)}
            subtitle={item.places?.formatted_address}
            photoUrl={photoUrl(item.places?.photo_refs?.[0], THUMB_PHOTO_WIDTH)}
            // Modda dokunmak SEÇER, mekan detayına gitmez.
            onPress={
              selectionMode ? () => toggleSelect(item.id) : () => handleOpenPlace(item)
            }
            onLongPress={() => toggleSelect(item.id)}
            selectionMode={selectionMode}
            selected={selectedIds.includes(item.id)}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            onMoveUp={isOrdered ? () => handleMove(index, 'up') : undefined}
            onMoveDown={isOrdered ? () => handleMove(index, 'down') : undefined}
            onDelete={() => handleRemove(item)}
          />
        )}
      />

      <MoveToListSheet
        visible={moveSheetVisible}
        sourceListId={listId}
        itemCount={selectedIds.length}
        onClose={() => setMoveSheetVisible(false)}
        onMove={handleMoveTo}
        onMoved={handleMoved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    // Midas: header gölgesi yok, ayrım ince çizgiden.
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
  headerAction: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  title: {
    ...Type.title,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Type.caption,
    color: Colors.textSecondary,
  },

  descriptionBlock: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    // Ayrım satırların kendi çizgisiyle aynı dilde.
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  description: {
    ...Type.body,
    color: Colors.textStrong,
  },

  content: { paddingBottom: Spacing['2xl'] },
  skeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  skeletonItem: { marginBottom: Spacing.xs },
});
