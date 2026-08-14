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
 * SAYAÇLAR ARTIK TIKLANABİLİR (Faz 3 / Diff C) — ama yalnızca "Takipçi" ve
 * "Takip". Uzun süre üçü de tıklanamazdı çünkü `FollowersList` ekranı yoktu;
 * kural buydu: tıklanabilir görünüp tepki vermemek, hiç tıklanabilir
 * görünmemekten kötü. Ekran yazılınca kural kendiliğinden karşılandı.
 * "Mekan" sayacı hâlâ düz metin: açacağı bir ekran yok, sıralama zaten hemen
 * altındaki sekmede duruyor.
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
   * Takipçi / takip sayaçları — OPSİYONEL, verilmezse sayaç düz metin kalıyor.
   *
   * Uzun süre bilinçli olarak tıklanamazlardı: `FollowersList` ekranı yoktu ve
   * "tıklanabilir görünüp tepki vermemek, hiç tıklanabilir görünmemekten
   * kötü". Ekran yazıldı, sayaçlar da o zaman açıldı.
   *
   * "Mekan" sayacı HÂLÂ tıklanamaz: onun açacağı bir ekran yok (sıralama zaten
   * hemen altındaki sekmede). Üçünü birden tıklanabilir yapmak, ikisi bir yere
   * gidip biri gitmeyen bir satır üretirdi.
   */
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
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

/**
 * Sayaç. `onPress` verilirse dokunulabilir olur ve basılı geri bildirimi
 * kazanır; verilmezse düz `View` render edilir — `disabled` bir `Pressable`
 * bırakmak "tıklanabilir görünüp tepki vermeme" olurdu (`RankRow`'un aynı
 * kararı).
 */
function Stat({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (!onPress) return <View style={styles.stat}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      {content}
    </Pressable>
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
  onPressFollowers,
  onPressFollowing,
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

      {/**
        * ── YENİ DİZİLİM (2026-08-13) ─────────────────────────────────────────
        * Eskiden avatar SOLDA, sayaçlar onun SAĞINDA tek satırdaydı ve isim
        * altta küçük (`bodyStrong`, 15px) duruyordu — yani ekranın sahibi olan
        * bilgi (kişinin adı) en zayıf tipografiye sahipti.
        *
        * Yeni sıra: avatar (küçülmüş, tek başına) → AD (`display`, 32px) →
        * @kullanıcı → bio → sayaç şeridi. Tasarım turunun çıktısı ve hiyerarşi
        * açısından da doğrusu bu: sayfa bir KİŞİYİ anlatıyor, sayılar onun
        * özeti — önce kim, sonra ne kadar.
        */}
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{initial}</Text>
        </View>
      )}

      {/* İsim / kullanıcı adı / bio */}
      <Text style={styles.name}>{primaryName}</Text>
      {showUsernameLine && <Text style={styles.username}>@{username}</Text>}
      {/**
        * ⚠️ `numberOfLines` YOK — bilinçli olarak KALDIRILDI (2026-08-13).
        *
        * Eskiden 3 satırda kırpılıyordu ve sahada bildirilen sorun şuydu: uzun
        * bir bio üç noktayla kesiliyor ama dokunmanın hiçbir karşılığı yok,
        * yani tam metne ulaşan bir yol kalmıyordu.
        *
        * ── NEDEN AÇILIR/KAPANIR (accordion) VEYA SHEET DEĞİL ────────────────
        * İkisi de "metin gerçekten kırpıldı mı" sorusunu cevaplamayı
        * gerektiriyor; `numberOfLines` uygulanmışken `onTextLayout` zaten
        * kırpılmış satır sayısını döndürüyor, yani ölçüm için görünmez bir
        * kopya çizmek ya da bir kare sınırsız render edip yanıp sönmeyi göze
        * almak gerekirdi. Ölçüm yapılmazsa kısa bio'larda TIKLANABİLİR GÖRÜNÜP
        * TEPKİ VERMEYEN bir alan doğardı — projenin açıkça reddettiği durum.
        *
        * ── NEDEN KIRPMAMAK GÜVENLİ ─────────────────────────────────────────
        * `bio` şemada 300 karakterle sınırlı (migration 004'ün CHECK'i,
        * istemcide `BIO_MAX`). En kötü ihtimalle 6-7 satır ve başlık zaten
        * kaydırılabilir içeriğin parçası. Aynı karar liste açıklaması için de
        * verilmişti ("sınırlı bir metin için ölçüm orantısız") — orada sınır
        * 500'dü, burada 300.
        */}
      {bio?.trim() ? <Text style={styles.bio}>{bio.trim()}</Text> : null}

      {/**
        * Sayaç şeridi — bio'nun ALTINDA, üstünde ince bir ayraçla.
        * Aralarındaki dikey çizgiler üç sayacı ayrı ayrı okunur kılıyor;
        * öncesinde `space-around` ile dağıtılmışlardı ve uzun sayılarda
        * hizalar kayıyordu. `flex: 1` + sol hizalama bunu sabitliyor.
        */}
      <View style={styles.statsStrip}>
        <Stat value={stats.rankings} label="Mekan" />
        <View style={styles.statDivider} />
        <Stat
          value={stats.followers}
          label="Takipçi"
          onPress={onPressFollowers}
        />
        <View style={styles.statDivider} />
        <Stat
          value={stats.following}
          label="Takip"
          onPress={onPressFollowing}
        />
      </View>

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

  /**
   * Avatar KÜÇÜLDÜ (76 → 56) ve tek başına duruyor.
   *
   * Sayaçlar yanından kalkınca 76px gereksiz yer kaplıyordu; asıl vurgu artık
   * altındaki isim. `avatarLetter` da `display` (32) yerine `title` (24)
   * kullanıyor — 56px'lik dairede 32px harf taşıyordu.
   */
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
  },
  avatarFallback: {
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    // 56px'lik dairede `display` (32) taşıyordu.
    ...Type.title,
    color: Colors.brandStrong,
  },

  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  /** Üçü eşit alan paylaşıyor; sola dayalı, böylece sayılar aynı eksende. */
  stat: { flex: 1, alignItems: 'flex-start' },
  statDivider: {
    width: 1,
    // Sabit yükseklik değil: içeriğin yüksekliğine göre değil, kısa bir
    // ayraç olarak yeterli. Sabit sayı yazı tipi ölçeğinde kırılırdı.
    alignSelf: 'stretch',
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: Spacing.sm,
  },
  statValue: {
    ...Type.heading,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Type.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  /**
   * Sayfanın asıl başlığı. `bodyStrong` (15) → `display` (32): kişinin adı
   * ekranın en güçlü tipografik öğesi olmalı.
   */
  name: {
    ...Type.display,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
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
