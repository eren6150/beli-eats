import React, { useState } from 'react';
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

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

    const { error } = await signUp(email, password, trimmedUsername);
    setLoading(false);
    if (error) {
      // Metin artık `useAuth` tarafından koda göre üretiliyor; ham İngilizce
      // mesaj ekrana ulaşmıyor.
      Alert.alert('Kayıt Hatası', error.message);
    } else {
      Alert.alert('Başarılı!', 'Hesabın oluşturuldu. Giriş yapabilirsin.');
      navigation.navigate('Login');
    }
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
