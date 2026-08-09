import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../../components/ui/Icon';
import TextField from '../../components/ui/TextField';
import Button from '../../components/ui/Button';
import {
  normalizeUsername,
  validateUsername,
  isUsernameTaken,
  USERNAME_TAKEN_TEXT,
} from '../../lib/username';
import { Colors, Type, Spacing, Radius } from '../../constants/theme';

/** Logo dairesinin çapı — LoginScreen ile AYNI. Farklı olduğu dönemde iki
 *  ekran arası geçişte logo zıplıyordu. */
const LOGO_SIZE = 80;

/**
 * "Tekrar gönder" kilidi. Supabase'in kendi hız sınırı da var ve o bundan
 * bağımsız çalışıyor (başka cihazdan denenebilir) — bu kilit kullanıcıyı
 * o hatayı görmekten koruyan ilk bariyer, tek bariyer değil.
 */
const RESEND_COOLDOWN_SECONDS = 60;

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { signUp, resendConfirmation } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Onay bekleniyor durumu — `null` iken form, dolu iken durum görünümü.
   *
   * AYRI EKRAN/ROTA YAPILMADI: yeni bir rota + `AuthStack` değişikliği demekti,
   * oysa gösterilecek tek bir bilgi var. Mevcut parçalarla (Icon + Button)
   * kuruluyor, yeni tasarım dili gerekmiyor.
   */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  /** "Tekrar gönder" kilidi — saniye cinsinden kalan süre. */
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // Geri sayım. Aralık YALNIZCA kilit varken kuruluyor ve temizleniyor —
  // sürekli çalışan bir sayaç ekran kapandıktan sonra da tetiklenirdi.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRegister = async () => {
    // Kullanıcı adı artık gerçekten KULLANILIYOR (metadata ile trigger'a gidiyor),
    // o yüzden boşluk temizliği burada anlamlı hale geldi: `"   "` bugünkü
    // `!username` kontrolünü geçer, sunucuda btrim'lenip boşalır ve kullanıcı
    // sebebini anlamadan `kullanici` adını alırdı.
    const trimmedUsername = normalizeUsername(username);
    if (!trimmedUsername || !email || !password) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    const formatError = validateUsername(trimmedUsername);
    if (formatError) {
      Alert.alert('Hata', formatError);
      return;
    }

    if (password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalı.');
      return;
    }

    setLoading(true);

    /**
     * ── KULLANICI ADI MÜSAİT Mİ ────────────────────────────────────────────
     * Sunucu çakışmayı zaten çözüyor (migration 012: `eren` → `eren2`) ve
     * kayıt asla patlamıyor — ama bunu SESSİZCE yapıyordu. Kullanıcı yazdığı
     * adı aldığını sanıp farklı bir adla kalıyordu, üstelik `EditProfile`
     * kilitli olduğu için düzeltemiyordu bile.
     *
     * Kontrol başarısız olursa (ağ / anon okuma izni) `checked: false` gelir
     * ve kayda DEVAM ederiz: bir kolaylık kontrolünün patlaması kimsenin
     * hesap açmasını engellememeli. Sonek mantığı emniyet ağı olarak duruyor.
     */
    const { taken } = await isUsernameTaken(trimmedUsername);
    if (taken) {
      setLoading(false);
      Alert.alert('Hata', USERNAME_TAKEN_TEXT);
      return;
    }

    const { error, alreadyRegistered, needsConfirmation } = await signUp(
      email,
      password,
      trimmedUsername
    );
    setLoading(false);

    if (error) {
      // Metin artık `useAuth` tarafından koda göre üretiliyor; ham İngilizce
      // mesaj ekrana ulaşmıyor.
      Alert.alert('Kayıt Hatası', error.message);
      return;
    }

    // (c) Supabase bunu HATA olarak döndürmüyor — sessiz sahte başarı olurdu.
    if (alreadyRegistered) {
      Alert.alert('Kayıt Hatası', 'Bu e-posta zaten kayıtlı, giriş yapmayı dene.');
      return;
    }

    // (a) Onay bekleniyor: formun yerine durum görünümü. Login'e ATMIYORUZ —
    // onay açıkken giriş yapılamaz, kullanıcı orada reddedilirdi.
    if (needsConfirmation) {
      setPendingEmail(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return;
    }

    // Oturum açıldı (onay KAPALI): `RootNavigator` oturumu görüp uygulamaya
    // geçiyor. Buradan yönlendirme yapmıyoruz — iki taraf yarışırdı.
  };

  const handleResend = async () => {
    if (!pendingEmail || cooldown > 0 || resending) return;

    setResending(true);
    const { error } = await resendConfirmation(pendingEmail);
    setResending(false);

    if (error) {
      Alert.alert('Gönderilemedi', error.message);
      return;
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    Alert.alert('Gönderildi', 'Onay bağlantısını tekrar gönderdik.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              {/* Emoji yerine Icon — LoginScreen ile aynı gerekçe ve boyut. */}
              <Icon name="restaurant" size={40} color={Colors.brandStrong} />
            </View>
            <Text style={styles.appName}>Beli Eats</Text>
            <Text style={styles.tagline}>Lezzetleri keşfet, sırala, paylaş.</Text>
          </View>

          {pendingEmail ? (
            /* ── Onay bekleniyor (a) + (d) ── */
            <View style={styles.formCard}>
              <View style={styles.pendingIcon}>
                <Icon name="mail" size={32} color={Colors.brandStrong} />
              </View>

              <Text style={styles.formTitle}>E-postanı kontrol et</Text>

              <Text style={styles.pendingText}>
                <Text style={styles.pendingEmail}>{pendingEmail}</Text> adresine
                onay bağlantısı gönderdik. Bağlantıya dokunduktan sonra giriş
                yapabilirsin.
              </Text>

              <Text style={styles.pendingHint}>
                Gelmediyse spam klasörüne bakmayı unutma.
              </Text>

              <Button
                label={
                  cooldown > 0
                    ? `Tekrar gönder (${cooldown})`
                    : 'Tekrar gönder'
                }
                onPress={handleResend}
                loading={resending}
                disabled={cooldown > 0}
                style={styles.primaryButton}
              />

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.secondaryButtonText}>
                  <Text style={styles.linkText}>Giriş ekranına dön</Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Hesap Oluştur</Text>

            <TextField
              label="Kullanıcı Adı"
              placeholder="@kullanici_adi"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />

            <TextField
              label="E-posta"
              placeholder="ornek@eposta.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <TextField
              label="Şifre"
              placeholder="En az 6 karakter"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Button
              label="Kayıt Ol"
              onPress={handleRegister}
              loading={loading}
              style={styles.primaryButton}
            />

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.secondaryButtonText}>
                Zaten hesabın var mı? <Text style={styles.linkText}>Giriş Yap</Text>
              </Text>
            </TouchableOpacity>
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  flex: { flex: 1 },
  inner: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing['3xl'],
  },
  logoArea: { alignItems: 'center', marginBottom: Spacing['3xl'] },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  appName: {
    ...Type.display,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    ...Type.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    // Gölge YOK — Midas kararı: kart ayrımı ince kenarlık + yüzey
    // kontrastından geliyor (kart beyaz, zemin gray-50).
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  formTitle: {
    ...Type.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.xl,
  },
  /**
   * Butonun GÖRÜNÜMÜ artık `Button` primitive'inde (marka rengi, yarıçap,
   * dikey padding, `Elevation.brand`, devre dışı opaklığı, yüklenirken
   * spinner). Burada yalnızca bu ekrana özgü konumlandırma kalıyor.
   *
   * `inputGroup` / `label` / `input` stilleri de SİLİNDİ — üçü de `TextField`'e
   * taşındı ve değerleri birebir aynıydı, yani bu taşıma görsel olarak nötr.
   * İkinci bir kopya bırakmak, iki tanımın zamanla ayrışması demekti.
   */
  primaryButton: { marginTop: Spacing.xs },

  // ── Onay bekleniyor durumu ──
  pendingIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  pendingText: {
    ...Type.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  pendingEmail: {
    color: Colors.textPrimary,
    fontWeight: Type.bodyStrong.fontWeight,
  },
  pendingHint: {
    ...Type.caption,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  secondaryButton: { marginTop: Spacing.lg, alignItems: 'center' },
  secondaryButtonText: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
  linkText: {
    color: Colors.brand,
    fontWeight: Type.bodyStrong.fontWeight,
  },
});
