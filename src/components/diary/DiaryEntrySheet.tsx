import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Switch,
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
  /**
   * "Sıralamamı da güncelle" (migration 017).
   *
   * VARSAYILAN AÇIK — bugünkü davranış. `MoveToListSheet`'in "Kaynak listeden
   * de kaldır" anahtarındaki kuralın aynısı: anahtara hiç dokunmayan kullanıcı
   * öncekiyle birebir aynı sonucu alır.
   *
   * Puan seçilmemişken anahtar RENDER EDİLMİYOR: puansız log zaten sıralamaya
   * girmiyor, orada bir seçenek göstermek olmayan bir kararı sormak olurdu.
   */
  const [updateRanking, setUpdateRanking] = useState(true);
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
    // Anahtar HER AÇILIŞTA varsayılana dönüyor: bir önceki kayıtta kapatılmış
    // olması sonraki ziyareti sessizce etkilememeli. Kapatmak tek seferlik bir
    // karar, kalıcı bir tercih değil.
    setUpdateRanking(true);
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
          updateRanking,
        })
      : await logDiaryEntry({
          placeId,
          visitedAt,
          rating: ratingValue,
          note: noteValue,
          updateRanking,
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
          /**
           * `flex: 1` GEREKLİ, süs değil: `sheet`'in `maxHeight: '85%'`i yüzde,
           * yani ÇÖZÜLEBİLİR bir ebeveyn yüksekliğine ihtiyacı var. Öncesinde
           * KAV'ın hiç `style`'ı yoktu → içeriğine göre boyutlanıyordu → yüzde
           * belirsiz bir yükseklikten hesaplanıyordu.
           *
           * `behavior="height"` ile çakışmıyor: RN o davranışta `{height, flex:0}`
           * override'ını YALNIZCA klavye açıkken uyguluyor
           * (`KeyboardAvoidingView.js:237-248`, `state.bottom > 0` koşulu).
           * Klavye kapalı → flex:1 (yüzde çözülüyor), açık → sabit yükseklikli
           * kutu ve sheet yine dibe hizalı.
           *
           * `pointerEvents="box-none"`: KAV artık tüm ekranı kapladığı için
           * onsuz arkadaki karartma `Pressable`'ı yutar ve **dışarı dokunup
           * kapatma özelliği kaybolurdu**. "box-none" = kendisi dokunuş hedefi
           * değil, çocukları hedef olmaya devam ediyor.
           */
          style={styles.avoider}
          pointerEvents="box-none"
          /**
           * Android'de 'height' — ÖNCEDEN `undefined` idi ve gerekçesi şuydu:
           * "klavye pencereyi zaten yeniden boyutluyor (adjustResize)". Bu,
           * `TabNavigator`'da yanlış çıkan varsayımla AYNI SINIFTAN: edge-to-edge
           * (SDK 54 varsayılanı) altında pencerenin yeniden boyutlanacağına
           * güvenilemiyor. Üstelik bu dosya projedeki TEK aykırı yerdi —
           * `LoginScreen:45`, `RegisterScreen:56` ve `ListFormScreen:166`
           * üçü de 'height' kullanıyor ve üçü de cihazda çalışıyor.
           * 'padding' DEĞİL: pencere gerçekten yeniden boyutlanıyorsa o sheet'i
           * iki kez iterdi — eski yorumun haklı olduğu tek nokta buydu.
           */
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet}>
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

            {/**
              * `flexShrink: 1` OLMADAN footer sheet'in dışına taşar: RN'de
              * varsayılan `flexShrink` 0 (web'in tersine), yani ScrollView
              * içeriği kadar yer kaplar ve `maxHeight` sınırında kırpılan şey
              * en alttaki footer olurdu — düzeltmeye çalıştığımız bug'ın
              * aynısı, başka kılıkta.
              */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
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
                    ? // Metin ANAHTARA BAĞLI: anahtar kapalıyken "sıralamana
                      // işlenecek" demek düpedüz yalan olurdu. Bu projede
                      // isim/davranış uyumsuzluğu dört kez pahalıya patladı.
                      updateRanking
                      ? `${rating.toFixed(1)} / 5.0 — sıralamana işlenecek`
                      : `${rating.toFixed(1)} / 5.0 — yalnızca bu ziyarete işlenecek`
                    : editing
                      ? // Düzenlemede puanı kaldırmak sıralamayı GERİ ALMIYOR;
                        // kullanıcıya olmayan bir söz vermiyoruz.
                        'Puansız. Sıralamandaki puan olduğu gibi kalır.'
                      : 'İsteğe bağlı. Puan vermezsen yalnızca günlüğünde kalır.'}
                </Text>
              </View>

              {/* ── Sıralama anahtarı (migration 017) ──
                  YALNIZCA puan seçiliyken görünüyor. İki sebep: (a) puansız
                  logda sıralama zaten güncellenmiyor, seçenek anlamsız olurdu;
                  (b) bu sheet'in yerleşimi ekran yüksekliği + sistem yazı tipi
                  ölçeğine duyarlı (Kaydet butonu bir dönem kırpılıyordu) —
                  satırı koşullu tutmak en sık kullanılan "puansız hızlı log"
                  akışının yüksekliğini hiç değiştirmiyor. */}
              {rating > 0 && (
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={styles.switchLabel}>Sıralamamı da güncelle</Text>
                    <Text style={styles.switchHint}>
                      Kapatırsan bu puan yalnızca günlüğünde kalır.
                    </Text>
                  </View>
                  <Switch
                    value={updateRanking}
                    onValueChange={setUpdateRanking}
                    disabled={saving}
                    trackColor={{
                      false: Colors.borderStrong,
                      true: Colors.brandBorder,
                    }}
                    thumbColor={updateRanking ? Colors.brand : Colors.canvasAlt}
                  />
                </View>
              )}

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
            </ScrollView>

            {/**
              * SABİT FOOTER — buton ScrollView'ın İÇİNDEYDİ, bug buydu.
              *
              * Form içeriğinin doğal yüksekliği neredeyse sabit (tarih + puan +
              * ipucu metni + 88px not alanı + buton), sheet ise `maxHeight: 85%`
              * ile sınırlı. Ekran KISAYSA ya da sistem yazı tipi ölçeği BÜYÜKSE
              * o %85 yetmiyor ve kırpılan ilk şey en alttaki buton oluyordu.
              * Geliştirme cihazında görünmemesinin sebebi bu — `TabNavigator`
              * vakasıyla aynı ders: cihaz/OS yapılandırmasına bağlı sınıf.
              *
              * Artık buton ScrollView'ın KARDEŞİ: içerik ne kadar uzarsa uzasın
              * kaydırılan kısım ortadaki alan, buton her zaman ekranda.
              *
              * `insets.bottom + Spacing.sm` — eski `sheet` stilindeki formülün
              * aynısı, buraya taşındı. Bu zaten TOPLAMA idi, yani nav bar'daki
              * `max()` hatasının bu dosyada bir karşılığı YOKTU.
              */}
            <View
              style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}
            >
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.scrimMedium,
  },
  // Dibe hizalama `root`'tan BURAYA taşındı: KAV artık araya giren tam ekran
  // katman, hizalamanın onun içinde olması gerekiyor.
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
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

  /**
   * Sıralama anahtarı — `MoveToListSheet`'in "Kaynak listeden de kaldır"
   * satırıyla BİREBİR aynı token'lar. İki sheet'te iki farklı anahtar görünümü
   * olmasın diye kopyalandı, yeni bir dil uydurulmadı.
   */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
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

  noteInput: {
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 88,
    /**
     * ⚠️ `maxHeight` — `TextField` primitive'inde bulunan hatanın buradaki
     * karşılığı (2026-08-06). Sınırsız bir `multiline` TextInput metin uzadıkça
     * büyüyor ve imleç aşağı kayıyor; RN girdiyi görünür alana yalnızca
     * ODAKLANDIĞI anda kaydırdığı için yazılan satır klavyenin altında
     * kalabiliyor. Sheet'in `maxHeight: '85%'`'i büyümeyi dolaylı sınırladığı
     * için burada daha geç fark ediliyordu, ama mekanizma aynı.
     * Sınırlı kutu kendi içinde kayıyor ve imleci görünür tutuyor.
     */
    maxHeight: 160,
  },

  scroll: {
    // Bkz. JSX'teki not: RN'de varsayılan flexShrink 0, onsuz footer taşar.
    flexShrink: 1,
  },
  scrollContent: {
    // Son alan ile footer arasına nefes payı; footer'ın kendi paddingTop'u
    // üstüne biniyor.
    paddingBottom: Spacing.sm,
  },

  footer: {
    // Tam genişlik ayırıcı: `sheet`'in yatay padding'i negatif marjla iptal
    // edilip footer'ın kendi içinde geri veriliyor. Böylece çizgi kenardan
    // kenara gidiyor ama buton diğer alanlarla aynı hizada kalıyor.
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    // Gölge YOK — Midas kararı: ayrım ince kenarlıktan geliyor. Kaydırılan
    // içeriğin footer'ın altına girdiğini bu çizgi anlatıyor.
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },

  saveButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    ...Elevation.brand,
  },
  saveButtonPressed: { opacity: 0.75 },
  saveButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
});
