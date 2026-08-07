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

/**
 * Profil düzenleme.
 *
 * ── V1'DE YALNIZCA `full_name` ve `bio` ──────────────────────────────────────
 * `username` DIŞARIDA: `unique not null` ve migration 012'nin sonek mantığı
 * YALNIZCA kayıt anında (trigger içinde) çalışıyor. Düzenlemede çakışma olsa
 * kullanıcı ham bir `23505` görürdü — çakışma denetimi + hata metni + yeniden
 * deneme akışı ayrı ve daha büyük bir iş. Alan gizlenmiyor, KİLİTLİ ve sebebi
 * yazılı gösteriliyor: boş bırakmak "neden değiştiremiyorum" sorusunu
 * cevapsız bırakırdı.
 *
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


export default function EditProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { user } = useAuth();
  const { updateProfile } = useProfile(user?.id);

  const [fullName, setFullName] = useState(route.params?.fullName ?? '');
  const [bio, setBio] = useState(route.params?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialFullName = route.params?.fullName ?? '';
  const initialBio = route.params?.bio ?? '';

  /**
   * Boş string `null` demek: kullanıcı alanı temizleyebilmeli ve DB'de "adı
   * yok" ile "adı boş string" diye iki ayrı durum oluşmamalı.
   */
  const normalize = (v: string): string | null => v.trim() || null;

  const dirty =
    normalize(fullName) !== normalize(initialFullName) ||
    normalize(bio) !== normalize(initialBio);

  const handleSave = async () => {
    if (saving || !dirty) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await updateProfile({
      full_name: normalize(fullName),
      bio: normalize(bio),
    });

    setSaving(false);

    if (updateError) {
      // Ekrana kısa metin, konsola tam nesne (hook logluyor).
      setError('Profil kaydedilemedi. Bağlantını kontrol et.');
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
        * ⚠️ ANDROID'DE DEVRE DIŞI — `enabled` süs değil, HATANIN DÜZELTMESİ.
        *
        * Eskiden burada `behavior="height"` açıktı ("diğer üç form ekranıyla
        * aynı" gerekçesiyle). Cihazda ölçüldü (2026-08-06) ve KAV'ın yer
        * AÇMADIĞI, tam tersine yer GERİ AÇTIĞI görüldü:
        *
        *   Klavye kapalı → görünür alan 846
        *   Klavye açık   → görünür alan 455        (fark 391 = klavyenin boyu)
        *
        * Yani pencere klavye için ZATEN tam olarak küçülüyor; yapılacak bir iş
        * kalmıyor. KAV ise devreye girip forma 431px veriyordu, oysa gerçekten
        * kalan yer 455 − 92 (şerit) = 363'tü → **68px form alanı klavyenin
        * arkasına düşüyordu.** O 68px tam olarak alt boşluk + Kaydet butonu
        * kadar; butonun "yeşil bir şerit" halinde görünmesinin sebebi buydu.
        *
        * KAV neden 431 diyordu: formülü `klavye.screenY − kendi y`'sine
        * yakınsıyor (523 − 92). Ama `523` RN'in bildirdiği değer ve **914
        * birimlik tam ekran** uzayında ölçülü, uygulamanın layout uzayı ise
        * 0–846 arası. `914 − 846 = 68` — hatanın tamamı bu koordinat kayması.
        *
        * ⚠️ `paddingBottom` ile klavye boyu kadar yer açmak DENENDİ ve EKRANI
        * BOŞALTTI: alan zaten 363'e inmişken 391 daha düşünce sıfırın altına
        * geçiyor. Pencere işi yapıyorsa üstüne bir şey EKLENMEZ.
        *
        * iOS'ta AÇIK kalıyor: orada pencere klavye için küçülmüyor, KAV gerçek
        * bir iş yapıyor. `enabled={false}` iken bileşen düz bir `View` gibi
        * davranıyor (`KeyboardAvoidingView.js:235` → `bottomHeight = 0`).
        *
        * NOT: `ListFormScreen`, `LoginScreen` ve `RegisterScreen` hâlâ aynı
        * açık KAV'ı taşıyor, yani aynı 68px'lik fazlalık oralarda da var.
        * Bugün göze batmıyor (formları kısa) — AYRI diff, ayrı test turu.
        */}
      <KeyboardAvoidingView
        behavior="padding"
        enabled={Platform.OS === 'ios'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error && <ErrorBanner message={error} style={styles.banner} />}

          {/* Kilitli kullanıcı adı — gizlemek yerine sebebiyle gösteriliyor. */}
          <View style={styles.lockedGroup}>
            <Text style={styles.lockedLabel}>Kullanıcı adı</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedValue}>{route.params?.username ?? '—'}</Text>
            </View>
            <Text style={styles.lockedHint}>
              Kullanıcı adı şu an değiştirilemiyor.
            </Text>
          </View>

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
        </ScrollView>
      </KeyboardAvoidingView>
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

  lockedGroup: { marginBottom: Spacing.md },
  lockedLabel: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginBottom: Spacing.xs,
  },
  lockedBox: {
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  lockedValue: {
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    color: Colors.textMuted,
  },
  lockedHint: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },

  saveButton: { marginTop: Spacing.md },
});
