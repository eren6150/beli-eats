import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacePhotoKind } from '../../types';
import { PHOTO_KIND_TR, PHOTO_KINDS } from '../../lib/placePhotos';
import { Colors, Elevation, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Fotoğraf türü seçici — ziyarete eklenen her fotoğraf için.
 *
 * ── NEDEN SHEET, `Alert` DEĞİL ───────────────────────────────────────────────
 * Android `Alert` en fazla ÜÇ buton destekliyor; burada dört tür + iptal var.
 * `ReportPhotoSheet` tam olarak aynı sebeple yazılmıştı (dört şikayet
 * kategorisi) ve bu bileşen onun desenini birebir izliyor: aynı modal kabuğu,
 * aynı tutamaç, aynı satır dili. "+" menüsü ise `Alert`'te KALIYOR — orada
 * tam üç seçenek var (İptal / Kamera / Galeriden Seç), yani sınır aşılmıyor
 * ve ikinci bir sheet yazmanın gerekçesi yok.
 *
 * ── AÇIK/KAPALI İÇİN AYRI BAYRAK YOK ────────────────────────────────────────
 * Tek kaynak `value`: `null` iken kapalı, dolu iken açık ve o değer işaretli.
 * Ayrı bir `visible` tutmak "açık ama hangi fotoğrafın türünü değiştiriyorum
 * belli değil" ara durumunu mümkün kılardı — `RankingReviewSheet` ve
 * `ForgotPasswordScreen`'de verilen kararın aynısı.
 *
 * ── SANAL LİSTE YOK ──────────────────────────────────────────────────────────
 * Dört sabit satır için `FlatList` sıfır fayda sağlar, karşılığında
 * `ListPicker`'da bir kez yaşanan "bayat hücre" hata sınıfını getirirdi.
 *
 * ── ⚠️ `Modal` DEĞİL, MUTLAK KONUMLU KATMAN — ve bu bilinçli ────────────────
 * `ReportPhotoSheet` bir `Modal` ama o EKRAN seviyesinde render ediliyor
 * (`RestaurantDetailScreen`'de, `PhotoGrid`'in tam ekran Modal'ının KARDEŞİ
 * olarak). Bu bileşenin çağıranı ise `DiaryEntrySheet` ve o ZATEN bir Modal —
 * yani `Modal` kullanmak İÇ İÇE MODAL demekti.
 *
 * Projede iç içe Modal'ın çalıştığına dair tek bir örnek yok, dolayısıyla
 * kanıtlanmamış bir desen olurdu; üstelik `keyboard-controller` eklendiğinden
 * beri Expo Go'da test edilemiyor, yani ilk kanıt doğrudan sahada olurdu.
 * Bunun yerine kanıtlı olan yol seçildi: çağıranın Modal'ının İÇİNDE mutlak
 * konumlu bir katman.
 *
 * Bedeli: slide animasyonu yok (Modal'ın `animationType`'ı bize gelmiyor) ve
 * geri tuşunu çağıran yönetmek zorunda. İkisi de küçük; iç içe Modal riskini
 * almaya değmezdi.
 */
export interface PhotoKindSheetProps {
  /** Seçili tür — `null` ise sheet kapalı. */
  value: PlacePhotoKind | null;
  onSelect: (kind: PlacePhotoKind) => void;
  onClose: () => void;
}

export default function PhotoKindSheet({
  value,
  onSelect,
  onClose,
}: PhotoKindSheetProps) {
  const insets = useSafeAreaInsets();

  // Kapalıyken HİÇ render edilmiyor: `Modal`'ın `visible` prop'unun karşılığı.
  if (value === null) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Fotoğraf türü</Text>
              <Text style={styles.subtitle}>
                Mekan sayfasında hangi sekmede görüneceğini belirler.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {PHOTO_KINDS.map((kind) => {
            const selected = kind === value;

            return (
              <Pressable
                key={kind}
                onPress={() => onSelect(kind)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                  {PHOTO_KIND_TR[kind]}
                </Text>
                {/* Seçili olan tik alıyor; diğerlerinde yuva BOŞ bırakılıyor
                    (ok konmuyor) — bu bir gezinme değil, bir seçim. */}
                {selected ? (
                  <Icon name="check" size={18} color={Colors.brand} />
                ) : null}
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Karartma katmanın KENDİSİNDE: `Modal`'ın `transparent` + arka plan işini
  // burada elle yapıyoruz, çünkü Modal kullanmıyoruz (gerekçe dosyanın başında).
  root: {
    justifyContent: 'flex-end',
    // `DiaryEntrySheet`'in karartmasıyla AYNI token — iki katman üst üste
    // bindiğinde ton farkı göze çarpardı.
    backgroundColor: Colors.scrimMedium,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    // Gölge yukarı — sheet aşağıdan geliyor.
    ...Elevation.sheet,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerText: { flex: 1 },
  title: { ...Type.title, color: Colors.textPrimary },
  subtitle: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  rowPressed: { backgroundColor: Colors.canvasAlt },
  rowLabel: { ...Type.body, color: Colors.textPrimary },
  rowLabelSelected: {
    color: Colors.brandStrong,
    fontWeight: Type.bodyStrong.fontWeight,
    // Android ozel fontta agirlik sentezlemiyor: yuz adi da gerekli.
    fontFamily: Type.bodyStrong.fontFamily,
  },
});
