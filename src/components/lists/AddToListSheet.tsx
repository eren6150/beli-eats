import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addPlaceToList } from '../../hooks/useListItems';
import { List, ListWithItemCount } from '../../types';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';
import ListPicker from './ListPicker';

/**
 * "Listeye ekle" seçicisi.
 *
 * NEDEN ROTA DEĞİL BİLEŞEN: `RestaurantDetail` üç stack'te birden kayıtlı
 * (Ana Sayfa / Ara / Harita) ve hiçbiri `ProfileStack` değil. Seçiciyi ekran
 * yapmak onu üç param listesine + üç stack'e eklemek demekti; içindeki "yeni
 * liste" kısayolu için `ListForm`'u da üç yere daha eklemek gerekirdi.
 * Seçici bir hedef değil, açık ekranın bağlamı üzerinde geçici bir seçim.
 *
 * ÖN KOŞUL: `placeId`'nin `places` cache satırı OLMALI (FK). Çağıran ekran
 * seçiciyi açmadan ÖNCE `resolvePlace` çağırıyor — burada tekrar denemiyoruz,
 * çünkü o noktada gösterilecek doğru şey seçici değil hata mesajı.
 *
 * Sheet EKLEDİKTEN SONRA KAPANMIYOR: bir mekan birden çok listeye girebilir
 * ("Kahvaltı" + "Ankara"). Eklenen liste işaretleniyor, kapatma kullanıcıda.
 *
 * Liste satırları ve "yeni liste" kısayolu `ListPicker`'da — `MoveToListSheet`
 * ile paylaşılıyor. Bu dosyada kalan: modal kabuğu, başlık ve EKLEME mantığı.
 */

export interface AddToListSheetProps {
  visible: boolean;
  placeId: string;
  /** Yalnızca başlıkta gösteriliyor — hangi mekanı eklediği belirsiz kalmasın. */
  placeName: string;
  onClose: () => void;
}

/** Liste alanının ekranı kaplamaması için tavan. */
const LIST_MAX_HEIGHT_RATIO = 0.45;

export default function AddToListSheet({
  visible,
  placeId,
  placeName,
  onClose,
}: AddToListSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  /** Bu oturumda eklenen (veya zaten ekli olduğu anlaşılan) liste id'leri. */
  const [addedListIds, setAddedListIds] = useState<string[]>([]);
  const [busyListId, setBusyListId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Kapanışta durum sıfırlanıyor: ikinci açılışta önceki onay işaretleri ve
  // hata şeridi kalmamalı.
  useEffect(() => {
    if (visible) return;
    setAddedListIds([]);
    setBusyListId(null);
    setActionError(null);
  }, [visible]);

  const addTo = async (listId: string) => {
    setBusyListId(listId);
    setActionError(null);

    const { error } = await addPlaceToList(listId, placeId);

    setBusyListId(null);

    if (error) {
      // "Bu mekan listede zaten var" bir başarısızlık değil, bir bilgi:
      // mekan O LİSTEDE. Satırı "Eklendi" durumuna geçirmek doğru cevabı
      // veriyor — HATA ŞERİDİ GÖSTERİLMİYOR, çünkü yeşil "Eklendi" etiketiyle
      // kırmızı bir hata şeridi aynı anda çelişkili görünür. Ağ/FK hataları
      // şeritte kalmaya devam ediyor.
      if (error.message === 'Bu mekan listede zaten var') {
        setAddedListIds((prev) => [...prev, listId]);
        return;
      }

      setActionError(error.message);
      return;
    }

    setAddedListIds((prev) => [...prev, listId]);
  };

  const handleSelect = (list: ListWithItemCount) => {
    if (busyListId || addedListIds.includes(list.id)) return;
    addTo(list.id);
  };

  /** Kısayoldan oluşturulan listeye mekan doğrudan ekleniyor. */
  const handleCreated = (created: List) => addTo(created.id);

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
        {/* Karartma — dokunuşla kapanıyor */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          // Android'de klavye pencereyi zaten yeniden boyutluyor (adjustResize);
          // orada 'padding' vermek sheet'i iki kez yukarı iter.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <View style={styles.handleBar} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Listeye ekle</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {placeName}
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

            <ListPicker
              visible={visible}
              busyListId={busyListId}
              doneListIds={addedListIds}
              doneLabel="Eklendi"
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
});
