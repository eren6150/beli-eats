import React from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { PendingPhoto } from '../../hooks/usePendingPhotos';
import { PHOTO_KIND_TR } from '../../lib/placePhotos';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Seçilmiş ama henüz yüklenmemiş fotoğrafların yatay şeridi.
 *
 * İki formda birden kullanılıyor: `DiaryEntrySheet` ("Ziyaret Ekle") ve
 * `RestaurantDetailScreen` ("Puanı Kaydet"). Durum ve yükleme mantığı
 * `usePendingPhotos`'ta; burası saf sunum.
 *
 * ⚠️ Tür seçiciyi BU BİLEŞEN ÇİZMİYOR. `PhotoKindSheet` bir `Modal` değil,
 * ekranı kaplayabilmesi için çağıranın KÖKÜNDE durması gerekiyor — bir
 * ScrollView'ın içinde çizilirse kaplayamaz. Rozete dokunma `onEditKind` ile
 * yukarı bildiriliyor, sheet'i ebeveyn açıyor.
 */

/** Şeritteki önizleme karesinin kenarı. */
const THUMB_SIZE = 72;

export interface PendingPhotoStripProps {
  photos: PendingPhoto[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEditKind: (photo: PendingPhoto) => void;
  /** Yükleme sürerken şerit dondurulur — yarıda değişiklik tutarsızlık olurdu. */
  disabled?: boolean;
}

export default function PendingPhotoStrip({
  photos,
  onAdd,
  onRemove,
  onEditKind,
  disabled = false,
}: PendingPhotoStripProps) {
  return (
    <>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Fotoğraflar</Text>
        {photos.length > 0 ? (
          <Text style={styles.counter}>{photos.length}</Text>
        ) : null}
      </View>

      {/* Yatay ScrollView DİKEY olanın içinde: eksenler farklı olduğu için iç
          içe sanallaştırma uyarısı doğmuyor (`FlatList` kullanılsaydı doğardı). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={onAdd}
          disabled={disabled}
          style={({ pressed }) => [
            styles.add,
            (pressed || disabled) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Fotoğraf ekle"
        >
          <Icon name="add" size={26} color={Colors.brandStrong} />
        </Pressable>

        {photos.map((photo) => (
          <View key={photo.id} style={styles.item}>
            <Image source={{ uri: photo.uri }} style={styles.thumb} />

            {/* Kaldırma — onay YOK: henüz hiçbir yere yazılmadı, yıkıcı değil. */}
            <Pressable
              onPress={() => onRemove(photo.id)}
              disabled={disabled}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.remove,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Fotoğrafı çıkar"
            >
              <Icon name="close" size={12} color={Colors.textOnBrand} />
            </Pressable>

            <Pressable
              onPress={() => onEditKind(photo)}
              disabled={disabled}
              style={({ pressed }) => [styles.kind, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Tür: ${PHOTO_KIND_TR[photo.kind]}`}
            >
              <Text style={styles.kindText} numberOfLines={1}>
                {PHOTO_KIND_TR[photo.kind]}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginBottom: Spacing.xs,
  },
  counter: {
    ...Type.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  strip: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    // Son karenin sağında nefes payı — kenara yapışmasın.
    paddingRight: Spacing.sm,
  },
  add: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    backgroundColor: Colors.brandSubtle,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  item: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    backgroundColor: Colors.canvasAlt,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /**
   * Tür rozeti karenin ALT kenarına oturuyor. Ayrı bir satır olarak yazmak
   * şeridin yüksekliğini büyütürdü — `DiaryEntrySheet`'in yerleşimi yazı tipi
   * ölçeğine duyarlı ve her fazladan piksel sabit footer'ı sıkıştırıyor.
   */
  kind: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrimMedium,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    paddingVertical: 2,
    alignItems: 'center',
  },
  kindText: {
    ...Type.micro,
    color: Colors.textOnBrand,
  },
  pressed: { opacity: 0.6 },
});
