import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PlacePhoto } from '../types';

/**
 * TEK BİR MEKANA ait, TEK BİR kullanıcının ZİYARETE BAĞLI OLMAYAN fotoğrafları.
 *
 * `RankingReviewSheet`'i besliyor: bir puanlama kaydının okuma görünümünde,
 * o kullanıcının o mekana yüklediği kareler. Ziyaret tarafında bu simetri
 * zaten vardı (`DiaryEntryDetail` kendi ziyaretinin fotoğraflarını gösteriyor),
 * puan tarafında yoktu.
 *
 * ── ⚠️ BAŞLIK "BU PUANLAMANIN FOTOĞRAFLARI" OLAMAZ ──────────────────────────
 * Bu hook'un döndürdüğü küme İKİ FARKLI KAYNAĞI kapsıyor ve şema onları
 * AYIRT EDEMİYOR — ikisinde de `entry_id` null, `ranking_id` diye bir kolon yok:
 *
 *   1. "Puanı Kaydet" formundan yüklenenler → gerçekten puanlama anına ait
 *   2. Mekan sayfasının ızgarasından ("Menü ekle") yüklenenler → MEKANA
 *      YAPILAN KATKI, puanla ilgisi yok
 *
 * 2. kaynak KALICI bir kategori (CLAUDE.md: `menu` türü "bir ziyarete
 * oturmaz" — puanlamaya da oturmaz). Bu yüzden çağıran, kümeyi puanın malı
 * gibi etiketlemiyor: başlık **"Bu mekandaki fotoğrafların"**. Doğru ayrımı
 * yapmak şemaya kaynak işareti eklemeyi gerektirirdi ve geçmiş için backfill
 * İMKÂNSIZ olurdu (hangi eski karenin hangi puanlamaya ait olduğu bilinemez)
 * — `entry_id` backfill'inin reddedildiği aynı gerekçe.
 *
 * ── NEDEN `usePlacePhotos` DEĞİL ────────────────────────────────────────────
 * O hook mekandaki HERKESİN fotoğrafını çekiyor ve dört tür sekmesini
 * besliyor. Burada tek kullanıcının birkaç karesi isteniyor; bütün mekanı
 * indirip istemcide süzmek olurdu. `usePlaceVisits`'in `useDiary` yanında
 * ayrı durmasıyla birebir aynı gerekçe.
 *
 * ── GÖMÜLÜ KAYNAK YOK — ve bu PGRST201 RİSKİNİ DE KAPATIYOR ────────────────
 * `profiles` GÖMÜLMÜYOR: bütün satırlar zaten sheet'in konusu olan tek
 * kullanıcıya ait, yazar adı ekranda ayrıca yazıyor.
 * 🚩 Yan fayda kritik: `photo_reports` (migration 018) `place_photos` ile
 * `profiles` arasında bir ARA TABLO, yani düz `profiles(*)` yazmak PGRST201
 * ile patlardı — `usePlacePhotos` tam bu yüzden FK adını yazmak zorunda.
 * Gömmeyerek o yüzeye hiç girmiyoruz.
 * `diary_entries` de gömülmüyor: sorgu zaten `entry_id is null` süzüyor.
 *
 * ── `hidden` SÜZÜLÜYOR ──────────────────────────────────────────────────────
 * RLS başkasının gizlenmiş fotoğrafını zaten göstermiyor, ama KENDİ gizlenmiş
 * fotoğrafını gösteriyor (migration 018: `not hidden or auth.uid() = user_id`).
 * Bu şerit kompakt bir okuma yüzeyi ve "Gizlendi" etiketini çizmiyor; süzmeden
 * bırakmak gizlenmiş bir kareyi canlıymış gibi göstermek olurdu. Etiketli
 * gösterimin evi mekan sayfasının ızgarası.
 */
export function useRankingPhotos(
  userId: string | undefined,
  placeId: string | undefined
) {
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (!userId || !placeId) {
      setPhotos([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('place_photos')
      .select('*')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .is('entry_id', null)
      .eq('hidden', false)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[useRankingPhotos] fotoğraflar okunamadı:', queryError);
      setError('Fotoğraflar yüklenemedi.');
      setPhotos([]);
      setLoading(false);
      return;
    }

    setPhotos((data ?? []) as PlacePhoto[]);
    setLoading(false);
  }, [userId, placeId]);

  /** Sheet kapanınca önceki mekanın kareleri bir sonraki açılışta görünmesin. */
  const clearPhotos = useCallback(() => setPhotos([]), []);

  return { photos, loading, error, fetchPhotos, clearPhotos };
}
