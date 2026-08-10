import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacePhoto } from '../../types';
import {
  reportPhoto,
  PHOTO_REPORT_REASON_TR,
  type PhotoReportReason,
} from '../../lib/placePhotos';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Fotoğraf şikayet seçicisi (migration 018).
 *
 * ── NEDEN SHEET, `Alert` DEĞİL ───────────────────────────────────────────────
 * Dört kategori + iptal = beş seçenek. **Android'de RN `Alert` en fazla ÜÇ
 * buton destekliyor**; fazlası düzgün çizilmiyor. Sheet zaten projenin
 * "N seçenekten birini seç" idiomu (`AddToListSheet`, `MoveToListSheet`,
 * `RankingReviewSheet`).
 *
 * ── ONAY ADIMI: AYRI DİYALOG YOK, İKİ KASITLI ADIM VAR ───────────────────────
 * Şikayet GERİ ÇEKİLEMİYOR (migration 018'de DELETE politikası yok), yani
 * yanlış dokunuşa karşı koruma gerekiyordu. Çözüm üçüncü bir onay diyaloğu
 * DEĞİL: eyleme ulaşmak zaten **uzun basış** gerektiriyor (kaza eseri
 * olmayan bir jest) ve ardından kategori seçmek **ikinci kasıtlı adım**.
 * Üstüne bir onay daha koymak, yıkıcı olmayan bir işlemde sürtünme olurdu —
 * projenin "taşıma onaysız, silme onaylı" ayrımıyla aynı çizgi. Geri
 * alınamazlık başlığın altında YAZIYOR.
 *
 * ── AYRI `visible` BAYRAĞI YOK ───────────────────────────────────────────────
 * Tek kaynak `photo: PlacePhoto | null` — `RankingReviewSheet`'in aynı kararı:
 * iki state'i senkron tutmak "açık ama verisi yok" ara durumunu mümkün kılardı.
 *
 * ── "ZATEN BİLDİRDİN" AYRI BİR SORGUYLA ÖĞRENİLMİYOR ─────────────────────────
 * `reportPhoto` `23505`'i `alreadyReported`'a çeviriyor. Izgarada kare başına
 * "bildirdim mi" sorgusu atmak N+1 demekti.
 */

export interface ReportPhotoSheetProps {
  /** Şikayet edilecek fotoğraf. `null` → sheet kapalı. */
  photo: PlacePhoto | null;
  /** Şikayet eden — RLS `auth.uid() = user_id` istiyor. */
  currentUserId: string | undefined;
  onClose: () => void;
  /** Sonuç mesajı çağırana bırakılıyor (ızgara `Alert` gösteriyor). */
  onDone: (message: string) => void;
}

const REASONS: PhotoReportReason[] = [
  'inappropriate',
  'irrelevant',
  'spam',
  'other',
];

export default function ReportPhotoSheet({
  photo,
  currentUserId,
  onClose,
  onDone,
}: ReportPhotoSheetProps) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<PhotoReportReason | null>(null);

  const handleSelect = async (reason: PhotoReportReason) => {
    if (!photo || !currentUserId || busy) return;

    setBusy(reason);
    const { error, alreadyReported } = await reportPhoto(
      photo.id,
      currentUserId,
      reason
    );
    setBusy(null);
    onClose();

    if (error) {
      onDone(error.message);
      return;
    }

    onDone(
      alreadyReported
        ? 'Bu fotoğrafı zaten bildirdin.'
        : 'Şikayetin alındı. Teşekkürler.'
    );
  };

  return (
    <Modal
      visible={photo !== null}
      transparent
      animationType="slide"
      // Android donanım/jest geri tuşu — Modal'da bu olmadan kapanmaz.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Fotoğrafı bildir</Text>
              <Text style={styles.subtitle}>
                Sebebini seç. Bildirimin geri alınamaz.
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

          {/* Sanal liste YOK (`ListPicker`'ın dersi): dört sabit satır için
              `FlatList` sıfır fayda, karşılığında "bayat hücre" hata sınıfı. */}
          {REASONS.map((reason) => (
            <Pressable
              key={reason}
              onPress={() => handleSelect(reason)}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.rowLabel}>
                {PHOTO_REPORT_REASON_TR[reason]}
              </Text>
              {busy === reason ? (
                <ActivityIndicator size="small" color={Colors.brand} />
              ) : (
                <Icon name="forward" size={18} color={Colors.textMuted} />
              )}
            </Pressable>
          ))}
        </View>
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
    ...Elevation.sheet,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.borderMuted,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerText: { flex: 1, gap: Spacing.xxs },
  title: {
    ...Type.heading,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
  pressed: { opacity: 0.6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  rowPressed: { backgroundColor: Colors.canvas },
  rowLabel: {
    ...Type.body,
    color: Colors.textPrimary,
    flex: 1,
  },
});
