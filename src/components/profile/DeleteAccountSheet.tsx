import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import ErrorBanner from '../ui/ErrorBanner';

/**
 * Hesap silme onayı — İKİNCİ adım.
 *
 * Birinci adım `EditProfile`'ın "Tehlikeli bölge" butonu. Projenin "silme iki
 * adımlı" kuralı burada tabandır, tavan değil: hesap silme geri alınamayan ve
 * her şeyi götüren tek eylem, o yüzden ikinci adım basit bir onay değil
 * KULLANICI ADINI YAZDIRMA.
 *
 * ── 🔑 NEDEN ŞİFRE DEĞİL, KULLANICI ADI ─────────────────────────────────────
 * GOOGLE İLE GİRENİN ŞİFRESİ YOK. Şifre tekrar sordurmak o kullanıcıları
 * hesabını hiç silemez hale getirirdi — ve Apple'ın "uygulama içi hesap silme"
 * şartı da karşılanmazdı. Kullanıcı adı yazdırma herkes için çalışıyor ve aynı
 * sürtünmeyi sağlıyor (GitHub/Vercel deseni).
 *
 * ── SAYI GÖSTERİLMİYOR ──────────────────────────────────────────────────────
 * "86 puanın silinecek" gibi sayılar yeni sorgular ister ve bayat sayı gösterme
 * riski doğurur. Kategori listesi aynı caydırıcı etkiyi veriyor.
 */

export interface DeleteAccountSheetProps {
  visible: boolean;
  /** Onay için yazılması gereken ad. */
  username: string;
  onCancel: () => void;
  /** Silmeyi yürütür. Hata dönerse sheet AÇIK kalıyor ve metni gösteriyor. */
  onConfirm: () => Promise<{ error: Error | null }>;
}

/** Sheet ekranın tamamını kaplamasın; uzun metinde içerik kendi içinde kayar. */
const MAX_SHEET_RATIO = 0.85;

export default function DeleteAccountSheet({
  visible,
  username,
  onCancel,
  onConfirm,
}: DeleteAccountSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Her açılışta sıfırdan: önceki denemenin yazdığı ad ve hatası taşınmamalı.
  useEffect(() => {
    if (visible) {
      setTyped('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  /**
   * Büyük/küçük harf duyarsız, aksan duyarlı — `useSearchHistory` ile aynı
   * gerekçe: `toLowerCase()` Türkçe'de bozuk ("İ" birleşik noktalıya, "I" → "i"
   * oluyor). Kullanıcıyı büyük harf yüzünden kilitlemenin anlamı yok.
   */
  const matches =
    typed.trim().localeCompare(username, 'tr', { sensitivity: 'accent' }) === 0;

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await onConfirm();
    if (deleteError) {
      // Sheet KAPANMIYOR: kullanıcı ne olduğunu görmeli ve tekrar deneyebilmeli.
      setError(deleteError.message);
      setBusy(false);
    }
    // Başarıda kapatma YOK — oturum kapanıyor ve `RootNavigator` zaten Login'e
    // geçiyor, yani bu bileşen unmount oluyor.
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android donanım/jest geri tuşu. ⚠️ Silme sürerken kapatmıyor: yarıda
      // kesilmiş gibi görünen bir durum bırakmamalı.
      onRequestClose={busy ? () => {} : onCancel}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Karartma KAV'ın DIŞINDA ve altında: dışarı dokunup kapatma klavye
            açıkken de çalışmalı. İçeride olsaydı KAV'ın dolgusu onu iterdi. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onCancel}
        />

        {/**
          * ── KLAVYE TELAFİSİ ────────────────────────────────────────────────
          * ⚠️ İLK HALDE HİÇ YOKTU ve sahada kırıldı: kullanıcı adını yazmak
          * için alana dokununca klavye sheet'in alt kısmını —girdiyi ve onay
          * butonlarını— örtüyordu. Sheet kısa göründüğü için gerek olmadığını
          * VARSAYMIŞTIM, ölçmemiştim; bu projede aynı varsayım daha önce üç kez
          * kırıldı.
          *
          * ⚠️ RN'İN `KeyboardAvoidingView`'I DEĞİL, `react-native-keyboard-
          * controller`'ınki. Gerekçe CLAUDE.md'de kayıtlı: RN'inki edge-to-edge
          * altında iki ortamda ZIT davranıyor (Expo Go'da pencere küçülüyor,
          * gerçek APK'da küçülmüyor) ve o teşhis iki tur kaybettirmişti. Bu
          * kütüphane IME ölçülerini `WindowInsets`'ten doğrudan okuyor.
          * `ForgotPasswordScreen` tam olarak bu belirti yüzünden ona taşınmıştı
          * ve sahada çalışıyor.
          *
          * ⚠️ `pointerEvents="box-none"` BİLİNÇLİ OLARAK YOK. `DiaryEntrySheet`
          * onu kullanıyor ve çalışıyor, ama bu oturumda `PhotoViewer`'da
          * `box-none`'un iç `Pressable`'ın dokunuşunu YUTTUĞU görüldü. Burada
          * dokunulması gereken üç öğe var (girdi + iki buton); riskli değişkeni
          * hiç sokmuyoruz — karartma zaten KAV'ın dışında.
          */}
        <KeyboardAvoidingView behavior="padding">
        <View
          style={[
            styles.sheet,
            {
              maxHeight: windowHeight * MAX_SHEET_RATIO,
              paddingBottom: insets.bottom + Spacing.sm,
            },
          ]}
        >
          <View style={styles.handleBar} />

          {/* `flexShrink: 1` ŞART — RN'de varsayılan 0. Onsuz uzun içerik
              sheet'in `maxHeight`'ini aşar ve kırpılan ilk şey en alttaki
              onay butonu olurdu (`DiaryEntrySheet`'in dersi). */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Hesabını sil</Text>
            <Text style={styles.lead}>
              Bu işlem geri alınamaz. Silindiğinde şunların hepsi kalıcı olarak
              kaybolur:
            </Text>

            <View style={styles.list}>
              <Text style={styles.listItem}>• Puanların ve yorumların</Text>
              <Text style={styles.listItem}>• Ziyaret günlüğün</Text>
              <Text style={styles.listItem}>• Listelerin</Text>
              <Text style={styles.listItem}>• Yüklediğin fotoğraflar</Text>
              <Text style={styles.listItem}>
                • Takip ilişkilerin ve beğenilerin
              </Text>
            </View>

            <Text style={styles.warning}>
              Yüklediğin fotoğraflar mekan sayfalarından da kalkacak.
            </Text>

            <Text style={styles.prompt}>
              Onaylamak için kullanıcı adını yaz:{' '}
              <Text style={styles.promptName}>{username}</Text>
            </Text>

            {/* `...Type.body` SPREAD EDİLMİYOR: `lineHeight` bir TextInput'a
                verildiğinde Android'de metni dikeyde kırpabiliyor. */}
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={setTyped}
              placeholder={username}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />

            {error && <ErrorBanner message={error} style={styles.banner} />}
          </ScrollView>

          {/* Eylemler sabit, ScrollView'ın DIŞINDA. */}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              // Ad eşleşmeden ETKİN DEĞİL — asıl sürtünme burada.
              disabled={!matches || busy}
              style={({ pressed }) => [
                styles.confirmBtn,
                (!matches || busy) && styles.confirmBtnDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !matches || busy }}
            >
              {busy ? (
                <ActivityIndicator color={Colors.textOnBrand} />
              ) : (
                <Text style={styles.confirmText}>Hesabı kalıcı olarak sil</Text>
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

  scroll: { flexShrink: 1 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Type.title,
    color: Colors.danger,
  },
  lead: {
    ...Type.body,
    color: Colors.textStrong,
    marginTop: Spacing.xs,
  },
  list: { marginTop: Spacing.sm, gap: Spacing.xxs },
  listItem: {
    ...Type.body,
    color: Colors.textStrong,
  },
  warning: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  prompt: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },
  promptName: {
    ...Type.captionStrong,
    color: Colors.textPrimary,
  },
  input: {
    fontSize: Type.body.fontSize,
    fontFamily: Type.body.fontFamily,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderWidth: 1,
    borderColor: Colors.borderMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  banner: { marginTop: Spacing.sm },

  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  cancelText: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.danger,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
  pressed: { opacity: 0.7 },
});
