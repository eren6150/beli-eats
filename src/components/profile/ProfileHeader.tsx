import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';

/**
 * Instagram tarzı profil başlığı: avatar + üç sayaç + isim/bio.
 *
 * İKİ BAĞLAMDA ÇALIŞIYOR: kendi profilin (`ProfileScreen`) ve başkasınınki
 * (`UserProfileScreen`). Fark opsiyonel parçalarla anlatılıyor — verilmeyen
 * parça HİÇ render edilmiyor, boş yer de tutmuyor. `RankRow`'un üç
 * genişlemesindeki desenin aynısı:
 *
 *   kendi profilin      → `onSettings` + `onEdit`
 *   başkasının profili  → `onBack` + `follow` + `title`
 *
 * SAYAÇLAR HÂLÂ TIKLANAMAZ — bilinçli. Tıklanabilir yapmak `FollowersList`
 * ekranını gerektiriyor ve o ekran HENÜZ YOK; `ProfileStackParamList` de onu
 * ilan etmiyor (var olmayan rota ilan etmek `navigate()` çağrısını derletip
 * çalışma anında patlatıyordu). Bu yüzden sayaçlarda basılı geri bildirimi ya
 * da chevron da YOK: tıklanabilir görünüp tepki vermemek, hiç tıklanabilir
 * görünmemekten kötü. Faz 3'ün bir sonraki diff'i.
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
  /**
   * Şerit başlığı. Kendi profilinde "Profil", başkasınınkinde `@kullanici`.
   * Varsayılanı korumak `ProfileScreen`'i değiştirmeden bırakıyor.
   */
  title?: string;
  /**
   * Geri butonu — OPSİYONEL. `UserProfile` bir stack ekranı ve projede hiçbir
   * ekran native header göstermiyor, yani geri butonunu ekranın kendisi
   * çizmek zorunda. Kendi profilinde verilmiyor (sekmenin kökü, geri yok).
   */
  onBack?: () => void;
  /**
   * Ayarlar ikonu — ARTIK OPSİYONEL. Başkasının profilinde ayar diye bir şey
   * yok; verilmezse ikon hiç render edilmiyor.
   */
  onSettings?: () => void;
  /**
   * Takip butonu — OPSİYONEL, yalnızca başkasının profilinde veriliyor.
   *
   * `onEdit` ile AYNI YUVAYI paylaşıyor ve ikisi birden verilmemeli: kendi
   * profilinde düzenleme, başkasınınkinde takip. Aynı yuvada olmaları
   * bilinçli — Instagram'ın profil header'ındaki yer tek ve iki bağlamda iki
   * farklı eylem taşıyor.
   */
  follow?: {
    isFollowing: boolean;
    /** İstek sürüyor ya da durum henüz bilinmiyor → buton devre dışı. */
    busy: boolean;
    onToggle: () => void;
  };
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
  title = 'Profil',
  onBack,
  onSettings,
  follow,
  onEdit,
}: ProfileHeaderProps) {
  // full_name yoksa username birincil isim olur; boş satır bırakmıyoruz.
  const primaryName = fullName?.trim() || username;
  const showUsernameLine = Boolean(fullName?.trim());
  const initial = primaryName.charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.container}>
      {/* Başlık şeridi — ekranın header'ı kapalı, ekran adı buradan geliyor.
          Geri ve ayarlar ikonları opsiyonel; verilmeyen taraf boş bir yuva
          bırakıyor ki başlık iki bağlamda da aynı yerde dursun. */}
      <View style={styles.titleBar}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Geri"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="back" size={22} color={Colors.textStrong} />
          </Pressable>
        ) : null}

        {/* `flex: 1` — başlık kalan alanı doldurup SOLA dayalı kalıyor. Boş
            yuvalarla ortalamak `ProfileScreen`'in mevcut görünümünü
            değiştirirdi; bu ekran cihazda doğrulanmış. */}
        <Text style={styles.screenTitle} numberOfLines={1}>
          {title}
        </Text>

        {onSettings ? (
          <Pressable
            onPress={onSettings}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Ayarlar"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="settings" size={22} color={Colors.textStrong} />
          </Pressable>
        ) : null}
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

      {/* Takip butonu — aynı yuva, farklı bağlam. İki durum RENKLE ayrışıyor:
          takip etmiyorsan dolu marka rengi (eylem çağrısı), ediyorsan sakin
          kenarlıklı hal (mevcut durumun bildirimi). `busy` iken devre dışı:
          durum henüz bilinmiyorsa ya da istek sürüyorsa basılamıyor. */}
      {follow ? (
        <Pressable
          onPress={follow.onToggle}
          disabled={follow.busy}
          style={({ pressed }) => [
            styles.editBtn,
            !follow.isFollowing && styles.followBtnActive,
            (pressed || follow.busy) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: follow.busy, selected: follow.isFollowing }}
        >
          <Text
            style={[
              styles.editBtnText,
              !follow.isFollowing && styles.followBtnActiveText,
            ]}
          >
            {follow.isFollowing ? 'Takip ediliyor' : 'Takip et'}
          </Text>
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
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  screenTitle: {
    ...Type.title,
    color: Colors.textPrimary,
    // Kalan alanı doldurur; ikonlar kenarlara itilir, başlık solda kalır.
    flex: 1,
  },
  iconBtn: {
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

  // "Takip et" hali — dolu marka rengi. Gölge YOK: `Elevation.brand` form
  // butonuna ayrılmış, buradaki header içi sakin bir eylem.
  followBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  followBtnActiveText: { color: Colors.textOnBrand },
});
