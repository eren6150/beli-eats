import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../../components/ui/Icon';
import TextField from '../../components/ui/TextField';
import Button from '../../components/ui/Button';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { Colors, Type, Spacing, Radius } from '../../constants/theme';

/** Logo dairesinin çapı — `Radius.full` ile daire kalır. */
const LOGO_SIZE = 80;

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { signIn, signInWithGoogle, linkNotice, clearLinkNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /**
   * Başarıda hiçbir şey yapmıyoruz: oturum açılınca `onAuthStateChange` →
   * `RootNavigator` devralıyor. Buradan yönlendirmek iki tarafı yarıştırırdı
   * (`RegisterScreen`'in aynı kararı).
   */
  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error, cancelled } = await signInWithGoogle();
    setGoogleLoading(false);
    if (cancelled) return; // vazgeçmek hata değil
    if (error) Alert.alert('Giriş Hatası', error.message);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) Alert.alert('Giriş Hatası', error.message);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {/* Logo Area */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            {/* Emoji yerine Icon: emoji cihaza göre farklı çiziliyor ve
                renklendirilemiyor. Marka işareti Faz 4'te gelecek. */}
            <Icon name="restaurant" size={40} color={Colors.brandStrong} />
          </View>
          <Text style={styles.appName}>Beli Eats</Text>
          <Text style={styles.tagline}>Yemeğin Letterboxd'ı</Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Giriş Yap</Text>

          {/* Derin bağlantı işlenemediyse kullanıcı burada, sebebini bilmeden
              kalırdı. `onRetry` YOK: yeniden denenecek bir şey yok, yapılacak
              tek şey formu doldurmak — kapatma butonu o yüzden "Tamam". */}
          {linkNotice ? (
            <ErrorBanner
              message={linkNotice}
              onRetry={clearLinkNotice}
              retryLabel="Tamam"
              style={styles.linkNotice}
            />
          ) : null}

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
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            // Bağlantı alanın hemen altına otursun diye taban boşluk kısaldı;
            // normal `Spacing.md` bırakılsa link havada duran ayrı bir öge gibi
            // görünür, hangi alana ait olduğu okunmazdı.
            containerStyle={styles.passwordField}
          />

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotText}>Şifreni mi unuttun?</Text>
          </TouchableOpacity>

          <Button
            label="Giriş Yap"
            onPress={handleLogin}
            loading={loading}
            style={styles.primaryButton}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>veya</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Google ile devam et"
            variant="secondary"
            icon="google"
            onPress={handleGoogle}
            loading={googleLoading}
          />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.secondaryButtonText}>
              Hesabın yok mu? <Text style={styles.linkText}>Kayıt Ol</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
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
   * Butonun GÖRÜNÜMÜ artık `Button` primitive'inde; burada yalnızca bu ekrana
   * özgü konumlandırma kalıyor. `inputGroup` / `label` / `input` stilleri de
   * SİLİNDİ — üçü `TextField`'e taşındı ve değerleri birebir aynıydı, yani
   * taşıma görsel olarak nötr. (`...Type.body` spread etmeme gerekçesi de
   * `TextField`'in başında duruyor; burada ikinci bir kopyası kalmasın.)
   */
  primaryButton: { marginTop: Spacing.xs },
  /**
   * "Şifreni mi unuttun?" sağa yaslı ve şifre alanına bitişik — form
   * ekranlarının yerleşik dili. Sayfanın altındaki "Kayıt Ol" satırının yanına
   * konsaydı iki ikincil bağlantı üst üste yığılır, ikisi de zayıflardı.
   */
  linkNotice: { marginBottom: Spacing.md },
  /**
   * "veya" ayırıcısı — iki giriş yolunun ALTERNATİF olduğunu söylüyor.
   * Onsuz Google butonu, üstündeki birincil butonun devamı gibi okunuyordu.
   */
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderSubtle,
  },
  dividerText: {
    ...Type.caption,
    color: Colors.textMuted,
  },
  passwordField: { marginBottom: Spacing.xs },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
  },
  forgotText: {
    ...Type.caption,
    color: Colors.brand,
    fontWeight: Type.bodyStrong.fontWeight,
    // Android ozel fontta agirlik sentezlemiyor: yuz adi da gerekli.
    fontFamily: Type.bodyStrong.fontFamily,
  },
  secondaryButton: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
  linkText: {
    color: Colors.brand,
    // Ham '700' yerine token'dan okunuyor — vurgu dili tek yerden döner.
    fontWeight: Type.bodyStrong.fontWeight,
    // Android ozel fontta agirlik sentezlemiyor: yuz adi da gerekli.
    fontFamily: Type.bodyStrong.fontFamily,
  },
});
