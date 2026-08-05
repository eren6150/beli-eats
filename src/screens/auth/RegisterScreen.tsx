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
  ScrollView,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../../components/ui/Icon';
import { Colors, Type, Spacing, Radius, Elevation } from '../../constants/theme';

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
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !email || !password) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalı.');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, trimmedUsername);
    setLoading(false);
    if (error) {
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kullanıcı Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="@kullanici_adi"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
            </View>

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
                placeholder="En az 6 karakter"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textOnBrand} />
              ) : (
                <Text style={styles.primaryButtonText}>Kayıt Ol</Text>
              )}
            </TouchableOpacity>

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
  inputGroup: { marginBottom: Spacing.md },
  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginBottom: Spacing.xs,
  },
  input: {
    // DİKKAT: `...Type.body` SPREAD EDİLMİYOR — gerekçe LoginScreen'de yazılı
    // (TextInput + lineHeight, Android'de dikey kırpma riski).
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
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
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
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
