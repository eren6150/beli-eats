import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { logDiaryEntry, updateDiaryEntry } from '../../hooks/useDiary';
import { DiaryEntry } from '../../types';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import { toDateString, fromDateString, formatVisitDate } from '../../lib/date';
import ErrorBanner from '../ui/ErrorBanner';
import StarRating from '../ui/StarRating';
import Icon from '../ui/Icon';

/**
 * "Ziyaret ekle" formu — mekan detayından açılan modal.
 *
 * NEDEN AYRI EKRAN DEĞİL: giriş HER ZAMAN bir mekana bağlı, mekansız ziyaret
 * diye bir şey yok. Ayrı bir ekran mekan seçtirmek için `SearchScreen`'in bir
 * kopyasını gerektirirdi. Mekanik `AddToListSheet` ile aynı (RN `Modal` +
 * slide) — cihazda iki kez doğrulanmış kalıp.
 *
 * ÖN KOŞUL: `placeId`'nin `places` cache satırı OLMALI (FK). Çağıran ekran
 * sheet'i açmadan ÖNCE `ensurePlaceCached()` çağırıyor.
 *
 * PUAN OPSİYONEL — diary'nin ana kararı. Puansız kayıt yalnızca günlükte
 * görünür, "Puanladıklarım" sıralamasına girmez; puanlı kayıt sıralamadaki
 * puanı günceller ama sırayı korur (migration 010'daki RPC).
 *
 * İKİ MOD — `ListFormScreen` ile aynı desen: `entry` verilirse DÜZENLEME,
 * verilmezse EKLEME. Ayrı bir "düzenleme sheet'i" yazmak aynı üç alanın
 * kopyası ve iki formun zamanla ayrışması demekti.
 *
 * Düzenlemede puan YALNIZCA gerçekten değiştiyse sıralamaya yansıyor ve puanı
 * kaldırmak sıralamayı geri almıyor (migration 011; gerekçe orada).
 */

export interface DiaryEntrySheetProps {
  visible: boolean;
  placeId: string;
  /** Yalnızca başlıkta gösteriliyor — hangi mekana giriş yapıldığı belli olsun. */
  placeName: string;
  /** Verilirse DÜZENLEME modu: alanlar bu girişin değerleriyle açılıyor. */
  entry?: DiaryEntry | null;
  onClose: () => void;
  /** Kayıt başarılı — çağıran ekran bildirim gösterip sheet'i kapatıyor. */
  onSaved: () => void;
}

/** `diary_entries.note` DB CHECK'i ile aynı (migration 009). */
const NOTE_MAX = 1000;

export default function DiaryEntrySheet({
  visible,
  placeId,
  placeName,
  entry,
  onClose,
  onSaved,
}: DiaryEntrySheetProps) {
  const insets = useSafeAreaInsets();
  const editing = Boolean(entry);

  const [visitedAt, setVisitedAt] = useState(() => toDateString(new Date()));
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Form AÇILIŞTA dolduruluyor (kapanışta değil): düzenlemede girişin kendi
  // değerleri, eklemede bugün + boş. `entry` bağımlılıkta çünkü aynı sheet
  // örneği farklı girişler için art arda açılabiliyor.
  useEffect(() => {
    if (!visible) {
      setPickerOpen(false);
      return;
    }

    setVisitedAt(entry?.visited_at ?? toDateString(new Date()));
    // 0 = "puan yok". `StarRating` sayı bekliyor, null'ı temsil edemiyor.
    setRating(entry?.rating ?? 0);
    setNote(entry?.note ?? '');
    setError(null);
  }, [visible, entry]);

  const handleSave = async () => {
    if (saving) return;

    setSaving(true);
    setError(null);

    // 0 "puan verilmedi" demek — RPC'ye null gidiyor.
    // Eklemede: sıralamaya hiç dokunulmuyor.
    // Düzenlemede: puan KALDIRILIYOR ama sıralamadaki puan duruyor (mig. 011).
    const ratingValue = rating > 0 ? rating : null;
    const noteValue = note.trim() || null;

    const { error: saveError } = entry
      ? await updateDiaryEntry({
          entryId: entry.id,
          visitedAt,
          rating: ratingValue,
          note: noteValue,
        })
      : await logDiaryEntry({
          placeId,
          visitedAt,
          rating: ratingValue,
          note: noteValue,
        });

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    onSaved();
  };

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
                <Text style={styles.title}>
                  {editing ? 'Ziyareti düzenle' : 'Ziyaret ekle'}
                </Text>
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

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {error && <ErrorBanner message={error} style={styles.banner} />}

              {/* ── Tarih ── */}
              <Text style={styles.label}>Ne zaman gittin?</Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Ziyaret tarihini seç"
              >
                <Icon name="diary" size={18} color={Colors.brandStrong} />
                <Text style={styles.dateText}>{formatVisitDate(visitedAt)}</Text>
              </Pressable>

              {pickerOpen && (
                <DateTimePicker
                  value={fromDateString(visitedAt)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  // Gelecek tarih seçilemiyor; RPC de ayrıca reddediyor
                  // (migration 010) — burada amaç kullanıcıyı hataya
                  // düşürmemek.
                  maximumDate={new Date()}
                  onChange={(event, selected) => {
                    // Android'de seçici bir dialog: her olayda kapanıyor.
                    // iOS'ta inline spinner, kullanıcı kapatana kadar duruyor.
                    setPickerOpen(Platform.OS === 'ios');
                    if (event.type === 'set' && selected) {
                      // `toISOString` KULLANILMIYOR — UTC'ye çevirip tarihi bir
                      // gün geri kaydırırdı (bkz. src/lib/date.ts).
                      setVisitedAt(toDateString(selected));
                    }
                  }}
                />
              )}

              {/* ── Puan (opsiyonel) ── */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Puan</Text>
                {rating > 0 && (
                  <Pressable
                    onPress={() => setRating(0)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.clearRating}>Puanı kaldır</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.ratingBlock}>
                <StarRating rating={rating} size={32} onChange={setRating} />
                <Text style={styles.ratingHint}>
                  {rating > 0
                    ? `${rating.toFixed(1)} / 5.0 — sıralamana işlenecek`
                    : editing
                      ? // Düzenlemede puanı kaldırmak sıralamayı GERİ ALMIYOR;
                        // kullanıcıya olmayan bir söz vermiyoruz.
                        'Puansız. Sıralamandaki puan olduğu gibi kalır.'
                      : 'İsteğe bağlı. Puan vermezsen yalnızca günlüğünde kalır.'}
                </Text>
              </View>

              {/* ── Not (opsiyonel) ── */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Not</Text>
                <Text style={styles.counter}>
                  {note.length}/{NOTE_MAX}
                </Text>
              </View>
              <TextInput
                // `...Type.body` SPREAD EDİLMİYOR: `lineHeight` bir TextInput'a
                // verildiğinde Android'de metni dikeyde kırpabiliyor.
                style={styles.noteInput}
                placeholder="Ne yedin, nasıldı? (opsiyonel)"
                placeholderTextColor={Colors.textMuted}
                value={note}
                onChangeText={setNote}
                maxLength={NOTE_MAX}
                multiline
                textAlignVertical="top"
              />

              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  (saving || pressed) && styles.saveButtonPressed,
                ]}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={Colors.textOnBrand} />
                ) : (
                  <Text style={styles.saveButtonText}>Kaydet</Text>
                )}
              </Pressable>
            </ScrollView>
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
    // Form uzun; sheet ekranın tamamını kaplamasın.
    maxHeight: '85%',
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
  banner: { marginBottom: Spacing.sm },

  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  counter: {
    ...Type.micro,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brandSurface,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dateText: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },

  ratingBlock: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  ratingHint: {
    ...Type.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  clearRating: {
    ...Type.caption,
    color: Colors.danger,
  },

  noteInput: {
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 88,
  },

  saveButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Elevation.brand,
  },
  saveButtonPressed: { opacity: 0.75 },
  saveButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
});
