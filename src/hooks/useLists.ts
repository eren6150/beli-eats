import { useState, useCallback } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { List, ListWithItemCount } from '../types';

/**
 * Kullanıcının listeleri (migration 005).
 *
 * KAPSAM: yalnızca listelerin KENDİSİ — başlık, açıklama, öğe sayısı.
 * Bir listenin İÇERİĞİ `useListItems`'ın işi. İkisi ayrı, çünkü farklı
 * ekranlarda ve farklı yaşam döngüsünde çalışıyorlar: "Listeler" sekmesi hiçbir
 * listenin öğelerini yüklemiyor, liste detay ekranı da tek bir listenin
 * dışındakileri umursamıyor.
 *
 * SÖZLEŞME — `userId` yoksa `fetchLists` hiçbir şey yapmaz. `useAuth` bir
 * Context DEĞİL (bkz. CLAUDE.md → Bilinen Açık İşler): mount anında `user`
 * henüz null olabiliyor. Çağıran ekran bu yüzden
 * `useFocusEffect(useCallback(..., [fetchLists]))` kalıbıyla tetiklemeli;
 * `fetchLists` `userId` değişince kimliğini değiştiriyor.
 */

/** Mutasyonlar iki hata sınıfı döndürebiliyor: Postgres hatası veya yerel doğrulama. */
type MutationError = PostgrestError | Error;

export function useLists(userId: string | undefined) {
  const [lists, setLists] = useState<ListWithItemCount[]>([]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata mesajı değil. */
  const [error, setError] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    // `list_items(count)` gömülü toplama: öğeleri çekmeden yalnızca sayısını
    // getiriyor. Kart üzerinde "12 mekan" yazmak için N ek sorgu atmak
    // gerekmiyor. FK migration 005'te kurulu, ilişki çözülüyor.
    const { data, error: queryError } = await supabase
      .from('lists')
      .select('*, list_items(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (queryError) {
      // Ham mesaj ekrana ÇIKMIYOR (CLAUDE.md → hata mesajı kuralı).
      console.error('[useLists] listeler okunamadı:', queryError);
      setError('Listeler yüklenemedi. Bağlantını kontrol et.');
    } else {
      setLists((data ?? []) as ListWithItemCount[]);
    }

    setLoading(false);
  }, [userId]);

  /**
   * Yeni liste oluşturur ve oluşan satırı döndürür — çağıran ekran doğrudan
   * o listeye gidebilsin diye.
   *
   * Başlık burada da doğrulanıyor (DB'de CHECK var): kısıt ihlalinin ham
   * Postgres metni kullanıcıya gösterilemeyecek bir şey, kendi mesajımız daha iyi.
   */
  const createList = async (params: {
    title: string;
    description?: string;
    isOrdered?: boolean;
  }): Promise<{ data: List | null; error: MutationError | null }> => {
    if (!userId) {
      return { data: null, error: new Error('Oturum açık değil') };
    }

    const title = params.title.trim();
    if (title.length === 0) {
      return { data: null, error: new Error('Liste başlığı boş olamaz') };
    }
    if (title.length > 100) {
      return { data: null, error: new Error('Liste başlığı en fazla 100 karakter olabilir') };
    }

    const description = params.description?.trim();
    if (description && description.length > 500) {
      return { data: null, error: new Error('Açıklama en fazla 500 karakter olabilir') };
    }

    const { data, error: insertError } = await supabase
      .from('lists')
      .insert({
        user_id: userId,
        title,
        description: description || null,
        is_ordered: params.isOrdered ?? false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[useLists] liste oluşturulamadı:', insertError);
      return { data: null, error: insertError };
    }

    await fetchLists();
    return { data: data as List, error: null };
  };

  /**
   * Listenin üst bilgisini günceller. Yalnızca VERİLEN alanlar gönderiliyor —
   * `undefined` bırakılan alan DB'de olduğu gibi kalır.
   *
   * `updated_at` gönderilmiyor: `set_updated_at` trigger'ı (migration 005)
   * onu kendisi yazıyor. İstemcinin saatine güvenmek gereksiz.
   */
  const updateList = async (
    listId: string,
    changes: { title?: string; description?: string | null; isOrdered?: boolean }
  ): Promise<{ error: MutationError | null }> => {
    const patch: Record<string, unknown> = {};

    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (title.length === 0) {
        return { error: new Error('Liste başlığı boş olamaz') };
      }
      if (title.length > 100) {
        return { error: new Error('Liste başlığı en fazla 100 karakter olabilir') };
      }
      patch.title = title;
    }

    if (changes.description !== undefined) {
      const description = changes.description?.trim() || null;
      if (description && description.length > 500) {
        return { error: new Error('Açıklama en fazla 500 karakter olabilir') };
      }
      patch.description = description;
    }

    if (changes.isOrdered !== undefined) {
      patch.is_ordered = changes.isOrdered;
    }

    // Boş patch ile UPDATE atmak `updated_at` trigger'ını boşuna tetikler.
    if (Object.keys(patch).length === 0) {
      return { error: null };
    }

    const { error: updateError } = await supabase
      .from('lists')
      .update(patch)
      .eq('id', listId);

    if (updateError) {
      console.error('[useLists] liste güncellenemedi:', updateError);
      return { error: updateError };
    }

    await fetchLists();
    return { error: null };
  };

  /**
   * Listeyi siler. Öğeleri `on delete cascade` ile birlikte gider (migration 005) —
   * ayrıca `list_items` temizlemeye gerek yok.
   */
  const deleteList = async (listId: string): Promise<{ error: MutationError | null }> => {
    const { error: deleteError } = await supabase
      .from('lists')
      .delete()
      .eq('id', listId);

    if (deleteError) {
      console.error('[useLists] liste silinemedi:', deleteError);
      return { error: deleteError };
    }

    // Yerel state'ten de düşür: silinen liste bir sonraki fetch'e kadar
    // ekranda durmasın.
    setLists((prev) => prev.filter((l) => l.id !== listId));
    return { error: null };
  };

  return { lists, loading, error, fetchLists, createList, updateList, deleteList };
}

/** `ListWithItemCount`'tan okunabilir öğe sayısı. Boş listede gömülü dizi boş gelir. */
export function itemCountOf(list: ListWithItemCount): number {
  return list.list_items?.[0]?.count ?? 0;
}
