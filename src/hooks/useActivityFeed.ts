import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBlocks } from './useBlocks';
import { DiaryEntry, Profile } from '../types';

/**
 * Takip edilenlerin aktivite akışı — Faz 3 / Diff D.
 *
 * ── AKIŞIN KONUSU ZİYARETLER, PUANLAMALAR DEĞİL ─────────────────────────────
 * Öğeler `diary_entries`'ten geliyor, `user_rankings`'ten DEĞİL. Sıralama bir
 * DURUM (bu mekan hakkında ne düşünüyorum), akış ise OLAY listesi. Bir
 * sıralama satırının tarihi ve notu yok; anlatacak bir hikâyesi de yok.
 *
 * ⚠️ SESSİZ PUANLAMA AKIŞA DÜŞMÜYOR — eksiklik değil, ÜRÜN KARARI.
 * Mekan sayfasından "Puanı Kaydet" demek yalnızca `user_rankings` yazıyor,
 * günlük girişi yaratmıyor. Bu bilinçli: **mekan sayfası puanlamanın evi,
 * günlük ise deneyim/anı kaydının evi.** Akış deneyimleri gösteriyor, o
 * yüzden sessiz bir puanlamanın burada yeri yok. Tam gerekçe CLAUDE.md →
 * "Puanlama ile günlük arasındaki iş bölümü".
 *
 * İki kaynağı birleştirmek AYRICA sorunlu olurdu: puanlı bir ziyaret HEM
 * giriş HEM sıralama yazıyor, yani aynı eylem akışta iki kez görünürdü ve
 * tekilleştirme (kullanıcı + mekan + ~zaman) kırılgan olurdu.
 *
 * ── `created_at`'E GÖRE SIRALI, `visited_at`'E GÖRE DEĞİL ────────────────────
 * Akış "ne zaman paylaşıldı" sorusunu cevaplıyor. Üç ay önceki bir ziyareti
 * bugün kaydeden kişi EN ÜSTTE çıkmalı; `visited_at`'e göre sıralamak o
 * girişi geçmişe gömerdi. Letterboxd'un akışı da böyle çalışıyor.
 *
 * ── RPC GEREKMİYOR (migration 015 sayesinde) ─────────────────────────────────
 * `diary_entries`'in SELECT politikası bir dönem sahiplik istiyordu ve bu
 * yüzden "sosyal özellikler `security definer` RPC gerektirir" diye not
 * düşülmüştü. Migration 015 günlüğü herkese açtı; akış artık takip
 * edilenlerin girişlerini DOĞRUDAN sorguluyor.
 *
 * ── BEĞENİ SAYISI GÖMÜLÜ, N+1 YOK ───────────────────────────────────────────
 * `entry_likes(count)` — `useLists`'in liste öğe sayısını aldığı yolun
 * aynısı. Satır başına ayrı sorgu atmak 20 öğede 20 istek demekti.
 * Beğeni BUTONU akışta YOK: o "ben beğendim mi" bilgisini gerektirir, yani
 * satır başına bir sorgu daha. Dokununca detaya gidiliyor, buton orada.
 */

export interface ActivityItem {
  entry: DiaryEntry;
  author: Pick<Profile, 'id' | 'username' | 'avatar_url'>;
  likeCount: number;
}

/** v1'de sayfalama yok — arkadaş testi ölçeğinde 20 fazlasıyla yeterli. */
const FEED_LIMIT = 20;

export function useActivityFeed(userId: string | undefined) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  const [error, setError] = useState<string | null>(null);
  /**
   * "Kimseyi takip etmiyorum" ile "takip ediyorum ama girişleri yok" AYRI
   * durumlar ve ekranda farklı metin gösteriyorlar. Boş listeyi tek bir
   * mesajla karşılamak ikisini birden yanlış anlatırdı.
   */
  const [followsAnyone, setFollowsAnyone] = useState(true);

  const fetchFeed = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    // 1) Kimi takip ediyorum?
    //
    // `userId` yoksa bu sorgu HİÇ atılmıyor: `follower_id` uuid kolonu ve boş
    // string Postgres'te 22P02 ile 400 döndürüyor (mevcut koddan taşınan not).
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followsError) {
      console.error('[useActivityFeed] takip listesi okunamadı:', followsError);
      setError('Akış yüklenemedi. Bağlantını kontrol et.');
      setLoading(false);
      return;
    }

    const followingIds = (follows ?? []).map((f) => f.following_id as string);

    if (followingIds.length === 0) {
      setFollowsAnyone(false);
      setItems([]);
      setLoading(false);
      return;
    }

    setFollowsAnyone(true);

    // 2) Onların girişleri + mekan + yazar + beğeni sayısı — TEK sorgu.
    //
    // ⚠️ `profiles!diary_entries_user_id_fkey` — FK ADI ŞART, SADELEŞTİRME.
    // Düz `profiles(...)` yazmak bu sorguyu PGRST201 ile patlatıyor (cihazda
    // görüldü, PostgREST'in `hint` alanıyla doğrulandı). Sebep: `diary_entries`
    // ile `profiles` arasında PostgREST'in seçebileceği İKİ yol var —
    //   1. doğrudan FK  → `diary_entries_user_id_fkey` (many-to-one, istediğimiz)
    //   2. `entry_likes` üzerinden dolaylı (many-to-many)
    // İkincisi migration 016 ile doğdu: `entry_likes`'ın birincil anahtarı
    // `(entry_id, user_id)` ve ikisi de FK — yani PostgREST'in ARA TABLO
    // (junction) tanımına birebir uyuyor, ilişkiyi otomatik ilan ediyor.
    // Aynı desen `useFollow`'da iki yön için zaten kullanılıyor.
    //
    // ⚠️ `places!diary_entries_place_fk` — bu da SADELEŞTİRİLMEMELİ (2026-08-11).
    // Migration 020 `place_photos`'a `entry_id` ekleyerek `places` ile
    // `diary_entries` arasında İKİNCİ bir yol açtı (doğrudan FK +
    // `place_photos` üzerinden). `place_photos`'ın kendi `id` PK'sı olduğu için
    // PostgREST'in ara tablo tanımına uymuyor, yani tetiklenmesi BEKLENMİYOR —
    // ama bu sınıf sahada iki kez kırdı ve tahmine dayanmanın karşılığı yok.
    // Ayrıştırma tek yol varken de geçerli, bedeli sıfır.
    //
    // `entry_likes(count)` ayrıştırma İSTEMİYOR: ona giden tek yol var.
    const { data, error: feedError } = await supabase
      .from('diary_entries')
      .select(
        '*, places!diary_entries_place_fk(*), profiles!diary_entries_user_id_fkey(id, username, avatar_url), entry_likes(count)'
      )
      .in('user_id', followingIds)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT);

    if (feedError) {
      console.error('[useActivityFeed] akış okunamadı:', feedError);
      setError('Akış yüklenemedi. Bağlantını kontrol et.');
      setLoading(false);
      return;
    }

    /**
     * Gömülü kaynak normalizasyonu — `useFollowList` ve `HomeScreen` ile aynı
     * gerekçe: Supabase'in çıkarımı tekil ilişkileri dizi sanıyor, çalışma
     * anında nesne dönüyor. `any` ile geçiştirmek yerine iki şekli de
     * karşılıyoruz.
     *
     * `entry_likes` ise GERÇEKTEN dizi: PostgREST sayımı `[{ count: n }]`
     * şeklinde döndürüyor (`itemCountOf` da aynı şekli okuyor).
     */
    type FeedRow = DiaryEntry & {
      profiles: ActivityItem['author'] | ActivityItem['author'][] | null;
      entry_likes?: { count: number }[] | null;
    };

    const rows = (data ?? []) as unknown as FeedRow[];

    setItems(
      rows
        .map((row) => {
          const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          // Yazar satırı çözülemezse öğeyi atıyoruz: kimin yaptığı
          // bilinmeyen bir aktivite gösterilemez.
          if (!author?.id) return null;

          return {
            entry: row as DiaryEntry,
            author,
            likeCount: row.entry_likes?.[0]?.count ?? 0,
          };
        })
        .filter((item): item is ActivityItem => item !== null)
    );

    setLoading(false);
  }, [userId]);


/**
 * ⚠️ ENGEL FİLTRESİ TÜRETİLMİŞ, fetch anında DEĞİL.
 *
 * Sorguya `.not(...)` eklemek cazipti ama yarışı çözmüyor: engel listesi
 * (`useBlocks`) asenkron geliyor ve sorgu ondan ÖNCE dönerse engellenen
 * içerik ekrana düşer. Türetilmiş filtre, liste geç gelse bile kendiliğinden
 * yeniden süzüyor.
 *
 * ⚠️ `ready` KONTROLÜ ŞART: `blocked` boş olmak "engel yok" demek DEĞİL,
 * "henüz bilmiyorum" da olabilir. Bilinmezken ham listeyi göstermek, tam
 * olarak gizlenmesi gereken şeyi bir kare göstermek olurdu.
 */
  const { blocked, ready: blocksReady } = useBlocks();

  const visibleItems = useMemo(() => {
    if (!blocksReady) return [];
    if (blocked.size === 0) return items;
    return items.filter((it) => !blocked.has(it.entry.user_id));
  }, [items, blocked, blocksReady]);

  return { items: visibleItems, loading, error, followsAnyone, fetchFeed };
}
