import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserRanking } from '../types';

/**
 * TEK BİR MEKANA ait, TÜM kullanıcıların puan kayıtları.
 *
 * ── NEYİ BESLİYOR ────────────────────────────────────────────────────────────
 * Fotoğraf ızgarasının dokunma çözümlemesinin İKİNCİ dalı: `entry_id`'si boş
 * bir kareye dokunulduğunda, o kareyi YÜKLEYEN kişinin bu mekandaki puan
 * kaydı varsa `RankingReviewSheet` açılıyor. Bağ `place_photos`'ta bir kolon
 * DEĞİL, `user_rankings`'in `unique(user_id, place_id)` kısıtından türetiliyor
 * ("Karar E" — yeni kolon eklenmedi, migration gerekmedi).
 *
 * ── NEDEN `useRankings` DEĞİL ────────────────────────────────────────────────
 * O hook TEK BİR KULLANICININ tüm sıralamasını çekiyor; buradaki eksen tam
 * tersi (tek mekan, çok kullanıcı). Ekranın mevcut `useRankings(user.id)`
 * örneği yalnızca oturum sahibinin kaydını biliyor, yani arkadaşının
 * fotoğrafına dokunulduğunda elde hiçbir şey yok. `usePlaceVisits`'in
 * `useDiary` yanında ayrı durmasıyla aynı gerekçe: kapsam farklı.
 *
 * ── NEDEN DOKUNMA ANINDA DEĞİL, ÖNCEDEN ──────────────────────────────────────
 * Karar dokunuşla aynı karede verilebilsin diye. Dokununca sorgu atmak, kareye
 * basıp birkaç yüz ms boş beklemek demekti — harita POI'sinde reddedilen
 * desen ("önce karar, sonra aç"). Bedeli mekan başına TEK ek sorgu.
 *
 * ── MALİYET ──────────────────────────────────────────────────────────────────
 * `place_id` indeksi migration 003'te zaten var (`idx_user_rankings_place_id`)
 * ve okuma politikası serbest (`using (true)`). Satırlar `review_text`
 * taşıyor — sınırsız bir alan (bilinen tutarsızlık), ama zaten gösterilecek
 * olan metin bu; ayrıca bir mekanı puanlayan kişi sayısı bu ölçekte küçük.
 * Eşik: mekan başına puanlayan sayısının büyümesi.
 */
export function usePlaceRankings(placeId: string | undefined) {
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  /**
   * Hata state'i YOK — bilinçli.
   *
   * Bu bir KOLAYLIK verisi: gelmezse dokunuş sessizce eski davranışa (tam ekran
   * görüntüleyici) düşüyor, hiçbir şey kırılmıyor. Ekranda zaten iki hata
   * şeridi var (fotoğraf + mekan) ve üçüncüsü, kullanıcının hiç fark etmediği
   * bir eksiklik için gürültü olurdu. Ham hata konsola gidiyor.
   */
  const fetchPlaceRankings = useCallback(async () => {
    if (!placeId) return;

    const { data, error } = await supabase
      .from('user_rankings')
      .select('*')
      .eq('place_id', placeId);

    if (error) {
      console.error('[usePlaceRankings] puanlar okunamadı:', error);
      return;
    }

    setRankings((data ?? []) as UserRanking[]);
  }, [placeId]);

  /** Bir kullanıcının bu mekandaki puan kaydı — yoksa `null`. */
  const rankingOf = useCallback(
    (userId: string | undefined): UserRanking | null =>
      (userId && rankings.find((r) => r.user_id === userId)) || null,
    [rankings]
  );

  return { rankingOf, fetchPlaceRankings };
}
