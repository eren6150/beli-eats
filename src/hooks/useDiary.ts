import { useState, useCallback } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { removePhotoObjects } from '../lib/placePhotos';
import { DiaryEntry } from '../types';

/**
 * Kullanıcının ziyaret günlüğü (migration 009 + 010).
 *
 * KAPSAM: `userId` ile verilen kullanıcının girişleri — kendi profilinde
 * oturum sahibi, `UserProfile`'da başkası.
 *
 * ⚠️ `user_id` FİLTRESİ ARTIK TEK KAPI (migration 015). Eskiden SELECT
 * politikası da sahiplik istiyordu (`auth.uid() = user_id`) ve bu filtre
 * "ikinci bir kapı"ydı. Günlük herkese açıldığı için artık öyle değil:
 * filtreyi kaldırmak ya da unutmak, kullanıcının kendi günlük sekmesine
 * HERKESİN girişlerini düşürür. `MapScreen`'in bir dönem filtresiz olup
 * herkesin puanladığı mekanları çizmesiyle aynı hata sınıfı.
 *
 * Yazma yolları etkilenmedi: INSERT/UPDATE/DELETE politikaları hâlâ sahiplik
 * istiyor, yani başkasının girişi görülebiliyor ama değiştirilemiyor.
 *
 * SÖZLEŞME — `userId` yoksa `fetchEntries` hiçbir şey yapmaz. Çağıran ekran
 * `useFocusEffect(useCallback(..., [fetchEntries]))` kalıbıyla tetikler; bu
 * kalıp `useAuth` Context'e çevrildikten sonra da duruyor çünkü ikinci bir iş
 * görüyor: ekrana her dönüşte veriyi tazelemek.
 */

type MutationError = PostgrestError | Error;

export interface DiaryEntryInput {
  placeId: string;
  /** `YYYY-MM-DD`. Verilmezse sunucu bugünü yazıyor. */
  visitedAt?: string;
  /** Verilmezse giriş yalnızca günlükte kalır, sıralamaya girmez. */
  rating?: number | null;
  note?: string | null;
  /**
   * Puan verildiğinde `user_rankings` de güncellensin mi (migration 017).
   *
   * VARSAYILAN `true` — bugünkü davranış. Kullanıcı "Ziyaret Ekle" formundaki
   * "Sıralamamı da güncelle" anahtarını kapatırsa `false` geliyor ve puan
   * YALNIZCA günlükte kalıyor.
   *
   * `rating` yoksa bu alanın hiçbir etkisi yok: puansız log zaten sıralamaya
   * girmiyor.
   */
  updateRanking?: boolean;
}

/**
 * Yeni ziyaret kaydı — hook'tan bağımsız, saf fonksiyon.
 *
 * NEDEN HOOK DIŞINDA: girişi ekleyen ekran (`RestaurantDetail`'in ziyaret
 * sheet'i) günlüğün TAMAMINI okumuyor; hook'u kullanmak her kayıtta gereksiz
 * bir liste sorgusu demekti. `addPlaceToList`'in `useListItems` yanında
 * durmasıyla aynı desen.
 *
 * YAZMA YOLU YALNIZCA `log_diary_entry()` RPC'si (migration 010) — doğrudan
 * `insert` YAPILMIYOR. Sebep: puan verildiğinde aynı işlem `user_rankings`'i
 * de güncellemek zorunda (sıra korunarak) ve iki yazma tek transaction'da
 * olmalı. İstemciden iki ayrı çağrı, günlükte 4.5 yıldız görünürken
 * sıralamada eski puanın kalmasına yol açardı.
 *
 * `rank_index` İSTEMCİDE HESAPLANMIYOR — sunucuda, `upsert_user_ranking()`
 * içinde. Bu projenin iki kez öğrendiği ders.
 *
 * ÖN KOŞUL: mekanın `places` cache satırı OLMALI (FK). Çağıran ekran önce
 * `resolvePlace(placeId)` çağırmalı.
 */
export async function logDiaryEntry(
  params: DiaryEntryInput
): Promise<{ entryId: string | null; error: MutationError | null }> {
  const { data, error } = await supabase.rpc('log_diary_entry', {
    p_place_id: params.placeId,
    p_visited_at: params.visitedAt ?? null,
    p_rating: params.rating ?? null,
    p_note: params.note ?? null,
    // `?? true`: alan verilmezse sunucu varsayılanıyla AYNI sonuç. Sunucu
    // tarafında da `coalesce(..., true)` var — iki uçta da bugünkü davranış.
    p_update_ranking: params.updateRanking ?? true,
  });

  if (error) {
    // RPC'nin `raise exception` metinleri TEŞHİS içindir, kullanıcı metni
    // değil (hangi ön koşulun atlandığını yazıyorlar).
    console.error('[diary] giriş kaydedilemedi:', error);
    return { entryId: null, error: new Error('Ziyaret kaydedilemedi, tekrar dene') };
  }

  /**
   * ── DÖNÜŞ ŞEKLİ GENİŞLEDİ: `entryId` (2026-08-11) ─────────────────────────
   * RPC `returns uuid` (migration 010) ve bu değeri BAŞTAN BERİ döndürüyordu —
   * istemci onu okumuyordu. Fotoğrafı ziyarete bağlamak için gerekli:
   * `place_photos.entry_id` bir FK, yani giriş satırı önce var olmalı.
   * RPC'yi değiştirmek gerekmedi, yalnızca zaten dönen değeri almak yetti.
   */
  return { entryId: (data as string | null) ?? null, error: null };
}

/**
 * Mevcut bir girişi günceller — hook'tan bağımsız, saf fonksiyon.
 *
 * YAZMA YOLU YALNIZCA `update_diary_entry()` RPC'si (migration 011): puan
 * DEĞİŞTİĞİNDE aynı işlem `user_rankings`'i de güncelliyor ve iki yazma tek
 * transaction'da olmalı.
 *
 * DAVRANIŞ — ekleme ile aynı olmayan iki nokta:
 *  • Puan yalnızca GERÇEKTEN değiştiyse sıralamaya yansıyor; not/tarih
 *    düzeltmek sıralamaya dokunmuyor. Değiştiyse kanonik puanı EZİYOR ("son
 *    düzenleme kazanır") — migration 017'den beri kullanıcı bunu
 *    `updateRanking: false` ile durdurabiliyor, yani CLAUDE.md'nin "kabul
 *    edilen tuzak" diye yazdığı davranış artık onun kontrolünde.
 *  • Puanı kaldırmak (`rating: null`) sıralamayı GERİ ALMIYOR — `removeEntry`
 *    ile simetrik, gerekçe orada yazılı.
 *
 * `placeId` PARAMETRE DEĞİL: bir ziyaret mekanına bağlıdır, mekan
 * değiştirilemez.
 */
export async function updateDiaryEntry(params: {
  entryId: string;
  /** `YYYY-MM-DD`. Verilmezse tarih olduğu gibi kalır. */
  visitedAt?: string;
  /** `null` → puanı kaldır. */
  rating?: number | null;
  /** `null` → notu sil. */
  note?: string | null;
  /** Bkz. `DiaryEntryInput.updateRanking` — varsayılan `true`. */
  updateRanking?: boolean;
}): Promise<{ error: MutationError | null }> {
  const { error } = await supabase.rpc('update_diary_entry', {
    p_entry_id: params.entryId,
    p_visited_at: params.visitedAt ?? null,
    p_rating: params.rating ?? null,
    p_note: params.note ?? null,
    p_update_ranking: params.updateRanking ?? true,
  });

  if (error) {
    console.error('[diary] giriş güncellenemedi:', error);
    return { error: new Error('Ziyaret güncellenemedi, tekrar dene') };
  }

  return { error: null };
}

export function useDiary(userId: string | undefined) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata mesajı değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    // `places` gömülü kaynağı FK üzerinden çözülüyor (migration 009).
    // Bu yolda Google'a HİÇ gidilmiyor — mekan bilgisi cache'ten.
    //
    // ⚠️ FK ADI (`!diary_entries_place_fk`) SADELEŞTİRİLMEMELİ (2026-08-11):
    // migration 020 `place_photos.entry_id` ile `places` ↔ `diary_entries`
    // arasında ikinci bir yol açtı. Tam gerekçe `useActivityFeed.ts`'te.
    //
    // İkinci sıralama anahtarı `created_at`: `visited_at` bir TARİH (saat yok),
    // aynı güne birden çok giriş girilebiliyor. O durumda son yazılan üstte.
    const { data, error: queryError } = await supabase
      .from('diary_entries')
      .select('*, places!diary_entries_place_fk(*)')
      .eq('user_id', userId)
      .order('visited_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[useDiary] günlük okunamadı:', queryError);
      setError('Günlük yüklenemedi. Bağlantını kontrol et.');
    } else {
      setEntries((data ?? []) as DiaryEntry[]);
    }

    setLoading(false);
  }, [userId]);

  /**
   * Yeni ziyaret kaydı + listeyi tazeleme. Yazmanın kendisi `logDiaryEntry`'de
   * (yukarıda); buradaki tek fark listenin yeniden okunması.
   *
   * Tam yenileme: RPC yalnızca id döndürüyor, satırın `places` join'i yok.
   * Günlük zaten tek sorguyla açılıyor, ek maliyeti önemsiz.
   */
  const addEntry = async (
    params: DiaryEntryInput
  ): Promise<{ error: MutationError | null }> => {
    if (!userId) return { error: new Error('Oturum açık değil') };

    const { error: rpcError } = await logDiaryEntry(params);
    if (rpcError) return { error: rpcError };

    await fetchEntries();
    return { error: null };
  };

  /**
   * Bir girişi siler.
   *
   * DİKKAT — `user_rankings` GERİ ALINMIYOR: puanlı bir giriş silinince
   * sıralamadaki puan olduğu gibi kalıyor. Bilinçli: sıralama "bu mekan hakkında
   * ne düşünüyorum" sorusunun kanonik cevabı, tek bir ziyaretin türevi değil.
   * Geri almak "hangi ziyaretin puanına dönmeli" sorusunu doğururdu — cevabı
   * olmayan bir soru. Kullanıcı puanı değiştirmek isterse mekan sayfasından
   * değiştirir.
   */
  const removeEntry = async (
    entryId: string
  ): Promise<{ error: MutationError | null }> => {
    /**
     * ── SIRA ZORUNLU: ÖNCE YOLLARI OKU ───────────────────────────────────────
     * Migration 020 `place_photos.entry_id`'ye `on delete cascade` koydu, yani
     * giriş silinince fotoğraf SATIRLARI kendiliğinden gidiyor. Ama Postgres
     * bucket'taki NESNELERİ silmiyor — o temizlik bize ait.
     *
     * Yolları silmeden önce okumak zorundayız: satırlar gittikten sonra
     * hangi dosyaları sileceğimizi söyleyen hiçbir kayıt kalmıyor.
     *
     * Ters sıra (önce Storage) DENENMEDİ ve denenmemeli: giriş silme
     * patlarsa dosyasız satırlar kalırdı — ızgarada boş kare, tam ekranda
     * hata durumu. Yani DB tutarlılığı önce, temizlik sonra. Temizlik
     * patlarsa kalan şey görünmez bir öksüz nesne.
     */
    const { data: photoRows, error: pathError } = await supabase
      .from('place_photos')
      .select('storage_path, thumb_path')
      .eq('entry_id', entryId);

    if (pathError) {
      // Silmeyi ENGELLEMİYOR: kullanıcının istediği şey girişin gitmesi.
      // Yollar okunamadıysa yalnızca temizlik yapılamaz, öksüz nesne kalır.
      console.warn('[useDiary] fotoğraf yolları okunamadı, temizlik atlanacak:', pathError);
    }

    const { error: deleteError } = await supabase
      .from('diary_entries')
      .delete()
      .eq('id', entryId);

    if (deleteError) {
      console.error('[useDiary] giriş silinemedi:', deleteError);
      return { error: deleteError };
    }

    if (photoRows && photoRows.length > 0) {
      await removePhotoObjects(
        photoRows.flatMap((p) => [p.storage_path, p.thumb_path])
      );
    }

    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    return { error: null };
  };

  /** Düzenleme + listeyi tazeleme. Yazma `updateDiaryEntry`'de. */
  const editEntry = async (
    params: Parameters<typeof updateDiaryEntry>[0]
  ): Promise<{ error: MutationError | null }> => {
    const { error: rpcError } = await updateDiaryEntry(params);
    if (rpcError) return { error: rpcError };

    // Tam yenileme: tarih değişmiş olabilir, yani satırın listedeki YERİ de
    // değişir (sıralama `visited_at desc`). Yerel yamalamak sırayı elle
    // yeniden hesaplamak olurdu.
    await fetchEntries();
    return { error: null };
  };

  return { entries, loading, error, fetchEntries, addEntry, editEntry, removeEntry };
}
