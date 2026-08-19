import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserRanking } from '../types';

export function useRankings(userId: string | undefined) {
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async () => {
    // Oturum henüz çözülmediyse burada durur. Çağıran taraf userId
    // değiştiğinde tekrar çağırmakla yükümlü — yoksa liste boş kalır.
    if (!userId) return;

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('user_rankings')
      // `places(*)` gömülü: fotoğraf adresleri artık `places.photo_base_urls`'ten
      // geliyor (Aşama 3). Denormalize `photo_reference` kolonu hiçbir yerde
      // okunmadığı için migration 023 ile DÜŞÜRÜLDÜ.
      //
      // ⚠️ Alt küme (`places(photo_base_urls)`) seçilmedi: `UserRanking.places`
      // tipi tam `Place` ilan ediyor ve `MapScreen` de `places(*)` kullanıyor.
      // Alt küme, tipi sessizce yalancı yapar ve ileride `places.name` okuyan
      // biri undefined alırdı. Bedeli satır başına birkaç KB.
      .select('*, places(*)')
      .eq('user_id', userId)
      .order('rank_index', { ascending: true });

    if (queryError) {
      // Ham mesaj ekrana ÇIKMIYOR (CLAUDE.md → hata mesajı kuralı): teknik
      // detay console'da, kullanıcıya kısa ve eyleme dönük metin.
      console.error('[useRankings] sıralama okunamadı:', queryError);
      setError('Sıralaman yüklenemedi. Bağlantını kontrol et.');
    } else {
      setRankings(data ?? []);
    }

    setLoading(false);
  }, [userId]);

  /**
   * Puan kaydı/güncellemesi.
   *
   * `rank_index` KURALI ARTIK BURADA DEĞİL — `upsert_user_ranking()` RPC'si
   * (migration 010) hesaplıyor: mevcut satırda sıra korunur, yenide sona
   * eklenir. Kural bir dönem hem burada hem SQL'de yaşıyordu (diary ayağı
   * gelirken bilinçli olarak ertelenmiş bir ikilikti); tek kaynak SQL oldu.
   *
   * `restaurant_name` / `photo_reference` / koordinat PARAMETRELERİ KALKTI:
   * RPC onları `places`'ten, yani kanonik kaynaktan dolduruyor. Çağıranın
   * elindeki bayat kopyayı göndermesine gerek yok.
   *
   * ÖN KOŞUL: mekanın `places` cache satırı OLMALI — RPC bunu açıkça kontrol
   * ediyor ve yoksa anlaşılır bir hata veriyor.
   */
  const addOrUpdateRanking = async (params: {
    placeId: string;
    rating: number;
    /** Boş/verilmemiş ise mevcut yorum TEMİZLENİR. */
    reviewText?: string;
  }) => {
    if (!userId) return { error: new Error('Oturum açık değil') };

    const { error: rpcError } = await supabase.rpc('upsert_user_ranking', {
      p_place_id: params.placeId,
      p_rating: params.rating,
    });

    if (rpcError) {
      // RPC'nin `raise exception` metinleri TEŞHİS içindir (hangi ön koşulun
      // atlandığını yazıyorlar), kullanıcı metni değil.
      console.error('[useRankings] puan kaydedilemedi:', rpcError);
      return { error: new Error('Puan kaydedilemedi. Tekrar dene.') };
    }

    // YORUM AYRI BİR YAZMA — bilinçli. `upsert_user_ranking`'in işi sıralama
    // kuralı ve onu diary yolu da çağırıyor; yorumu oraya koymak "parametre
    // gelmediğinde dokunma / temizle" ayrımı için fazladan bir bayrak
    // gerektirirdi (ziyaret kaydetmek mevcut yorumu silmemeli).
    //
    // Bedeli: iki tur ve atomik olmama. Puan yazılıp yorum yazılamazsa
    // kullanıcı hatayı görür ve tekrar dener; puan yazması idempotent.
    // Sıra kuralı bu yazmaya HİÇ dahil olmadığı için asıl amaç (kural tek
    // yerde) korunuyor.
    const { error: reviewError } = await supabase
      .from('user_rankings')
      .update({ review_text: params.reviewText?.trim() || null })
      .eq('user_id', userId)
      .eq('place_id', params.placeId);

    if (reviewError) {
      console.error('[useRankings] yorum kaydedilemedi:', reviewError);
      return { error: new Error('Puanın kaydedildi ama yorumun kaydedilemedi.') };
    }

    await fetchRankings();
    return { error: null };
  };

  const moveRanking = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= rankings.length) return;

    const updated = [...rankings];
    const tempRank = updated[index].rank_index;
    updated[index] = { ...updated[index], rank_index: updated[swapIndex].rank_index };
    updated[swapIndex] = { ...updated[swapIndex], rank_index: tempRank };

    // Optimistic update
    setRankings([...updated].sort((a, b) => a.rank_index - b.rank_index));

    // Persist both swapped rows
    await supabase
      .from('user_rankings')
      .update({ rank_index: updated[index].rank_index, updated_at: new Date().toISOString() })
      .eq('id', updated[index].id);

    await supabase
      .from('user_rankings')
      .update({ rank_index: updated[swapIndex].rank_index, updated_at: new Date().toISOString() })
      .eq('id', updated[swapIndex].id);
  };

  const deleteRanking = async (rankingId: string) => {
    const { error } = await supabase
      .from('user_rankings')
      .delete()
      .eq('id', rankingId);

    if (!error) {
      setRankings(prev => prev.filter(r => r.id !== rankingId));
    }
    return { error };
  };

  return { rankings, loading, error, fetchRankings, addOrUpdateRanking, moveRanking, deleteRanking };
}
