import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DiaryEntry } from '../types';

/**
 * TEK BİR MEKANA ait, TEK BİR kullanıcının ziyaretleri.
 *
 * `RestaurantDetailScreen`'in "Senin Ziyaretlerin" bölümünü besliyor. Bu bölüm
 * `user_rankings` ile `diary_entries` arasındaki boşluğu kapatıyor: iki kavram
 * veritabanında `place_id` ile bağlıydı ama arayüzde hiç buluşmuyordu ("bu
 * mekana 3 kez gitmişsin" bilgisi hiçbir ekranda yoktu).
 *
 * ── NEDEN `useDiary` DEĞİL ───────────────────────────────────────────────────
 * O hook kullanıcının günlüğünün TAMAMINI çekiyor. Burada 1-3 satır göstermek
 * için bütün günlüğü indirip istemcide süzmek olurdu. `addPlaceToList`'in
 * `useListItems` yanında ayrı durmasıyla aynı gerekçe: kapsam farklı.
 *
 * ── `places(*)` GÖMÜLMÜYOR ───────────────────────────────────────────────────
 * `useDiary` onu almak zorunda (günlük satırı mekanı adıyla gösteriyor);
 * burada mekan zaten ekranın konusu, satırlar mekan kimliği çizmiyor.
 *
 * ── `profiles!diary_entries_user_id_fkey(username)` — FK ADI ŞART ────────────
 * Kullanıcı adı satırlarda GÖSTERİLMİYOR; `DiaryEntryDetail` rotasının zorunlu
 * `authorUsername` parametresi için gerekiyor ve `RestaurantDetailScreen`'in
 * elinde yalnızca `useAuth` var — o da kullanıcı adını taşımıyor. Ayrı bir
 * `profiles` sorgusu atmak yerine gömülü alınıyor: ek tur maliyeti yok.
 *
 * ⚠️ FK adı SADELEŞTİRİLEMEZ. Düz `profiles(username)` yazmak PGRST201 ile
 * patlar: `entry_likes` (migration 016) `diary_entries` ile `profiles` arasında
 * bir ARA TABLO ve PostgREST ikinci bir ilişki yolu ilan ediyor. Tam teşhis
 * CLAUDE.md → "Aktivite akışı" bölümünde; aynı hata bir kez akışı patlattı.
 *
 * ── İNDEKS: YENİ MİGRATION GEREKMİYOR ────────────────────────────────────────
 * `(user_id, place_id)` indeksi migration 009'da bilinçli olarak atlanmıştı
 * ("onu isteyen ekran v1'de yapılmıyor"). O ekran artık bu, ama mevcut
 * `idx_diary_entries_user_visited` indeksinin İLK KOLONU `user_id` — sorgu onu
 * kullanıp kalan birkaç satırda `place_id`'yi süzüyor. Arkadaş testi ölçeğinde
 * yeterli; eşik kullanıcı başına giriş sayısının büyümesi.
 */

/** `DiaryEntry` + yalnızca navigasyon için taşınan kullanıcı adı. */
export interface PlaceVisit extends DiaryEntry {
  authorUsername: string;
}

export function usePlaceVisits(
  userId: string | undefined,
  placeId: string | undefined
) {
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchVisits = useCallback(async () => {
    if (!userId || !placeId) return;

    setLoading(true);
    setError(null);

    // Sıralama `useDiary` ile aynı: `visited_at` bir TARİH (saat yok), aynı güne
    // birden çok giriş girilebiliyor — o durumda son yazılan üstte.
    const { data, error: queryError } = await supabase
      .from('diary_entries')
      .select('*, profiles!diary_entries_user_id_fkey(username)')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .order('visited_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[usePlaceVisits] ziyaretler okunamadı:', queryError);
      setError('Ziyaretlerin yüklenemedi.');
      setLoading(false);
      return;
    }

    /**
     * Gömülü kaynak normalizasyonu — `useActivityFeed` / `useFollowList` ile
     * aynı gerekçe: Supabase'in tip çıkarımı tekil ilişkileri dizi sanıyor,
     * çalışma anında nesne dönüyor. İki şekli de karşılıyoruz.
     */
    type VisitRow = DiaryEntry & {
      profiles: { username: string } | { username: string }[] | null;
    };

    const rows = (data ?? []) as unknown as VisitRow[];

    setVisits(
      rows.map((row) => {
        const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return { ...(row as DiaryEntry), authorUsername: author?.username ?? '' };
      })
    );

    setLoading(false);
  }, [userId, placeId]);

  return { visits, loading, error, fetchVisits };
}
