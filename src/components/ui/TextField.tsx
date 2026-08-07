import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';

/**
 * Etiketli metin alanı — form ekranlarının ortak parçası.
 *
 * ── NEDEN ŞİMDİ ÇIKARILDI ────────────────────────────────────────────────────
 * `LoginScreen` ve `RegisterScreen` aynı `inputGroup` + `label` + `input`
 * bloğunu birebir taşıyordu ve bu tekrar BİLİNÇLİ olarak bırakılmıştı: iki
 * ekran için primitive çıkarmak erken soyutlama olurdu. CLAUDE.md tetikleyiciyi
 * açıkça yazmıştı — **üçüncü bir form ekranı gelirse**. `EditProfile` o üçüncü.
 *
 * ── ⚠️ `...Type.X` SPREAD EDİLMİYOR ──────────────────────────────────────────
 * `lineHeight` bir `TextInput`'a verildiğinde Android'de metni dikeyde
 * kırpabiliyor (`StarRating`'de aynı sınıf sorun yaşanmıştı, `DiaryEntrySheet`
 * ve auth ekranları da bu yüzden token'ları tek tek okuyor). Değer yine tek
 * kaynaktan geliyor, riskli özellik dışarıda kalıyor.
 *
 * ── KENARLIK KALINLIĞI SABİT ─────────────────────────────────────────────────
 * `borderWidth: 1.5` + saydam renk: odaklanma/hata durumu rengi değiştiriyor,
 * kalınlığı değil. Kalınlık değişseydi içerik zıplardı.
 */

/** Çok satırlı alanın açılış yüksekliği (~3 satır). */
const MULTILINE_MIN_HEIGHT = 88;
/**
 * Çok satırlı alanın TAVANI (~6 satır). Bunu aşınca kutu büyümeyi bırakıp
 * kendi içinde kayıyor — gerekçe `inputMultiline` stilinde.
 */
const MULTILINE_MAX_HEIGHT = 160;

export interface TextFieldProps extends TextInputProps {
  label: string;
  /** Sağ üstte sayaç — `maxLength` ile birlikte anlamlı. */
  showCounter?: boolean;
  /** Alan altındaki kısa açıklama ya da kısıt bilgisi. */
  hint?: string;
  /** Doluysa kenarlık ve yardım metni hata rengine döner. */
  error?: string | null;
  containerStyle?: ViewStyle;
}

export default function TextField({
  label,
  showCounter,
  hint,
  error,
  containerStyle,
  value,
  maxLength,
  multiline,
  style,
  ...inputProps
}: TextFieldProps) {
  const length = typeof value === 'string' ? value.length : 0;
  const helper = error ?? hint;

  return (
    <View style={[styles.group, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {showCounter && maxLength ? (
          <Text style={styles.counter}>
            {length}/{maxLength}
          </Text>
        ) : null}
      </View>

      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error ? styles.inputError : null,
          style,
        ]}
        value={value}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        placeholderTextColor={Colors.textMuted}
        {...inputProps}
      />

      {helper ? (
        <Text style={[styles.helper, error ? styles.helperError : null]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.md },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    ...Type.captionStrong,
    color: Colors.textStrong,
    marginBottom: Spacing.xs,
  },
  counter: {
    ...Type.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    // Sayaç değişirken satır genişliği oynamasın.
    fontVariant: ['tabular-nums'],
  },
  input: {
    // Bkz. dosya başındaki uyarı: spread YOK, token'lar tek tek.
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
  /**
   * ⚠️ `maxHeight` ŞART — bir düzeltme, süs değil.
   *
   * Sınırsız bir `multiline` TextInput metin uzadıkça BÜYÜMEYE devam ediyor ve
   * imleç onunla birlikte aşağı kayıyor. RN bir girdiyi görünür alana YALNIZCA
   * ODAKLANDIĞI ANDA kaydırıyor, büyürken tekrar kaydırmıyor — sonuç: yazdığın
   * satır klavyenin altında kalıyor ve elle kaydırmak gerekiyor.
   *
   * Sınırı koyunca kutu büyümeyi bırakıyor ve TextInput KENDİ İÇİNDE kayıyor;
   * RN de imleci kendi sınırları içinde görünür tutuyor.
   *
   * `KeyboardAvoidingView`'ı değiştirmek bu sorunu ÇÖZMEZ — o yapılandırma
   * zaten doğru (`flex: 1` + Android'de `'height'`). Bu, `DiaryEntrySheet`'in
   * "kırpılan sabit eleman" vakasıyla aynı AİLEDEN ama farklı MEKANİZMA.
   *
   * Ham sayılar sabit olarak duruyor: bunlar `Spacing` ölçeğine ait layout
   * boşlukları değil, bileşene özgü ölçüler (`HERO_HEIGHT`, `LOGO_SIZE` gibi).
   * Çağıran `style` ile ezebilir — dizide en sonda uygulanıyor.
   */
  inputMultiline: {
    minHeight: MULTILINE_MIN_HEIGHT,
    maxHeight: MULTILINE_MAX_HEIGHT,
  },
  inputError: { borderColor: Colors.danger },
  helper: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  helperError: { color: Colors.danger },
});
