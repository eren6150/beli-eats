import { useState, useCallback, useMemo } from 'react';
import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useBlocks } from './useBlocks';
import { removePhotoObjects } from '../lib/placePhotos';
import { PlacePhoto, PlacePhotoKind } from '../types';

type MutationError = PostgrestError | Error;

/**
 * Bir mekanın fotoğrafları.
 *
 * TÜRE GÖRE FİLTRELEME İSTEMCİDE, sorguda DEĞİL — bilinçli. Sekme değiştirmek
 * yeni bir istek atmıyor; bir mekanın fotoğraf sayısı (arkadaş testi ölçeğinde
 * ve sonrasında da) tek seferde çekilecek kadar az. Sekme başına sorgu atmak
 * dört kat istek ve her sekme geçişinde spinner demekti.
 *
 * Sunucu tarafı indeks yine de `(place_id, kind, created_at desc)`: ileride
 * sayfalama gerekirse sorgu türe göre daraltılabilir, indeks hazır.
 */
export function usePlacePhotos(placeId: string | undefined) {
  const [rawPhotos, setRawPhotos] = useState<PlacePhoto[]>([]);
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

  const photos = useMemo(() => {
    if (!blocksReady) return [];
    if (blocked.size === 0) return rawPhotos;
    return rawPhotos.filter((p) => !blocked.has(p.user_id));
  }, [rawPhotos, blocked, blocksReady]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata mesajı değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (!placeId) return;

    setLoading(true);
    setError(null);

    /**
     * ⚠️ `profiles!place_photos_user_id_fkey` — FK ADI ŞART, SADELEŞTİRME.
     *
     * Düz `profiles(*)` yazmak bu sorguyu PGRST201 ile patlatıyor. Sebep:
     * `place_photos` ile `profiles` arasında PostgREST'in seçebileceği İKİ yol
     * var —
     *   1. doğrudan FK → `place_photos_user_id_fkey` (many-to-one, istediğimiz)
     *   2. `photo_reports` üzerinden dolaylı (many-to-many)
     * İkincisi MİGRATION 018 ile doğdu: `photo_reports`'un birincil anahtarı
     * `(photo_id, user_id)` ve ikisi de FK, yani PostgREST'in ARA TABLO
     * tanımına uyuyor ve ilişkiyi kendiliğinden ilan ediyor.
     *
     * ⚠️ BU HATA İKİNCİ KEZ OLDU. Birincisi `useActivityFeed`'di ve
     * `entry_likes` (migration 016) yüzündendi; ders CLAUDE.md'ye
     * genelleştirilmiş bir kural olarak yazıldı ama 018 yazılırken MEVCUT
     * SORGULARA KARŞI TARANMADI. Bu sorgu 018'den önce yazılmıştı ve
     * çalışıyordu — kuralın "çalışan eskisi de bozulur" kısmı tam olarak bu.
     *
     * ── `diary_entries!place_photos_entry_fk` — DOKUNMA ÇÖZÜMLEMESİ İÇİN ─────
     * `entry_id` tek başına yetmiyor: `DiaryEntryDetail` rotası ziyaretin
     * tarihini, puanını ve notunu ZORUNLU istiyor (anlık görüntü kuralı).
     * Dokunma anında ayrı bir sorgu atmak, kareye basıp birkaç yüz ms hiçbir
     * şey olmaması demekti — projenin harita POI'sinde reddettiği desen
     * ("önce karar, sonra aç"). Gömülü almanın ek tur maliyeti YOK.
     *
     * FK adı burada da ŞART. Migration 020 `place_photos` ile `diary_entries`
     * arasında FK açtı ve `places` ↔ `diary_entries` arasında ikinci bir yol
     * doğurdu; `place_photos`'ın PK'sı kendi `id`'si olduğu için ara tablo
     * sayılmıyor, yani PGRST201'in tetiklenmesi BEKLENMİYOR — ama bu sınıf
     * sahada iki kez kırdı ve ayrıştırmanın bedeli sıfır.
     */
    const { data, error: queryError } = await supabase
      .from('place_photos')
      .select(
        '*, profiles!place_photos_user_id_fkey(*), diary_entries!place_photos_entry_fk(id, visited_at, rating, note)'
      )
      .eq('place_id', placeId)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[usePlacePhotos] fotoğraflar okunamadı:', queryError);
      setError('Fotoğraflar yüklenemedi. Bağlantını kontrol et.');
    } else {
      /**
       * Gömülü kaynak normalizasyonu — `usePlaceVisits` / `useActivityFeed` ile
       * aynı gerekçe: tekil (many-to-one) ilişkiler çalışma anında NESNE
       * dönüyor ama dizi olarak da gelebiliyor. İki şekli de karşılıyoruz;
       * `profiles` için bu zaten tüketici tarafında yapılıyordu.
       */
      type PhotoRow = Omit<PlacePhoto, 'diary_entries'> & {
        diary_entries?:
          | PlacePhoto['diary_entries']
          | NonNullable<PlacePhoto['diary_entries']>[]
          | null;
      };

      const rows = (data ?? []) as unknown as PhotoRow[];

      setRawPhotos(
        rows.map((row) => ({
          ...(row as PlacePhoto),
          diary_entries: Array.isArray(row.diary_entries)
            ? (row.diary_entries[0] ?? null)
            : (row.diary_entries ?? null),
        }))
      );
    }

    setLoading(false);
  }, [placeId]);

  /** Tek bir türün fotoğrafları — sekmeler bunu kullanıyor. */
  const byKind = useCallback(
    (kind: PlacePhotoKind) => photos.filter((p) => p.kind === kind),
    [photos]
  );

  /** Sekme başlıklarındaki sayılar. */
  const countOf = useCallback(
    (kind: PlacePhotoKind) => photos.filter((p) => p.kind === kind).length,
    [photos]
  );

  /**
   * Fotoğrafı siler.
   *
   * ⚠️ ÖNCE SATIR, SONRA NESNELER — yükleme akışının TERSİ, ve bilinçli.
   * Satır gidince fotoğraf arayüzden hemen kaybolur; Storage silme başarısız
   * olursa geriye yalnızca öksüz nesne kalır (görünmez, küçük). Ters sırada
   * ise nesne silinip satır kalsaydı ızgarada KIRIK KARE görünürdü.
   *
   * Storage silme hatası kullanıcıya YANSITILMIYOR: onun açısından iş bitti,
   * fotoğraf gitti. Konsola düşüyor.
   */
  const removePhoto = async (
    photo: PlacePhoto
  ): Promise<{ error: MutationError | null }> => {
    const { error: deleteError } = await supabase
      .from('place_photos')
      .delete()
      .eq('id', photo.id);

    if (deleteError) {
      console.error('[usePlacePhotos] fotoğraf satırı silinemedi:', deleteError);
      return { error: deleteError };
    }

    // Paylaşılan yardımcı: aynı sıra ve aynı hata politikası `removeEntry`'de
    // de gerekiyor (ziyaret silinince cascade satırları götürüyor ama
    // nesneleri bırakıyor). İki kopya zamanla ayrışırdı.
    await removePhotoObjects([photo.storage_path, photo.thumb_path]);

    setRawPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    return { error: null };
  };

  return { photos, loading, error, fetchPhotos, byKind, countOf, removePhoto };
}
