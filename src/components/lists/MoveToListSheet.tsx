import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { List, ListWithItemCount } from '../../types';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';
import ListPicker from './ListPicker';

/**
 * "Seçili mekanları taşı" seçicisi.
 *
 * `AddToListSheet` ile aynı kabuk ve aynı `ListPicker`; fark yazma mantığı ve
 * iki davranış:
 *
 *  1. KAYNAK LİSTE GİZLİ (`excludeListId`). Kendi üstüne taşımayı RPC zaten
 *     reddediyor (migration 007) ama seçilemeyecek bir satırı göstermek
 *     kullanıcıyı hataya davet etmek olurdu.
 *  2. BAŞARIDA SHEET KAPANIYOR — `AddToListSheet`'in tersine. Ekleme
 *     tekrarlanabilir (bir mekan birden çok listeye girer), taşıma tek
 *     seferliktir: mekanlar kaynak listeden çıktı, seçilecek bir şey kalmadı.
 *     Kopyalama modunda da aynı davranış korunuyor — anahtarın SADECE kaldırma
 *     eksenini değiştirmesi, sheet'in yaşam döngüsünü de değiştirmesinden
 *     tahmin edilebilir.
 *
 * Taşımanın kendisi tek bir RPC çağrısı (`useListItems.moveItems`) — ekleme ve
 * silme aynı transaction'da, ya hepsi ya hiçbiri.
 *
 * KOPYALAMA: "Kaynak listeden de kaldır" anahtarı kapatılınca RPC'nin DELETE
 * adımı atlanıyor (migration 008) ve mekan iki listede birden kalıyor. Başlık
 * da buna göre değişiyor — kaldırmayan bir ekranda "taşı" yazmak, bu projede
 * üç kez pahalıya patlamış olan isim/davranış uyumsuzluğunun dördüncüsü olurdu.
 */

export interface MoveToListSheetProps {
  visible: boolean;
  /** Kaynak liste — seçenekler arasında gösterilmiyor. */
  sourceListId: string;
  /** Kaç mekan taşınıyor; başlığın altında gösteriliyor. */
  itemCount: number;
  onClose: () => void;
  /** Hedef seçildi — çağıran RPC'yi çalıştırıp sonucu döndürüyor. */
  onMove: (
    targetListId: string,
    removeFromSource: boolean
  ) => Promise<{ error: Error | null }>;
  /** Taşıma/kopyalama başarılı — çağıran seçimi temizleyip sheet'i kapatıyor. */
  onMoved: () => void;
}

/** Liste alanının ekranı kaplamaması için tavan. */
const LIST_MAX_HEIGHT_RATIO = 0.45;

export default function MoveToListSheet({
  visible,
  sourceListId,
  itemCount,
  onClose,
  onMove,
  onMoved,
}: MoveToListSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [busyListId, setBusyListId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Varsayılan AÇIK — bugünkü (taşıma) davranışıyla uyumlu. */
  const [removeFromSource, setRemoveFromSource] = useState(true);

  useEffect(() => {
    if (visible) return;
    setBusyListId(null);
    setActionError(null);
    // Anahtar da sıfırlanıyor: bir sonraki açılışta sürpriz olmasın.
    setRemoveFromSource(true);
  }, [visible]);

  const moveTo = async (targetListId: string) => {
    if (busyListId) return;

    setBusyListId(targetListId);
    setActionError(null);

    const { error } = await onMove(targetListId, removeFromSource);

    setBusyListId(null);

    if (error) {
      // Sheet AÇIK kalıyor: kullanıcı başka bir hedef deneyebilsin.
      setActionError(error.message);
      return;
    }

    onMoved();
  };

  const handleSelect = (list: ListWithItemCount) => moveTo(list.id);

  /** Kısayoldan oluşturulan yeni listeye doğrudan taşınıyor. */
  const handleCreated = (created: List) => moveTo(created.id);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <View style={styles.handleBar} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>
                  {removeFromSource ? 'Başka listeye taşı' : 'Başka listeye kopyala'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {itemCount === 1 ? '1 mekan' : `${itemCount} mekan`}
                </Text>
              </View>
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

            {/* Kaldırma anahtarı — "Sıralı liste" switch'iyle aynı token'lar. */}
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Kaynak listeden de kaldır</Text>
                <Text style={styles.switchHint}>
                  Kapatırsan mekanlar bu listede de kalır.
                </Text>
              </View>
              <Switch
                value={removeFromSource}
                onValueChange={setRemoveFromSource}
                disabled={busyListId !== null}
                trackColor={{ false: Colors.borderStrong, true: Colors.brandBorder }}
                thumbColor={removeFromSource ? Colors.brand : Colors.canvasAlt}
              />
            </View>

            <ListPicker
              visible={visible}
              busyListId={busyListId}
              // `doneListIds` verilmiyor: taşıma başarılı olunca sheet kapanıyor,
              // gösterilecek "tamamlandı" durumu oluşmuyor.
              excludeListId={sourceListId}
              onSelect={handleSelect}
              onCreated={handleCreated}
              error={actionError}
              maxHeight={windowHeight * LIST_MAX_HEIGHT_RATIO}
            />
          </View>
        </KeyboardAvoidingView>
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
    paddingHorizontal: Spacing.lg,
    ...Elevation.sheet,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.borderMuted,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
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
  pressed: { opacity: 0.6 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
    // Seçiciden ince bir çizgiyle ayrılıyor — satırların diliyle aynı.
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: Spacing.sm,
  },
  switchText: { flex: 1, gap: Spacing.xxs },
  switchLabel: {
    ...Type.captionStrong,
    color: Colors.textStrong,
  },
  switchHint: {
    ...Type.micro,
    color: Colors.textMuted,
  },
});
