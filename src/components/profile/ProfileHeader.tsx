import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Instagram tarzı profil başlığı: avatar + üç sayaç + isim/bio.
 *
 * SAYAÇLAR BU FAZDA TIKLANAMAZ — bilinçli. Tıklanabilir yapmak takipçi/takip
 * listesi ekranlarını gerektiriyor; ikisi de YOK ve `ProfileStackParamList`
 * artık onları ilan da etmiyor (var olmayan rota ilan etmek `navigate()`
 * çağrısını derletip çalışma anında patlatıyordu). Faz 3 sosyal katmanın işi.
 * Bu yüzden sayaçlarda basılı geri bildirimi veya chevron da YOK: tıklanabilir
 * görünüp tepki vermemek, hiç tıklanabilir görünmemekten kötü.
 *
 * NOT: `ProfileScreen` artık bir stack içinde (`ProfileStack`, Faz 2'de liste
 * oluşturma modal'ı için eklendi) — sayaçları bağlamanın önündeki navigasyon
 * engeli kalktı, kalan tek eksik ekranların kendisi.
 */

export interface ProfileHeaderProps {
  username: string;
  /** `profiles.full_name` — kolon henüz yok, null gelebilir. */
  fullName?: string | null;
  /** `profiles.bio` — kolon henüz yok, null gelebilir. */
  bio?: string | null;
  avatarUrl?: string | null;
  stats: {
    rankings: number;
    followers: number;
    following: number;
  };
  /** Ayarlar ikonu — şu an yalnızca çıkış eylemini açıyor. */
  onSettings: () => void;
  /**
   * "Profili düzenle" butonu — OPSİYONEL, verilmezse HİÇ render edilmiyor.
   *
   * Bu buton bir dönem bilinçli olarak yoktu: `EditProfile` ekranı olmadığı
   * için "hiçbir şey yapmayan buton dead UI'dır" kuralına takılıyordu. Ekran
   * 2026-08-06'da yazıldı, buton da o zaman geldi. Opsiyonel bırakılması
   * `RankRow`'un üç genişlemesindeki desenin aynısı — parça verilmezse
   * render edilmiyor, boş yer de tutmuyor.
   */
  onEdit?: () => void;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileHeader({
  username,
  fullName,
  bio,
  avatarUrl,
  stats,
  onSettings,
  onEdit,
}: ProfileHeaderProps) {
  // full_name yoksa username birincil isim olur; boş satır bırakmıyoruz.
  const primaryName = fullName?.trim() || username;
  const showUsernameLine = Boolean(fullName?.trim());
  const initial = primaryName.charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.container}>
      {/* Başlık şeridi — ekranın header'ı kapalı, ekran adı buradan geliyor */}
      <View style={styles.titleBar}>
        <Text style={styles.screenTitle}>Profil</Text>
        <Pressable
          onPress={onSettings}
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Ayarlar"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="settings" size={22} color={Colors.textStrong} />
        </Pressable>
      </View>

      {/* Kimlik satırı: avatar + sayaçlar */}
      <View style={styles.identityRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{initial}</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat value={stats.rankings} label="Mekan" />
          <Stat value={stats.followers} label="Takipçi" />
          <Stat value={stats.following} label="Takip" />
        </View>
      </View>

      {/* İsim / kullanıcı adı / bio */}
      <Text style={styles.name}>{primaryName}</Text>
      {showUsernameLine && <Text style={styles.username}>@{username}</Text>}
      {bio?.trim() ? (
        <Text style={styles.bio} numberOfLines={3}>
          {bio.trim()}
        </Text>
      ) : null}

      {/* Tam genişlik ikincil buton — Instagram'ın profil header'ındaki yer.
          `Button` primitive'i KULLANILMIYOR: o form butonu (dikey padding
          Spacing.md, gölgeli birincil hal). Buradaki daha ince ve sakin bir
          eylem; ölçüleri zorlamak primitive'i iki işe birden yamamak olurdu. */}
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.editBtnText}>Profili düzenle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },

  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  screenTitle: {
    ...Type.title,
    color: Colors.textPrimary,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    ...Type.display,
    color: Colors.brandStrong,
  },

  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center' },
  statValue: {
    ...Type.heading,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Type.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  name: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  username: {
    ...Type.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  bio: {
    ...Type.body,
    color: Colors.textStrong,
    marginTop: Spacing.xs,
  },

  // Gölge YOK — Midas kararı: ayrım ince kenarlıktan geliyor.
  editBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  editBtnText: {
    ...Type.captionStrong,
    color: Colors.textPrimary,
  },
});
