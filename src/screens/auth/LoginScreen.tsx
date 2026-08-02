import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../../components/ui/Icon';
import { Colors, Type, Spacing, Radius, Elevation } from '../../constants/theme';

/** Logo dairesinin çapı — `Radius.full` ile daire kalır. */
const LOGO_SIZE = 80;

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              placeholder="ornek@eposta.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textOnBrand} />
            ) : (
              <Text style={styles.primaryButtonText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>

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
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginBottom: Spacing.xs,
  },
  input: {
    // DİKKAT: `...Type.body` SPREAD EDİLMİYOR. `lineHeight` bir TextInput'a
    // verildiğinde Android'de metni dikeyde kırpabiliyor (StarRating'de aynı
    // sınıf sorun yaşandı). Token'ları tek tek okuyoruz — değer yine tek
    // kaynaktan geliyor, riskli özellik dışarıda kalıyor.
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    // Odaklanma durumu için ayrılmış yuva — kenarlık kalınlığı sabit kalsın,
    // yoksa odaklanınca içerik zıplar.
    borderColor: 'transparent',
  },
  primaryButton: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
    ...Elevation.brand,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
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
  },
});
