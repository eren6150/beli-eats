import { useState, useEffect, useCallback, useRef } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

/**
 * Bir günlük girişinin beğenileri (`entry_likes`, migration 016).
 *
 * İKİ BİLGİ, İKİ SORGU: toplam sayı ve "ben beğendim mi". Tek sorguyla almak
 * girişin TÜM beğeni satırlarını çekip içinde kendimizi aramak demekti —
 * beğeni sayısı büyüdükçe boşuna büyüyen bir yük. Sayım `head: true` ile
 * satır GÖVDESİ hiç indirilmeden alınıyor; "beğendim mi" ise tam birincil
 * anahtarla tek satır arıyor. İkisi paralel gidiyor.
 *
 * DESEN `useFollow` İLE AYNI ve bu bilinçli: ikisi de "aç/kapa + sayaç"
 * problemi. İyimser güncelleme + hatada geri alma, çift dokunma koruması,
 * yanıt sırası koruması ve `23505`'in beklenen durum sayılması orada
 * gerekçelendirildi.
 */

export function useEntryLikes(
  entryId: string | undefined,
  currentUserId: string | undefined
) {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  /** İlk okuma — buton "belirsiz" haldeyken basılmasın diye. */
  const [checking, setChecking] = useState(false);
  /** Beğen/geri al isteği sürüyor. */
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  const [error, setError] = useState<string | null>(null);

  /** Geç gelen yanıt yenisini ezmesin — `useFollow` ile aynı koruma. */
  const requestSeqRef = useRef(0);

  const fetchLikes = useCallback(async () => {
    if (!entryId) return;

    const seq = ++requestSeqRef.current;
    setChecking(true);

    const countPromise = supabase
      .from('entry_likes')
      .select('*', { count: 'exact', head: true })
      .eq('entry_id', entryId);

    // Oturum yoksa "beğendim mi" sorusunun cevabı zaten hayır; sorgu atmıyoruz.
    const likedPromise = currentUserId
      ? supabase
          .from('entry_likes')
          .select('user_id')
          .eq('entry_id', entryId)
          .eq('user_id', currentUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [countResult, likedResult] = await Promise.all([
      countPromise,
      likedPromise,
    ]);

    if (seq !== requestSeqRef.current) return; // bayat yanıt

    if (countResult.error || likedResult.error) {
      console.error(
        '[useEntryLikes] beğeniler okunamadı:',
        countResult.error ?? likedResult.error
      );
      // Sayaç ve `liked` OLDUĞU GİBİ bırakılıyor: sıfırlamak "kimse
      // beğenmemiş" demek olurdu ve bu bilinmiyor.
      setError('Beğeniler okunamadı.');
    } else {
      setError(null);
      setCount(countResult.count ?? 0);
      setLiked(!!likedResult.data);
    }

    setChecking(false);
  }, [entryId, currentUserId]);

  useEffect(() => {
    fetchLikes();
  }, [fetchLikes]);

  /**
   * Beğen / beğeniyi geri al.
   *
   * SAYAÇ DA İYİMSER güncelleniyor: buton dolarken sayının bir kare geride
   * kalması "bir şey olmadı" hissi verirdi. Hata halinde ikisi birden geri
   * alınıyor — ekranda yeni durum, veritabanında eski durum kalması sessiz
   * bir yalan olurdu (`reorderItems`'ın dersi).
   */
  const toggleLike = useCallback(async (): Promise<{
    error: PostgrestError | Error | null;
  }> => {
    if (!entryId || !currentUserId) {
      return { error: new Error('Oturum açık değil') };
    }
    if (loading || checking) return { error: null }; // çift dokunma

    const next = !liked;
    setLoading(true);
    setError(null);
    setLiked(next);
    setCount((c) => (next ? c + 1 : Math.max(0, c - 1)));

    const { error: mutationError } = next
      ? await supabase
          .from('entry_likes')
          .insert({ entry_id: entryId, user_id: currentUserId })
      : await supabase
          .from('entry_likes')
          .delete()
          .eq('entry_id', entryId)
          .eq('user_id', currentUserId);

    setLoading(false);

    if (mutationError) {
      // 23505 = zaten beğenilmiş. Başarısızlık DEĞİL, istenen son durum zaten
      // sağlanmış — `addPlaceToList` ve `useFollow` ile aynı gerekçe.
      // Sayaç yine de sunucudan tazeleniyor: yerel sayımız fazladan artmış
      // olabilir.
      if (next && (mutationError as PostgrestError).code === '23505') {
        console.warn('[useEntryLikes] giriş zaten beğenilmiş:', entryId);
        fetchLikes();
        return { error: null };
      }

      console.error('[useEntryLikes] beğeni işlemi başarısız:', mutationError);
      setLiked(!next); // GERİ AL
      setCount((c) => (next ? Math.max(0, c - 1) : c + 1));
      setError('İşlem tamamlanamadı. Tekrar dene.');
      return { error: mutationError };
    }

    return { error: null };
  }, [entryId, currentUserId, liked, loading, checking, fetchLikes]);

  return { count, liked, loading, checking, error, toggleLike, fetchLikes };
}
