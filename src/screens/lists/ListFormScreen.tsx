import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../hooks/useAuth';
import { useLists } from '../../hooks/useLists';
import { ProfileStackParamList } from '../../types';
import { Colors, Type, Spacing, Radius } from '../../constants/theme';
import ErrorBanner from '../../components/ui/ErrorBanner';

/**
 * Liste formu — YENİ LİSTE ve LİSTEYİ DÜZENLE için TEK ekran.
 *
 * Modu `listId` parametresi belirliyor: yoksa oluşturma, varsa düzenleme.
 * İkinci bir `EditListScreen` yazmak aynı üç alanın (~200 satır) kopyası ve
 * iki formun zamanla ayrışması demekti.
 *
 * NEDEN AYRI EKRAN (modal değil inline değil): `Alert.prompt` iOS'a özel,
 * Android'de YOK. Üç alanlık bir formu satır içinde çözmek de mümkün değil.
 *
 * Native header açılmıyor (`headerShown: false`, ProfileStack'te): uygulamadaki
 * hiçbir ekran header göstermiyor, modal kendi şeridini çiziyor.
 */

/** DB CHECK'leriyle aynı sınırlar (migration 005) — kullanıcı sayacı görsün. */
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;

type RouteType = RouteProp<ProfileStackParamList, 'ListForm'>;

export default function ListFormScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const route = useRoute<RouteType>();
  const editing = route.params?.listId !== undefined;

  const { user } = useAuth();
  const { createList, updateList } = useLists(user?.id);

  // Düzenleme modunda alanlar mevcut değerlerle başlıyor. Veri route
  // parametresinden geliyor, ayrı sorgu YOK — çağıran ekranın (Profil) elinde
  // zaten tam satır var.
  const [title, setTitle] = useState(route.params?.title ?? '');
  const [description, setDescription] = useState(route.params?.description ?? '');
  const [isOrdered, setIsOrdered] = useState(route.params?.isOrdered ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0 && !saving;

  /** Hata metni kuralı: yerel doğrulama okunabilir Türkçe, Postgres hatası değil. */
  const messageFor = (e: unknown, fallback: string) =>
    e instanceof Error && !('code' in e) ? e.message : fallback;

  const handleSubmit = async () => {
    if (!canSave) return;

    setSaving(true);
    setError(null);

    // ── Düzenleme ────────────────────────────────────────────────────────────
    if (editing && route.params?.listId) {
      // `updateList` yalnızca VERİLEN alanları gönderiyor ve `updated_at`'i
      // trigger'a bırakıyor. Hiçbir şey değişmediyse boş patch ile erken
      // dönüyor — gereksiz UPDATE atılmıyor.
      const { error: updateError } = await updateList(route.params.listId, {
        title,
        description,
        isOrdered,
      });

      setSaving(false);

      if (updateError) {
        setError(messageFor(updateError, 'Liste güncellenemedi. Tekrar dene.'));
        return;
      }

      // `replace` DEĞİL: düzenleme geldiği yere (Profil) dönüyor. Liste detayı
      // açıksa da orası route parametresiyle çalıştığı için düzenleme oradan
      // BAŞLATILMIYOR (bkz. CLAUDE.md → anlık görüntü kuralı).
      navigation.goBack();
      return;
    }

    // ── Oluşturma ────────────────────────────────────────────────────────────
    const { data: created, error: createError } = await createList({
      title,
      description,
      isOrdered,
    });

    setSaving(false);

    if (createError) {
      setError(messageFor(createError, 'Liste oluşturulamadı. Tekrar dene.'));
      return;
    }

    // `replace`, `navigate` DEĞİL: modal geçmişte kalmamalı. Yeni listenin
    // detayından geri basınca profile dönülüyor, aradaki boş forma değil.
    //
    // `created` hatasız yolda dolu gelir; yine de savunmacı davranıyoruz —
    // parametresiz `ListDetail`'e gitmek çalışma anında patlardı.
    if (created) {
      navigation.replace('ListDetail', {
        listId: created.id,
        title: created.title,
        isOrdered: created.is_ordered,
        description: created.description,
      });
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Modal şeridi — native header yerine */}
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

        <Text style={styles.barTitle}>
          {editing ? 'Listeyi Düzenle' : 'Yeni Liste'}
        </Text>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : (
            <Text style={[styles.barAction, !canSave && styles.barActionDisabled]}>
              {editing ? 'Kaydet' : 'Oluştur'}
            </Text>
          )}
        </Pressable>
      </View>

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

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Liste adı</Text>
              <Text style={styles.counter}>
                {title.length}/{TITLE_MAX}
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Ankara'da en iyi kahvaltı"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
              // Düzenlemede otomatik odak YOK: kullanıcı mevcut metni okumak
              // isteyebilir, klavye ekranın yarısını kapatmasın.
              autoFocus={!editing}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Açıklama</Text>
              <Text style={styles.counter}>
                {description.length}/{DESCRIPTION_MAX}
              </Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Bu liste neyi topluyor? (opsiyonel)"
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={DESCRIPTION_MAX}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Sıralı liste</Text>
              <Text style={styles.hint}>
                Açıkken mekanlar numaralanır ve sırasını değiştirebilirsin.
                Kapalıyken eklenme sırasına göre görünür.
              </Text>
            </View>
            <Switch
              value={isOrdered}
              onValueChange={setIsOrdered}
              trackColor={{ false: Colors.borderStrong, true: Colors.brandBorder }}
              thumbColor={isOrdered ? Colors.brand : Colors.canvasAlt}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  flex: { flex: 1 },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  barTitle: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  barCancel: {
    ...Type.body,
    color: Colors.textSecondary,
  },
  barAction: {
    ...Type.bodyStrong,
    color: Colors.brandStrong,
  },
  barActionDisabled: { color: Colors.textMuted },
  pressed: { opacity: 0.6 },

  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  banner: { marginBottom: Spacing.xs },

  field: { gap: Spacing.xs },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
  },
  counter: {
    ...Type.micro,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  input: {
    // `...Type.body` SPREAD EDİLMİYOR — `lineHeight` bir TextInput'a verildiğinde
    // Android'de metni dikeyde kırpabiliyor (auth ekranlarındaki aynı gerekçe).
    fontSize: Type.body.fontSize,
    fontWeight: Type.body.fontWeight,
    fontFamily: Type.body.fontFamily,
    color: Colors.textPrimary,
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputMultiline: { minHeight: 96 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  switchText: { flex: 1, gap: Spacing.xxs },
  hint: {
    ...Type.caption,
    color: Colors.textSecondary,
  },
});
