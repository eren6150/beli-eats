import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useAuth } from '../../hooks/useAuth';
import { useLists, itemCountOf } from '../../hooks/useLists';
import { List, ListWithItemCount } from '../../types';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import ErrorBanner from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import Chip from '../ui/Chip';
import Icon from '../ui/Icon';

/**
 * Liste seçici — kullanıcının listeleri + tek satırlık "yeni liste" kısayolu.
 *
 * SHEET DEĞİL, sheet'in İÇİNE konan blok. İki sheet kullanıyor:
 *   `AddToListSheet`  — bir mekanı listeye ekler
 *   `MoveToListSheet` — seçili mekanları başka listeye taşır
 *
 * NEDEN AYRIŞTIRILDI: `AddToListSheet` cihazda doğrulanmış bir akış. Onu
 * genelleştirip (tek `placeId` → `placeIds[]` + mod) çalışan bir sözleşmeyi
 * bozmaktansa, ORTAK olan parçayı dışarı almak daha güvenli. Modal kabuğu,
 * başlık ve yazma mantığı her sheet'te kendi yerinde kalıyor.
 *
 * Veri burada çekiliyor (`useLists`): iki sheet de aynı listeyi istiyor ve
 * seçicinin dışında hiçbir yerde kullanılmıyor.
 */

export interface ListPickerProps {
  /** Sheet açık mı — açılışta liste tazeleniyor, kapanışta yerel durum sıfırlanıyor. */
  visible: boolean;
  /** Şu an yazma yapılan liste — satır bazında spinner. */
  busyListId?: string | null;
  /** Tamamlanmış satırlar (yeşil zemin + animasyonlu etiket). */
  doneListIds?: string[];
  /** Tamamlanmış satırın etiketi. */
  doneLabel?: string;
  /** Gizlenecek liste — taşımada kaynak liste hedef olarak görünmemeli. */
  excludeListId?: string;
  onSelect: (list: ListWithItemCount) => void;
  /**
   * "Yeni liste" kısayolu BAŞARILI olduğunda çağrılıyor. Seçici listeyi
   * oluşturur, devamını (mekanı ekleme/taşıma) çağıran yapar.
   */
  onCreated: (list: List) => void | Promise<void>;
  /** Çağıranın hata metni — seçicinin kendi hatalarıyla aynı şeritte gösteriliyor. */
  error?: string | null;
  /** Liste alanının tavanı; sheet'in ekranı kaplamaması için. */
  maxHeight: number;
}

/** `lists.title` DB CHECK'i ile aynı (migration 005). */
const TITLE_MAX = 100;

/** Tamamlanan satırdaki vurgunun sönme süresi. */
const HIGHLIGHT_FADE_MS = 900;

const CHIP_SPRING = { damping: 12, stiffness: 220 };

// ─── Satır ────────────────────────────────────────────────────────────────────

/**
 * Tek satır — kendi animasyon durumunu taşıdığı için ayrı bileşen (hook'lar
 * `renderItem` fonksiyonunun içinde çağrılamaz).
 *
 * GERİ BİLDİRİM NEDEN BÖYLE: önce tamamlanan satırda yalnızca gri `add` glifi
 * yeşil `check` glifiyle DEĞİŞİYORDU — aynı boyut, aynı konum, aynı alan.
 * Periferik görüş şekli değil hareketi ve alanı yakalıyor, o yüzden işlem
 * cihazda fark edilmiyordu. Şimdi üç şey birden değişiyor: glif yerine METİNLİ
 * chip (alan ~3 katı), chip yaylanarak BELİRİYOR (hareket) ve satır zemini
 * kısa bir vurgudan kalıcı marka zeminine iniyor.
 */
function ListPickerRow({
  list,
  done,
  doneLabel,
  busy,
  onPress,
}: {
  list: ListWithItemCount;
  done: boolean;
  doneLabel: string;
  busy: boolean;
  onPress: () => void;
}) {
  /** 1 → vurgu (brandSubtle), 0 → sönmüş. Kalıcı zemin bunun ALTINDA duruyor. */
  const highlight = useSharedValue(0);
  const chipScale = useSharedValue(done ? 1 : 0.8);

  useEffect(() => {
    if (done) {
      // Vurgu tam parlaklıkta başlayıp sönüyor; altındaki kalıcı `rowDone`
      // zemini kalıyor. Renk interpolasyonu yerine ÜST ÜSTE İKİ KATMAN:
      // iki farklı taban rengi arasında interpolate etmek, satırın tamamlanmış
      // olup olmamasına göre iki ayrı animasyon tanımı gerektirirdi.
      highlight.value = 1;
      highlight.value = withTiming(0, { duration: HIGHLIGHT_FADE_MS });
      chipScale.value = withSpring(1, CHIP_SPRING);
    } else {
      highlight.value = 0;
      chipScale.value = 0.8;
    }
  }, [done, highlight, chipScale]);

  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chipScale.value }],
  }));

  const countLabel =
    itemCountOf(list) === 0 ? 'Henüz mekan yok' : `${itemCountOf(list)} mekan`;

  return (
    <Pressable
      onPress={onPress}
      disabled={done || busy}
      style={({ pressed }) => [
        styles.row,
        done && styles.rowDone,
        pressed && !done && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: done }}
      accessibilityLabel={
        done ? `${list.title}, ${doneLabel}` : `${list.title} listesini seç`
      }
    >
      {/* Sönen vurgu katmanı — içeriğin ARKASINDA, dokunuşu yemesin. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.rowHighlight, highlightStyle]}
      />

      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {list.title}
        </Text>
        <Text style={styles.rowCount}>{countLabel}</Text>
      </View>

      {busy ? (
        <ActivityIndicator size="small" color={Colors.brand} />
      ) : done ? (
        <Animated.View style={chipStyle}>
          <Chip label={doneLabel} variant="brand" icon="check" />
        </Animated.View>
      ) : (
        <Icon name="add" size={20} color={Colors.textMuted} />
      )}
    </Pressable>
  );
}

// ─── Seçici ───────────────────────────────────────────────────────────────────

export default function ListPicker({
  visible,
  busyListId = null,
  doneListIds = [],
  doneLabel = 'Eklendi',
  excludeListId,
  onSelect,
  onCreated,
  error,
  maxHeight,
}: ListPickerProps) {
  const { user } = useAuth();
  const { lists, loading, error: listsError, fetchLists, createList } = useLists(
    user?.id
  );

  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Her açılışta tazeleniyor: kullanıcı arada profilinden liste oluşturmuş
  // olabilir. Kapanışta yerel durum sıfırlanıyor — ikinci açılışta önceki
  // metin ve hata kalmamalı.
  useEffect(() => {
    if (visible) {
      fetchLists();
    } else {
      setNewTitle('');
      setCreateError(null);
    }
  }, [visible, fetchLists]);

  /** Kaynak liste hedef olarak görünmemeli (taşıma). */
  const selectable = excludeListId
    ? lists.filter((l) => l.id !== excludeListId)
    : lists;

  /**
   * Tek satırlık liste kısayolu — YALNIZCA başlık, `is_ordered: false`.
   * Tam form (açıklama + sıralı seçeneği) `ListFormScreen`'de kalıyor; buradaki
   * amaç akışı bölmemek. Hiç listesi olmayan kullanıcı mekana bakarken
   * "önce profiline git" duvarına çarpmasın.
   */
  const handleCreate = async () => {
    const title = newTitle.trim();
    if (title.length === 0 || creating) return;

    setCreating(true);
    setCreateError(null);

    const { data: created, error: createErr } = await createList({
      title,
      isOrdered: false,
    });

    if (createErr || !created) {
      setCreating(false);
      // Yerel doğrulama hatası okunabilir Türkçe; Postgres hatası değil.
      setCreateError(
        createErr instanceof Error && !('code' in createErr)
          ? createErr.message
          : 'Liste oluşturulamadı. Tekrar dene.'
      );
      return;
    }

    await onCreated(created);

    setCreating(false);
    setNewTitle('');
  };

  const canCreate = newTitle.trim().length > 0 && !creating;
  const banner = error ?? createError ?? listsError;

  return (
    <>
      {/* Hata yeniden denenebilir değil ("zaten var" gibi) — `onRetry` yok. */}
      {banner ? <ErrorBanner message={banner} style={styles.banner} /> : null}

      {loading && lists.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : selectable.length === 0 ? (
        <EmptyState
          icon="list"
          // Listesi var ama hepsi elendiyse (tek listesi varsa ve kaynak oysa)
          // "hiç listen yok" demek yanlış olurdu.
          title={lists.length === 0 ? 'Henüz listen yok' : 'Başka listen yok'}
          subtitle="Aşağıdan bir liste oluştur, mekanlar doğrudan içine gitsin."
        />
      ) : (
        // FLATLIST DEĞİL, SCROLLVIEW — bilinçli.
        //
        // Burada bir `FlatList` vardı ve satırlar `doneListIds` / `busyListId`
        // değişince YENİDEN ÇİZİLMİYORDU: ekleme Supabase'e yazılıyor, hatasız
        // dönüyor, `setAddedListIds` çalışıyor ama satırda ne spinner ne
        // "Eklendi" beliriyordu (cihazda beş noktalı log zinciriyle
        // doğrulandı — yazma sağlam, yeniden çizim yok).
        //
        // Sebep sınıfı: `FlatList` bir `PureComponent` ve hücrelerini
        // memoize ediyor; `renderItem` `data` DIŞINDAKİ state'e bağlı olduğunda
        // hücreler bayat kalabiliyor (RN'in kendi dokümanı bu durum için
        // `extraData` öneriyor).
        //
        // `extraData` eklemek yerine sanal listeyi tamamen kaldırdım: burada
        // veri KULLANICININ KENDİ LİSTELERİ, yani birkaç düzine satır.
        // Sanallaştırma sıfır fayda sağlıyor, karşılığında bütün bir bayat
        // hücre hata sınıfı getiriyordu. Düz çocuklar ebeveynle birlikte her
        // zaman yeniden çiziliyor — ayarlanacak bir memoization kalmıyor.
        <ScrollView
          style={{ maxHeight }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {selectable.map((item) => (
            <ListPickerRow
              key={item.id}
              list={item}
              done={doneListIds.includes(item.id)}
              doneLabel={doneLabel}
              busy={busyListId === item.id}
              onPress={() => onSelect(item)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Tek satırlık yeni liste kısayolu ── */}
      <View style={styles.createRow}>
        <TextInput
          // `...Type.body` SPREAD EDİLMİYOR: `lineHeight` bir TextInput'a
          // verildiğinde Android'de metni dikeyde kırpabiliyor.
          style={styles.createInput}
          placeholder="Yeni liste adı"
          placeholderTextColor={Colors.textMuted}
          value={newTitle}
          onChangeText={setNewTitle}
          maxLength={TITLE_MAX}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          style={({ pressed }) => [
            styles.createButton,
            !canCreate && styles.createButtonDisabled,
            pressed && canCreate && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Yeni liste oluştur"
        >
          {creating ? (
            <ActivityIndicator size="small" color={Colors.textOnBrand} />
          ) : (
            <Text style={styles.createButtonText}>Oluştur</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: Spacing.sm },
  pressed: { opacity: 0.6 },

  loadingWrap: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },

  // Midas: satır ayrımı gölge/kart değil tek çizgi (RankRow ile aynı dil).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    // Vurgu katmanı `absoluteFill` — satırın dışına taşmasın.
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: Colors.canvas },
  /** Tamamlanmış satırın KALICI zemini. */
  rowDone: { backgroundColor: Colors.brandSurface },
  /** İşlem anındaki, sönen vurgu. */
  rowHighlight: { backgroundColor: Colors.brandSubtle },
  rowText: { flex: 1 },
  rowTitle: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  rowCount: {
    ...Type.micro,
    color: Colors.textMuted,
  },

  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  createInput: {
    flex: 1,
    fontSize: Type.body.fontSize,
    fontFamily: Type.body.fontFamily,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  createButton: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 84,
    alignItems: 'center',
  },
  createButtonDisabled: { backgroundColor: Colors.borderStrong },
  createButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
});
