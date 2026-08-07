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
