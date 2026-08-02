import { useState, useCallback } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { ListItem } from '../types';

/**
 * TEK bir listenin içeriği (migration 005 + 006).
 *
 * Listelerin kendisi `useLists`'te. Ayrılığın gerekçesi orada yazılı.
 *
 * SÖZLEŞME — `listId` yoksa `fetchItems` hiçbir şey yapmaz; ekran route
 * parametresi çözülünce tetiklemeli.
 */

type MutationError = PostgrestError | Error;

/** Postgres unique_violation — aynı mekan listede zaten var. */
const PG_UNIQUE_VIOLATION = '23505';
/** Postgres foreign_key_violation — `places` cache satırı yok. */
const PG_FK_VIOLATION = '23503';

/**
 * TEK bir mekanı TEK bir listeye ekler — hook'tan bağımsız, saf fonksiyon.
 *
 * NEDEN HOOK DIŞINDA: "listeye ekle" seçicisi (`AddToListSheet`) kullanıcının
 * TÜM listelerini gösteriyor ve hangisine dokunulacağı önceden bilinmiyor.
 * Hook'la yapmak için ya liste başına bir `useListItems` örneği kurmak
 * (yalnızca tek bir insert için N tane state makinesi) ya da seçicide ham
 * `insert` yazmak gerekirdi — ikincisi aşağıdaki hata kodu çevirisini
 * kopyalamak demekti. `itemCountOf`'un `useLists` yanında durmasıyla aynı desen.
 *
 * ÖN KOŞUL: mekanın `places` cache satırı OLMALI (FK). Çağıran önce
 * `resolvePlace(placeId)` çağırmalı — `23503` bunun atlandığını söyler.
 */
export async function addPlaceToList(
  listId: string,
  placeId: string
): Promise<{ data: ListItem | null; error: MutationError | null }> {
  // `position` GÖNDERİLMİYOR — `set_list_item_position` trigger'ı (migration 005)
  // listenin son sırasının bir fazlasını yazıyor. İstemcinin sıra hesaplaması
  // tam olarak `rank_index`'te veri kaybettiren şeydi.
  const { data, error } = await supabase
    .from('list_items')
    .insert({ list_id: listId, place_id: placeId })
    .select('*, places(*)')
    .single();

  if (error) {
    // Postgres hata KODLARI kararlı ve belgeli bir sözleşme — ağ hatası
    // metnini regex'lemekten farklı olarak buna güvenilebilir. Aşağıdaki iki
    // durum "beklenen" hatalar, kullanıcıya ne olduğunu söylemek doğru.

    // 23505 BEKLENEN VE ELE ALINMIŞ bir senaryo: mekan o listede zaten var.
    // Çağıran bunu başarısızlık değil bilgi olarak kullanıyor (satırı
    // "Eklendi" durumuna geçiriyor). Bu yüzden `console.error` DEĞİL:
    // geliştirme modunda LogBox'ın kırmızı ekranını gereksiz yere tetikliyor
    // ve gerçek hataların arasında gürültü yaratıyordu (`useLocation`'da aynı
    // ayrım yapılmıştı). Gerçek hatalar aşağıda `console.error` olarak kalıyor.
    if (error.code === PG_UNIQUE_VIOLATION) {
      console.warn('[listItems] mekan bu listede zaten var:', { listId, placeId });
      return { data: null, error: new Error('Bu mekan listede zaten var') };
    }

    console.error('[listItems] mekan eklenemedi:', error);

    if (error.code === PG_FK_VIOLATION) {
      return { data: null, error: new Error('Mekan bilgisi bulunamadı, tekrar dene') };
    }
    return { data: null, error };
  }

  return { data: data as ListItem, error: null };
}

export function useListItems(listId: string | undefined) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata mesajı değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!listId) return;

    setLoading(true);
    setError(null);

    // `places(*)` gömülü kaynağı FK üzerinden çözülüyor (migration 005).
    // Bu yolda Google'a HİÇ gidilmiyor — mekan bilgisi cache'ten.
    //
    // İkinci sıralama anahtarı `created_at`: `position` üzerinde unique kısıt
    // YOK (bilinçli, bkz. migration 005), yani teorik olarak çift değer
    // olabilir. O durumda sıranın rastgele kalmasındansa eklenme sırasına
    // düşmesi doğru.
    const { data, error: queryError } = await supabase
      .from('list_items')
      .select('*, places(*)')
      .eq('list_id', listId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (queryError) {
      console.error('[useListItems] liste içeriği okunamadı:', queryError);
      setError('Liste içeriği yüklenemedi. Bağlantını kontrol et.');
    } else {
      setItems((data ?? []) as ListItem[]);
    }

    setLoading(false);
  }, [listId]);

  /**
   * AÇIK olan listeye mekan ekler. Yazmanın kendisi `addPlaceToList`'te
   * (yukarıda); buradaki tek fark eklenen satırın yerel state'e işlenmesi.
   */
  const addItem = async (placeId: string): Promise<{ error: MutationError | null }> => {
    if (!listId) return { error: new Error('Liste seçili değil') };

    const { data, error: insertError } = await addPlaceToList(listId, placeId);

    if (insertError || !data) {
      return { error: insertError ?? new Error('Mekan eklenemedi') };
    }

    // Trigger'ın yazdığı `position` ile birlikte dönen satırı sona ekliyoruz —
    // tam liste yenilemesine gerek yok.
    setItems((prev) => [...prev, data]);
    return { error: null };
  };

  /**
   * Birden çok öğeyi TEK sorguda çıkarır (çoklu seçim modu).
   *
   * `.in('id', ids)` — N ayrı `delete` turu değil. RLS her satırı yine ebeveyn
   * liste üzerinden doğruluyor, yani başkasının öğesi listeye karışsa bile
   * silinmez (o satır sessizce etkilenmez).
   */
  const removeItems = async (
    itemIds: string[]
  ): Promise<{ error: MutationError | null }> => {
    if (itemIds.length === 0) return { error: null };

    const { error: deleteError } = await supabase
      .from('list_items')
      .delete()
      .in('id', itemIds);

    if (deleteError) {
      console.error('[useListItems] mekanlar çıkarılamadı:', deleteError);
      return { error: deleteError };
    }

    // Kalan öğelerin `position` değerleri yeniden numaralandırılmıyor: silme
    // sonrası 0,1,3 gibi boşluklu bir dizi kalabilir. SORUN DEĞİL — sıra
    // `order by position` ile okunuyor, mutlak değerlerin anlamı yok.
    // Yeniden numaralandırmak N satırlık gereksiz bir yazma olurdu.
    setItems((prev) => prev.filter((i) => !itemIds.includes(i.id)));
    return { error: null };
  };

  /** Tek öğe — yazma yolu `removeItems` ile aynı. */
  const removeItem = (itemId: string) => removeItems([itemId]);

  /**
   * Seçili mekanları BAŞKA bir listeye taşır veya kopyalar (migration 007+008).
   *
   * `move_list_items()` RPC'si hedefe INSERT ve kaynaktan DELETE işini TEK
   * transaction'da yapıyor. İki ayrı istemci çağrısıyla yapılsaydı arada kopan
   * bir bağlantı mekanları iki listede birden veya hiçbirinde bırakırdı.
   *
   * `removeFromSource = false` → DELETE adımı atlanıyor, yani KOPYALAMA.
   * İstemcide `addPlaceToList` döngüsü kurmak yerine RPC'ye bayrak eklenmesinin
   * gerekçesi migration 008'in başında yazılı (özetle: mükerrer mekan zaten
   * `on conflict` ile çözülmüş, tek çağrı N istekten sağlam, ve tek anahtarın
   * kodda iki ayrı mekanizmaya dallanması bakım yükü).
   *
   * Hedefte zaten var olan mekanlar RPC içinde atlanıyor (`on conflict do
   * nothing`) ama taşıma modunda kaynaktan yine de siliniyor — kullanıcının
   * istediği "bu mekanlar şu listede olsun" ve zaten oradaysa istek
   * karşılanmış demektir.
   */
  const moveItems = async (
    targetListId: string,
    itemIds: string[],
    removeFromSource: boolean = true
  ): Promise<{ error: MutationError | null }> => {
    if (!listId) return { error: new Error('Liste seçili değil') };
    if (itemIds.length === 0) return { error: null };

    const { error: rpcError } = await supabase.rpc('move_list_items', {
      p_source_list_id: listId,
      p_target_list_id: targetListId,
      p_item_ids: itemIds,
      p_remove_from_source: removeFromSource,
    });

    if (rpcError) {
      // RPC'nin `raise exception` metinleri TEŞHİS içindir, kullanıcı metni
      // değil (hangi id'nin hangi listede olmadığını yazıyorlar).
      console.error('[useListItems] taşıma/kopyalama başarısız:', rpcError);
      return {
        error: new Error(
          removeFromSource
            ? 'Mekanlar taşınamadı, tekrar dene'
            : 'Mekanlar kopyalanamadı, tekrar dene'
        ),
      };
    }

    // Yerel güncelleme YALNIZCA taşımada: kopyalamada mekanlar bu listede
    // kalmaya devam ediyor. Hedef listenin içeriği zaten başka bir ekranın işi.
    if (removeFromSource) {
      setItems((prev) => prev.filter((i) => !itemIds.includes(i.id)));
    }

    return { error: null };
  };

  /**
   * Listeyi verilen id sırasına göre yeniden sıralar.
   *
   * `reorder_list_items()` RPC'si (migration 006) sırayı SUNUCUDA hesaplıyor;
   * istemci yalnızca sıralı id dizisini gönderiyor. İstemciden toplu `upsert`
   * yapılmamasının sebebi migration 006'nın başında yazılı: `upsert` bir
   * `INSERT ... ON CONFLICT` ve hatalı bir id hata vermek yerine yeni satır
   * yaratır.
   *
   * RPC eksik/mükerrer id ve sahiplik ihlalinde hata fırlatıyor, yani kısmi
   * sıralama mümkün değil.
   */
  const reorderItems = async (
    orderedIds: string[]
  ): Promise<{ error: MutationError | null }> => {
    if (!listId) return { error: new Error('Liste seçili değil') };
    if (orderedIds.length === 0) return { error: null };

    // İyimser güncelleme: sürükle-bırak parmağın altında anında oturmalı.
    const previous = items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((i): i is ListItem => i !== undefined);

    // Gelen id'ler mevcut listeyi tam karşılamıyorsa iyimser güncelleme
    // öğe kaybettirir. RPC bunu zaten reddedecek; ekranı bozmadan çıkıyoruz.
    if (reordered.length !== items.length) {
      console.error(
        '[useListItems] yeniden sıralama id listesi eşleşmiyor:',
        { gelen: orderedIds.length, mevcut: items.length }
      );
      return { error: new Error('Sıralama uygulanamadı, listeyi yenile') };
    }

    setItems(reordered);

    const { error: rpcError } = await supabase.rpc('reorder_list_items', {
      p_list_id: listId,
      p_item_ids: orderedIds,
    });

    if (rpcError) {
      console.error('[useListItems] yeniden sıralama başarısız:', rpcError);
      // İyimser güncellemeyi GERİ AL. Ekranda yeni sıra, veritabanında eski
      // sıra kalması sessiz bir yalan olurdu.
      setItems(previous);
      return { error: new Error('Sıralama kaydedilemedi, tekrar dene') };
    }

    return { error: null };
  };

  return {
    items,
    loading,
    error,
    fetchItems,
    addItem,
    removeItem,
    removeItems,
    moveItems,
    reorderItems,
  };
}
