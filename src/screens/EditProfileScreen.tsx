import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ProfileStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import TextField from '../components/ui/TextField';
import Button from '../components/ui/Button';
import ErrorBanner from '../components/ui/ErrorBanner';
import DeleteAccountSheet from '../components/profile/DeleteAccountSheet';
import {
  normalizeUsername,
  validateUsername,
  isUsernameTaken,
  USERNAME_TAKEN_TEXT,
} from '../lib/username';

/**
 * Profil düzenleme.
 *
 * ── `username` ARTIK DÜZENLENEBİLİR (2026-08-09) ─────────────────────────────
 * Bir dönem KİLİTLİYDİ ve sebebi *"çakışma denetimi + hata metni ayrı ve daha
 * büyük bir iş"* diye yazılıydı. O denetim kayıt ekranı için zaten yazıldı
 * (`src/lib/username.ts`), yani iş küçüldü ve kilit **gerçek bir soruna**
 * dönüşmüştü:
 *
 * Migration 012 çakışan bir adı sunucuda sessizce değiştiriyor (`eren` →
 * `eren2`). Kullanıcı bunu ekranda GÖRMÜYOR ve kilit yüzünden sonradan
 * DÜZELTEMİYORDU — yani istemediği bir adla kalıcı olarak sıkışıyordu. Kademe
 * 2'de (tanımadığın kişilere açılırken) bu kabul edilemez.
 *
 * Çakışma iki yerde birden karşılanıyor: önden müsaitlik kontrolü (yaygın
 * durum) ve `23505` yakalama (yarış). İkisi de AYNI metni gösteriyor.
 *
 * ── `avatar_url` HÂLÂ DIŞARIDA ───────────────────────────────────────────────
 * `avatar_url` DIŞARIDA: fotoğraf altyapısı artık var (`expo-image-manipulator`,
 * Storage) ama avatar AYRI bir bucket + ayrı politikalar + ayrı boyut kararı
 * demek; mekan fotoğrafı bucket'ına koymak yanlış olurdu. Doğal ikinci adım.
 *
 * ── VERİ ROUTE PARAMETRESİNDEN ───────────────────────────────────────────────
 * `ListFormScreen` ile aynı karar: çağıran (`ProfileScreen`) elinde zaten tam
 * satır var, ekran ayrı bir sorgu atmıyor — alanlar ilk karede dolu geliyor.
 */

type RouteType = RouteProp<ProfileStackParamList, 'EditProfile'>;

/** DB CHECK'leriyle birebir (migration 004). */
const FULL_NAME_MAX = 100;
const BIO_MAX = 300;

/**
 * ⚠️ Şemada karşılığı YOK — `username text unique not null`, uzunluk kısıtı
 * yazılmamış. Bu yalnızca girdi alanının tavanı; `validateUsername` de aynı
 * sınırı uyguluyor. Gerçek tavan için CHECK kısıtı ayrı bir migration işi.
 */
const USERNAME_MAX = 30;


export default function EditProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { user, deleteAccount } = useAuth();
  const { updateProfile } = useProfile(user?.id);

  const [username, setUsername] = useState(route.params?.username ?? '');
  const [fullName, setFullName] = useState(route.params?.fullName ?? '');
  const [bio, setBio] = useState(route.params?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hesap silme onayı — `null` yerine boolean, sheet'in tek girdisi yok. */
  const [deleteVisible, setDeleteVisible] = useState(false);

  const initialUsername = route.params?.username ?? '';
  const initialFullName = route.params?.fullName ?? '';
  const initialBio = route.params?.bio ?? '';

  /**
   * Boş string `null` demek: kullanıcı alanı temizleyebilmeli ve DB'de "adı
   * yok" ile "adı boş string" diye iki ayrı durum oluşmamalı.
   */
  const normalize = (v: string): string | null => v.trim() || null;

  const trimmedUsername = normalizeUsername(username);
  const usernameChanged = trimmedUsername !== normalizeUsername(initialUsername);

  const dirty =
    usernameChanged ||
    normalize(fullName) !== normalize(initialFullName) ||
    normalize(bio) !== normalize(initialBio);

  const handleSave = async () => {
    if (saving || !dirty) return;

    setSaving(true);
    setError(null);

    /**
     * Kullanıcı adı YALNIZCA DEĞİŞTİYSE doğrulanıyor ve gönderiliyor.
     *
     * Sebep: mevcut adların bir kısmı e-postanın @ öncesinden türedi ve
     * buradaki biçim kurallarını sağlamayabilir (ör. çok kısa). Değişmemiş bir
     * adı doğrulamaya sokmak, kullanıcıyı SADECE biyografisini düzeltmek
     * isterken kilitlerdi.
     */
    if (usernameChanged) {
      const formatError = validateUsername(trimmedUsername);
      if (formatError) {
        setSaving(false);
        setError(formatError);
        return;
      }

      const { taken } = await isUsernameTaken(trimmedUsername);
      if (taken) {
        setSaving(false);
        setError(USERNAME_TAKEN_TEXT);
        return;
      }
    }

    const { error: updateError } = await updateProfile({
      // `undefined` = "dokunma"; hook bu alanları patch'ten ayıklıyor.
      username: usernameChanged ? trimmedUsername : undefined,
      full_name: normalize(fullName),
      bio: normalize(bio),
    });

    setSaving(false);

    if (updateError) {
      /**
       * `23505` = unique ihlali, yani ön kontrol ile yazma ARASINDA biri o adı
       * aldı. Ön kontrol yarışı çözmüyor ve çözmesi de gerekmiyor — gerçek
       * teklik kısıtın kendisinde. Kullanıcı iki yolda da AYNI metni görüyor.
       *
       * Postgres hata KODU ayrıştırmak projenin onayladığı ayrım: `code`
       * belgeli ve kararlı bir sözleşme (`useListItems`'ın aynı gerekçesi).
       */
      const code = (updateError as { code?: string }).code;
      setError(
        code === '23505'
          ? USERNAME_TAKEN_TEXT
          : 'Profil kaydedilemedi. Bağlantını kontrol et.'
      );
      return;
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Şerit — projede hiçbir ekran native header göstermiyor. */}
      <View style={styles.bar}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          <Text style={styles.barCancel}>İptal</Text>
        </Pressable>

        <Text style={styles.barTitle}>Profili Düzenle</Text>

        <Pressable
          onPress={handleSave}
          disabled={!dirty || saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : (
            <Text style={[styles.barAction, !dirty && styles.barActionDisabled]}>
              Kaydet
            </Text>
          )}
        </Pressable>
      </View>

      {/**
        * ⚠️ İKİ ÇALIŞMA ORTAMI FARKLI DAVRANIYOR — bu yorum o yüzden uzun.
        *
        * Belirleyici gerçek: **pencerenin klavye için küçülüp küçülmediği
        * ortama göre değişiyor.**
        *
        *   Expo Go        → KÜÇÜLÜYOR   (ölçüldü: 846 → 455 = klavyenin tam boyu)
        *   Gerçek APK     → KÜÇÜLMÜYOR  (sekme çubuğu yukarı çıkmıyor, sayfa
        *                                 hiç kaydırılamıyor: 754 alan > 578 içerik)
        *
        * Sebep: `softwareKeyboardLayoutMode` **native manifest ayarı**. Expo Go
        * kendi Activity'siyle çalışıp pencereyi yeniden boyutluyor; bizim
        * APK'mızda ise edge-to-edge açık (SDK 54'te zorunlu) ve edge-to-edge
        * altında `adjustResize` pencereyi yeniden boyutlamıyor.
        *
        * ── BU YORUM BİR KEZ YANLIŞ YAZILDI ─────────────────────────────────
        * Bir dönem burada "pencere ZATEN küçülüyor, KAV fazla yer açıyor,
        * o yüzden Android'de kapatıldı" yazıyordu. O ölçüm **yalnızca Expo
        * Go'ydu** ve gerçek APK'da geçerli değil. KAV kapatılınca production'da
        * telafi eden hiçbir şey kalmadı: sayfa hiç kaydırılamaz oldu, alttaki
        * Kaydet butonu ve ipucu klavyenin arkasında kaldı.
        *
        * DERS: klavye/pencere davranışı Expo Go'da KANITLANMAZ (bkz. CLAUDE.md
        * → Bilinen Açık İşler'in ilk maddesi).
        *
        * ── ŞU ANKİ DURUM: AÇIK, ve bu bilinçli bir DENEY ────────────────────
        * Pencere production'da küçülmediğine göre KAV'ın telafisi artık çift
        * sayım yapmıyor — yani orada doğru işi yapıyor olması bekleniyor.
        *
        * ⚠️ İZLENECEK KUSUR: Expo Go ölçümünde KAV kendi alt kenarını klavyenin
        * tepesine oturtuyordu ama stack'e ayrılan alan klavyeden **68px yukarıda**
        * bitiyor (arada SEKME ÇUBUĞU var). Aynı kayma production'da da varsa
        * belirtisi net olur: **kaydırma çalışır ama sonuna kadar götürmez**,
        * son ~68px klavyenin arkasında kalır. Öyleyse sıradaki adım, pencerenin
        * ne kadarını zaten emdiğini ölçüp KALANI dolgu olarak eklemek —
        * `max(0, klavye − (kapalıyken_yükseklik − şimdiki_yükseklik))`. O formülde
        * çifte sayma yapısal olarak imkânsız.
        *
        * ⚠️ DENENDİ ve EKRANI BOŞALTTI: koşulsuz olarak klavye boyu kadar
        * `paddingBottom` eklemek. Pencere zaten küçülmüşken alan sıfırın altına
        * iniyor. **Pencere işi yapıyorsa üstüne bir şey EKLENMEZ** — telafi
        * koşulsuz değil, ölçülmüş farka göre olmalı.
        *
        * NOT: `ListFormScreen`, `LoginScreen` ve `RegisterScreen` aynı KAV'ı
        * taşıyor. Bu koşul production'da onlarda da var; bugün göze batmıyor
        * çünkü formları kısa — AYRI diff, ayrı test turu.
        */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error && <ErrorBanner message={error} style={styles.banner} />}

          {/* Kullanıcı adı artık DÜZENLENEBİLİR — gerekçe dosyanın başında. */}
          <TextField
            label="Kullanıcı adı"
            placeholder="@kullanici_adi"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            maxLength={USERNAME_MAX}
          />

          <TextField
            label="Ad Soyad"
            placeholder="Adın (opsiyonel)"
            value={fullName}
            onChangeText={setFullName}
            maxLength={FULL_NAME_MAX}
            showCounter
            autoCorrect={false}
            returnKeyType="next"
          />

          <TextField
            label="Hakkında"
            placeholder="Kendinden kısaca bahset (opsiyonel)"
            value={bio}
            onChangeText={setBio}
            maxLength={BIO_MAX}
            showCounter
            multiline
            hint="Profilinde adının altında görünür."
          />

          <Button
            label="Kaydet"
            onPress={handleSave}
            loading={saving}
            disabled={!dirty}
            style={styles.saveButton}
          />

          {/* ── Tehlikeli bölge ──
              YERİ BİLİNÇLİ: ayarlar menüsü yerine burası. O menü bugün iki
              maddelik bir `Alert` ("İptal / Çıkış Yap") ve oraya yıkıcı bir
              üçüncü madde koymak yanlış dokunmayı kolaylaştırırdı. Burası
              zaten kimliğini yönettiğin ekran ve buton sayfanın EN ALTINDA,
              kaydırmadan görünmüyor.

              Buton DOLU DEĞİL, kenarlıklı: birincil eylemle (Kaydet) aynı
              görsel ağırlıkta olmamalı. */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Tehlikeli bölge</Text>
            <Text style={styles.dangerText}>
              Hesabını silmek geri alınamaz. Tüm puanların, ziyaretlerin,
              listelerin ve fotoğrafların kalıcı olarak silinir.
            </Text>
            <Pressable
              onPress={() => setDeleteVisible(true)}
              style={({ pressed }) => [
                styles.dangerButton,
                pressed && styles.dangerButtonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.dangerButtonText}>Hesabımı sil</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Onayın kendisi ayrı bileşende: kullanıcı adını yazdırma, ne
          silineceğinin listesi ve hata durumu oraya ait. */}
      <DeleteAccountSheet
        visible={deleteVisible}
        username={initialUsername}
        onCancel={() => setDeleteVisible(false)}
        onConfirm={deleteAccount}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  flex: { flex: 1 },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  barTitle: { ...Type.bodyStrong, color: Colors.textPrimary },
  barCancel: { ...Type.body, color: Colors.textSecondary },
  barAction: { ...Type.bodyStrong, color: Colors.brand },
  barActionDisabled: { color: Colors.textMuted },
  pressed: { opacity: 0.6 },

  content: {
    padding: Spacing.lg,
    /**
     * KAYDIRMA PAYI — ölçüyle belirlendi, göz kararı değil.
     *
     * Bir `ScrollView` son pikselinden öteye kaydıramaz; bir alanı tepeye
     * çıkarmak için altında yeterince içerik olmalı. Cihaz ölçümü (2026-08-06,
     * klavye açık): görünür alan **363**, paysız içerik **530** → kaydırma payı
     * `530 + pay − 363`. "Hakkında"yı tepeye almak ~**220** istiyor:
     *
     *   pay 20 (eski) → 187  ✗ "Ad Soyad" yarım kesik kalıyordu
     *   pay 96        → 263  ✗ fazla: alan tepenin üstüne kaçıyor, altta boşluk
     *   pay 48        → 215  ✓ ideale 5px — o 5px zaten grup alt boşluğu
     *
     * `Spacing['4xl']` seçildi: ölçülen ideale (≈53) en yakın ölçek adımı, yani
     * bu ekrana özgü sihirli bir sayı taşımıyoruz. Sistem yazı tipi ölçeği çok
     * büyükse açık geri gelebilir — o durumda bir adım yukarı (`Spacing` ölçeği)
     * çıkılır, formül değişmez.
     *
     * Klavye kapalıyken bedeli SIFIR: içerik (578) görünür alandan (754) kısa,
     * hiç kaydırma olmuyor, bu boşluk hiç görünmüyor.
     */
    paddingBottom: Spacing['4xl'],
  },
  banner: { marginBottom: Spacing.md },

  // `locked*` stilleri SİLİNDİ: kullanıcı adı artık `TextField` ile
  // düzenleniyor, kilitli kutu diye bir şey kalmadı.

  saveButton: { marginTop: Spacing.md },

  /**
   * Tehlikeli bölge — Kaydet'ten ince bir çizgiyle ve geniş bir boşlukla
   * ayrılıyor. Amaç yakınlık kurmamak: kaydetmeye gelen parmak buraya
   * kazara ulaşmamalı.
   */
  dangerZone: {
    marginTop: Spacing['3xl'],
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  dangerTitle: {
    ...Type.captionStrong,
    color: Colors.danger,
  },
  dangerText: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  // DOLU DEĞİL, kenarlıklı: birincil eylemle aynı görsel ağırlıkta olmamalı.
  dangerButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerSurface,
  },
  dangerButtonPressed: { opacity: 0.7 },
  dangerButtonText: {
    ...Type.bodyStrong,
    color: Colors.danger,
  },
});
