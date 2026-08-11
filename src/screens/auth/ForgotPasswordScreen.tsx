import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import Icon from '../../components/ui/Icon';
import TextField from '../../components/ui/TextField';
import Button from '../../components/ui/Button';
import { Colors, Type, Spacing, Radius } from '../../constants/theme';

/** Logo dairesinin çapı — diğer iki auth ekranıyla AYNI, geçişte zıplamasın. */
const LOGO_SIZE = 80;

/**
 * "Kodu tekrar gönder" kilidi — `RegisterScreen` ile aynı değer ve aynı
 * gerekçe: Supabase'in kendi hız sınırı bundan BAĞIMSIZ çalışıyor (başka
 * cihazdan denenebilir), bu kilit yalnızca ilk bariyer.
 */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * ⚠️ KOD UZUNLUĞU SABİT DEĞİL — ekran onu BİLMEMELİ.
 *
 * ── NEYDİ ────────────────────────────────────────────────────────────────────
 * Burada bir dönem `CODE_LENGTH = 6` vardı ve hem `maxLength` hem de "tam
 * olarak 6 hane olmalı" kontrolü olarak kullanılıyordu. Supabase'de OTP
 * uzunluğu **panelden ayarlanan** bir değer (Authentication → Sign In /
 * Providers → Email → "Email OTP Length", 6-10 arası) ve bu projede 8'e
 * ayarlıydı: mail 8 haneli kod getiriyor, kutu 6 hanede doluyor, kullanıcı
 * geçerli kodunu **giremiyordu**.
 *
 * Bu, CLAUDE.md'nin üç kez ısırdığını yazdığı sınıfın aynısı ("formül belirli
 * bir yapılandırma için doğru"): nav bar'ın `insets.bottom`'ı, diary'nin sabit
 * yükseklik varsayımı, `StarRating`'in ölçeğe tabi glifi. Oradaki çıkarım
 * burada da geçerli — **düzeltme 6'yı 8 yapmak DEĞİL**, o sayıya olan
 * bağımlılığı kaldırmak.
 *
 * ── ŞİMDİ ────────────────────────────────────────────────────────────────────
 * Tavan Supabase'in izin verdiği en büyük değer, taban en küçüğü. Panel hangi
 * uzunluğa ayarlı olursa olsun kod çalışıyor ve ayar değişirse de çalışmaya
 * devam ediyor. Doğrulama sunucunun işi; buradaki kontrol yalnızca AÇIKÇA
 * eksik bir girdide boşa ağ turu yakmamak için — geçerli hiçbir kodu
 * engelleyemez, çünkü geçerli kodlar her zaman tabandan uzun.
 */
const CODE_MIN_LENGTH = 6;
const CODE_MAX_LENGTH = 10;

/** `RegisterScreen`'in kuralıyla aynı — iki yerde ayrışmasın. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Şifre sıfırlama — tek ekran, iki adım (e-posta → kod + yeni şifre).
 *
 * ── NEDEN AYRI EKRAN, `LoginScreen`'de "durum görünümü" DEĞİL ───────────────
 * `RegisterScreen`'in `pendingEmail` deseni "gösterilecek TEK bir bilgi var"
 * durumu içindi. Burada kendi girdileri olan iki adımlı bir akış var; Login'in
 * içine koymak o ekranı (uygulamanın en kritik ekranı) şişirirdi.
 *
 * ── ADIM DEĞİŞİMİNDE AYRI BİR BAYRAK YOK ────────────────────────────────────
 * Adımı `sentToEmail` belirliyor: `null` iken e-posta formu, dolu iken kod
 * formu. İki state'i (`step` + `email`) senkron tutmak "kod adımındayım ama
 * hangi adrese gönderdiğimi bilmiyorum" ara durumunu mümkün kılardı —
 * `RankingReviewSheet`'in "ayrı `visible` bayrağı YOK" kararının aynısı.
 *
 * ── OTURUMA DOKUNULMUYOR ────────────────────────────────────────────────────
 * `resetPassword` doğrulamayı ve yazmayı ayrı bir Supabase istemcisinde
 * yapıyor, yani bu ekran açıkken `RootNavigator` hiç el değiştirmiyor.
 * Gerekçesi `supabaseClient.ts`'te `supabaseRecovery`'nin başında.
 */
export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const { sendPasswordResetCode, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  /** Kod gönderilen adres — aynı zamanda hangi adımda olduğumuzun TEK kaynağı. */
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // Geri sayım. Aralık YALNIZCA kilit varken kuruluyor ve temizleniyor —
  // sürekli çalışan bir sayaç ekran kapandıktan sonra da tetiklenirdi.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Hata', 'E-posta adresini yaz.');
      return;
    }

    setLoading(true);
    const { error } = await sendPasswordResetCode(trimmedEmail);
    setLoading(false);

    if (error) {
      Alert.alert('Gönderilemedi', error.message);
      return;
    }

    // Adrese kayıtlı bir hesap OLMASA DA buraya geliyoruz: Supabase e-posta
    // sayımını engellemek için ikisini ayırmıyor, biz de ayıramayız. Ekrandaki
    // metin bu yüzden "kayıtlıysa gönderdik" diyor.
    setSentToEmail(trimmedEmail);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleResend = async () => {
    if (!sentToEmail || cooldown > 0 || resending) return;

    setResending(true);
    const { error } = await sendPasswordResetCode(sentToEmail);
    setResending(false);

    if (error) {
      Alert.alert('Gönderilemedi', error.message);
      return;
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    Alert.alert('Gönderildi', 'Yeni bir kod gönderdik.');
  };

  const handleReset = async () => {
    if (!sentToEmail) return;

    const trimmedCode = code.trim();

    // Biçim kontrolleri ÖNDE: sunucuya gitmeden yakalanabilen hatalar için bir
    // tur ağ yakmanın anlamı yok, üstelik dönen mesaj daha bulanık olurdu.
    if (trimmedCode.length < CODE_MIN_LENGTH) {
      // Metin SAYI VERMİYOR: uzunluk panelden değişebildiği için "6 haneli
      // olmalı" demek, 8 haneli kodu doğru yazmış kullanıcıya yanlış teşhis
      // koymak olurdu.
      Alert.alert('Hata', 'Kod eksik görünüyor. E-postadaki kodun tamamını gir.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Hata', `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(sentToEmail, trimmedCode, password);
    setLoading(false);

    if (error) {
      Alert.alert('Sıfırlanamadı', error.message);
      return;
    }

    /**
     * Kullanıcı giriş YAPMIŞ DURUMDA DEĞİL ve bu bilinçli: yeni şifreyle
     * girmesi, şifrenin gerçekten istediği gibi kaydedildiğinin kanıtı oluyor.
     * Yazım hatası burada anında yakalanıyor — "şifreni tekrar gir" alanına da
     * bu yüzden gerek kalmadı.
     */
    Alert.alert('Şifren güncellendi', 'Yeni şifrenle giriş yapabilirsin.', [
      { text: 'Giriş yap', onPress: () => navigation.navigate('Login') },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/**
        * ── `KeyboardAvoidingView` + `ScrollView` YERİNE bu ──────────────────
        * Sahada ölçülen sorun: klavye açıkken "Kod gönder" butonunun altından
        * bir miktar kırpılıyordu (basılabiliyordu ama tam görünmüyordu).
        *
        * Sebep, CLAUDE.md'de kayıtlı olan şey: SDK 54'te edge-to-edge zorunlu
        * ve o modda pencere klavye için yeniden BOYUTLANMIYOR, yani
        * `KeyboardAvoidingView`'ın dayandığı varsayım gerçek APK'da geçerli
        * değil. `KeyboardAwareScrollView` IME yüksekliğini `WindowInsets`'ten
        * DOĞRUDAN okuyup odaklı alanın altında gerçek boşluk bırakıyor —
        * ölçüye değil olguya dayanıyor.
        *
        * ⚠️ BİLİNÇLİ OLARAK SADECE BU EKRAN. `Login`, `Register`,
        * `EditProfile`, `ListForm` ve `DiaryEntrySheet` bugünkü halleriyle
        * kalıyor: hepsi gerçek APK'da tek tek kontrol edildi ve sağlamdı,
        * ölçülmüş sorunu olmayan bir ekrana dokunmak bu projede bir kez
        * ekranı tamamen boşaltmıştı. Ayrıca burası kanıt için en güvenli yer —
        * `ForgotPassword` giriş yolunun ÜZERİNDE değil. Sahada iyi çalışırsa
        * diğerleri de taşınır.
        *
        * `bottomOffset`: odaklı alan ile klavye arasında bırakılan nefes payı.
        * Buton alanın hemen altında olduğu için tek satır yüksekliği kadarı
        * yetiyor; daha büyüğü kısa ekranlarda gereksiz kaydırma üretirdi.
        */}
      <KeyboardAwareScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={Spacing['3xl']}
      >
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Icon name="restaurant" size={40} color={Colors.brandStrong} />
            </View>
            <Text style={styles.appName}>Beli Eats</Text>
          </View>

          {sentToEmail ? (
            /* ── 2. adım: kod + yeni şifre ── */
            <View style={styles.formCard}>
              <View style={styles.stepIcon}>
                <Icon name="mail" size={32} color={Colors.brandStrong} />
              </View>

              <Text style={styles.formTitle}>Kodu gir</Text>

              <Text style={styles.stepText}>
                <Text style={styles.stepEmail}>{sentToEmail}</Text> adresi
                kayıtlıysa bir doğrulama kodu gönderdik. Kodu ve yeni şifreni
                aşağıya yaz.
              </Text>

              <Text style={styles.stepHint}>
                Gelmediyse spam klasörüne bakmayı unutma.
              </Text>

              <TextField
                label="Doğrulama kodu"
                placeholder="E-postadaki kod"
                keyboardType="number-pad"
                maxLength={CODE_MAX_LENGTH}
                autoCapitalize="none"
                value={code}
                onChangeText={setCode}
              />

              <TextField
                label="Yeni Şifre"
                placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Button
                label="Şifremi güncelle"
                onPress={handleReset}
                loading={loading}
                style={styles.primaryButton}
              />

              <Button
                label={
                  cooldown > 0 ? `Kodu tekrar gönder (${cooldown})` : 'Kodu tekrar gönder'
                }
                variant="secondary"
                onPress={handleResend}
                loading={resending}
                disabled={cooldown > 0}
                style={styles.secondaryAction}
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
            /* ── 1. adım: e-posta ── */
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Şifreni sıfırla</Text>

              <Text style={styles.stepText}>
                Hesabının e-posta adresini yaz, sana bir doğrulama kodu
                gönderelim.
              </Text>

              <TextField
                label="E-posta"
                placeholder="ornek@eposta.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Button
                label="Kod gönder"
                onPress={handleSendCode}
                loading={loading}
                style={styles.primaryButton}
              />

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.secondaryButtonText}>
                  Şifreni hatırladın mı?{' '}
                  <Text style={styles.linkText}>Giriş Yap</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  // `flex` stili SİLİNDİ: `KeyboardAvoidingView` ile birlikte gitti, tek
  // kullanıcısı oydu.
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
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    // Gölge YOK — Midas kararı, diğer iki auth ekranıyla aynı.
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  formTitle: {
    ...Type.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  stepIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  stepText: {
    ...Type.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  stepEmail: {
    color: Colors.textPrimary,
    fontWeight: Type.bodyStrong.fontWeight,
  },
  stepHint: {
    ...Type.caption,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  // Butonun GÖRÜNÜMÜ `Button` primitive'inde; burada yalnızca konumlandırma.
  primaryButton: { marginTop: Spacing.xs },
  secondaryAction: { marginTop: Spacing.sm },
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
