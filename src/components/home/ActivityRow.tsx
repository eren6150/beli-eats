import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';
import StarRating from '../ui/StarRating';
import { formatVisitDate } from '../../lib/date';

/**
 * Aktivite akışı satırı — Faz 3 / Diff D.
 *
 * ── NEDEN `DiaryRow` DEĞİL, AYRI BİLEŞEN ─────────────────────────────────────
 * `DiaryRow`'un kimlik sütunu TARİH (sol tarafta, `RankRow`'un sıra sütunuyla
 * hizalı). Akışta kimlik YAZAR: "kim ne yaptı" sorusu önce cevaplanıyor,
 * tarih ikincil bir ayrıntıya düşüyor. Eksen değişiyor — `DiaryRow`'un
 * `RankRow`'dan ayrılma gerekçesinin birebir aynısı.
 *
 * `DiaryRow`'a opsiyonel bir `authorUsername` eklemek daha ucuz olurdu ama
 * tarih sütunu birincil kalırdı, yani akışta yanlış hiyerarşi.
 *
 * Görsel dil AYNI: avatar dairesi `ProfileHeader`/`FollowersList` ile, satır
 * ayrımı tek alt çizgiyle (Midas kararı), yıldızlar `StarRating` ile.
 *
 * ── BEĞENİ SAYACI VAR, BUTON YOK ─────────────────────────────────────────────
 * Buton satır başına "ben beğendim mi" sorgusu gerektirirdi (20 öğe = 20
 * istek). Sayaç gömülü sayımla bedavaya geliyor. Dokununca ziyaret detayı
 * açılıyor ve buton orada.
 */

export interface ActivityRowProps {
  authorUsername: string;
  authorAvatarUrl?: string | null;
  placeName: string;
  placePhotoUrl?: string | null;
  /** `YYYY-MM-DD` — ziyaretin tarihi (paylaşım tarihi değil). */
  visitedAt: string;
  rating?: number | null;
  note?: string | null;
  likeCount: number;
  onPress: () => void;
  /** Yazara dokunmak profiline gider; verilmezse ad tıklanamaz. */
  onPressAuthor?: () => void;
  style?: ViewStyle;
}

export default function ActivityRow({
  authorUsername,
  authorAvatarUrl,
  placeName,
  placePhotoUrl,
  visitedAt,
  rating,
  note,
  likeCount,
  onPress,
  onPressAuthor,
  style,
}: ActivityRowProps) {
  const initial = authorUsername.charAt(0).toUpperCase() || '?';
  const trimmedNote = note?.trim();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, style]}
      accessibilityRole="button"
    >
      {/* ── Üst satır: kim, ne zaman ── */}
      <View style={styles.header}>
        <Pressable
          onPress={onPressAuthor}
          disabled={!onPressAuthor}
          style={({ pressed }) => [styles.authorTap, pressed && styles.pressed]}
          accessibilityRole={onPressAuthor ? 'button' : undefined}
        >
          {authorAvatarUrl ? (
            <Image source={{ uri: authorAvatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )}
          <Text style={styles.authorName} numberOfLines={1}>
            @{authorUsername}
          </Text>
        </Pressable>

        <Text style={styles.date}>{formatVisitDate(visitedAt)}</Text>
      </View>

      {/* ── Mekan + puan ── */}
      <View style={styles.body}>
        {placePhotoUrl ? (
          <Image source={{ uri: placePhotoUrl }} style={styles.placePhoto} />
        ) : (
          <View style={[styles.placePhoto, styles.placePhotoFallback]}>
            <Icon name="restaurant" size={20} color={Colors.textMuted} />
          </View>
        )}

        <View style={styles.placeInfo}>
          <Text style={styles.placeName} numberOfLines={2}>
            {placeName}
          </Text>
          {/* Puansız giriş mümkün (diary'nin ana kararı) — o durumda yıldızlar
              HİÇ render edilmiyor, "0 yıldız" göstermek yanlış olurdu. */}
          {rating != null && (
            <StarRating rating={rating} size={14} style={styles.stars} />
          )}
        </View>
      </View>

      {/* ── Not önizlemesi ── tam metin ziyaret detayında. */}
      {trimmedNote ? (
        <Text style={styles.note} numberOfLines={2}>
          {trimmedNote}
        </Text>
      ) : null}

      {/* Sıfır beğeni satırı gürültülendirmesin — hiç gösterilmiyor. */}
      {likeCount > 0 ? (
        <View style={styles.likeRow}>
          <Icon name="heartActive" size={13} color={Colors.textMuted} />
          <Text style={styles.likeCount}>{likeCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Kart değil SATIR — ayrım tek alt çizgiden geliyor (Midas kararı).
  row: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: Spacing.sm,
  },
  rowPressed: { backgroundColor: Colors.canvasAlt },
  pressed: { opacity: 0.6 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  authorTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    ...Type.captionStrong,
    color: Colors.brandStrong,
  },
  authorName: {
    ...Type.captionStrong,
    color: Colors.textPrimary,
    flex: 1,
  },
  date: {
    ...Type.micro,
    color: Colors.textMuted,
  },

  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  placePhoto: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
  },
  placePhotoFallback: {
    backgroundColor: Colors.canvasAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeInfo: { flex: 1, gap: Spacing.xxs },
  placeName: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  stars: { alignSelf: 'flex-start' },

  note: {
    ...Type.caption,
    color: Colors.textStrong,
  },

  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  likeCount: {
    ...Type.micro,
    color: Colors.textMuted,
  },
});
