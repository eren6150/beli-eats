import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useBlocks } from './useBlocks';

/**
 * Takip sistemi hook'ları (`follows` tablosu, `supabase_schema.sql`).
 *
 * ── BU DOSYA FAZ 3'ÜN ÖN KOŞULU OLARAK SAĞLAMLAŞTIRILDI (2026-08-07) ────────
 * Hook'lar yazılalı beri hiçbir arayüz onları çağırmamıştı. İlk çağıranları
 * gelmeden önce üç ihlal düzeltildi:
 *
 *  1. `toggleFollow` sonucu HİÇ KONTROL ETMİYORDU. `insert`/`delete`
 *     başarısız olsa bile yerel durum değişiyordu → arayüz "takip ediliyor"
 *     derken veritabanında kayıt yok. `reorderItems`'ın "iyimser güncelle ama
 *     hatada GERİ AL" deseni burada da uygulandı.
 *  2. `useFollowList` hataları YUTUYORDU: `data` null gelirse sessizce boş
 *     liste. "Kimse takip etmiyor" ile "sorgu patladı" ayrışmıyordu — harita
 *     özetinde bilerek ayırdığımız şeyin aynısı.
 *  3. ÇİFT DOKUNMA KORUMASI YOKTU: `loading` vardı ama `toggleFollow` ona
 *     bakmıyordu. Hızlı iki dokunuş iki isteğe çıkıyordu.
 *
 * Neden ÖNCE ve AYRI: bu iki hook Faz 3'ün üç ekranının da temeli
 * (`UserProfile`, `FollowersList`, aktivite akışı). Bozuk temel üstüne üç
 * ekran yazmak sonra üç yerde aynı yamayı gerektirirdi — `useAuth`'un
 * Context'e çevrilme gerekçesinin aynısı.
 *
 * HATA METNİ KURALI: ekrana kısa ve eyleme dönük metin, konsola tam nesne.
 */

// ─── Takip durumu ─────────────────────────────────────────────────────────────

/**
 * Mevcut kullanıcının `targetUserId`'yi takip edip etmediğini yönetir.
 *
 * @param currentUserId Oturum açmış kullanıcının id'si
 * @param targetUserId  Takip edilen/edilecek kullanıcının id'si
 *
 * KENDİ KENDİNİ TAKİP: `follows` tablosunda `check (follower_id != following_id)`
 * var, yani veritabanı zaten reddediyor. Hook da erken çıkıyor ki gereksiz
 * istek gitmesin ve `isFollowing` yanlışlıkla true görünmesin.
 */
export function useFollow(
  currentUserId: string | undefined,
  targetUserId: string | undefined
) {
  const [isFollowing, setIsFollowing] = useState(false);
  /** İlk durum sorgusu — buton "belirsiz" haldeyken basılmasın diye. */
  const [checking, setChecking] = useState(false);
  /** Takip et / bırak isteği sürüyor. */
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  const [error, setError] = useState<string | null>(null);

  const isSelf = !!currentUserId && currentUserId === targetUserId;

  /**
   * Yanıt sırası koruması. Hızlıca iki farklı profile bakıldığında geç gelen
   * yanıt yenisini ezebiliyordu — `SearchScreen`'in `requestSeqRef`'i ve
   * `MapScreen`'in `lastPoiTapRef`'i ile aynı desen.
   */
  const requestSeqRef = useRef(0);

  const checkFollowStatus = useCallback(async () => {
    if (!currentUserId || !targetUserId || isSelf) return;

    const seq = ++requestSeqRef.current;
    setChecking(true);

    const { data, error: queryError } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId)
      .maybeSingle();

    // Araya yeni bir sorgu girdiyse bu yanıt bayat.
    if (seq !== requestSeqRef.current) return;

    if (queryError) {
      console.error('[useFollow] takip durumu okunamadı:', queryError);
      // `isFollowing`'e DOKUNMUYORUZ: false'a çekmek "takip etmiyorsun"
      // demek olurdu ve bu bilinmiyor. Buton devre dışı kalıyor.
      setError('Takip durumu okunamadı.');
    } else {
      setError(null);
      setIsFollowing(!!data);
    }

    setChecking(false);
  }, [currentUserId, targetUserId, isSelf]);

  useEffect(() => {
    checkFollowStatus();
  }, [checkFollowStatus]);

  /**
   * Takip et / takibi bırak.
   *
   * İYİMSER GÜNCELLEME + HATADA GERİ ALMA: buton anında tepki veriyor, istek
   * başarısız olursa eski haline dönüyor. Ekranda yeni durum, veritabanında
   * eski durum kalması sessiz bir yalan olurdu.
   */
  const toggleFollow = useCallback(async (): Promise<{
    error: PostgrestError | Error | null;
  }> => {
    if (!currentUserId || !targetUserId) {
      return { error: new Error('Oturum açık değil') };
    }
    if (isSelf) return { error: new Error('Kendini takip edemezsin') };
    // Çift dokunma koruması — eskiden `loading` vardı ama kontrol edilmiyordu.
    if (loading || checking) return { error: null };

    const next = !isFollowing;
    setLoading(true);
    setError(null);
    setIsFollowing(next); // iyimser

    const { error: mutationError } = next
      ? await supabase
          .from('follows')
          .insert({ follower_id: currentUserId, following_id: targetUserId })
      : await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);

    setLoading(false);

    if (mutationError) {
      // 23505 = zaten takip ediyor. Bu bir başarısızlık DEĞİL, istenen son
      // durumun zaten sağlanmış olması — `addPlaceToList`'in aynı kodu bilgi
      // olarak kullanmasıyla aynı gerekçe. Beklenen durum → warn, error değil.
      if (next && (mutationError as PostgrestError).code === '23505') {
        console.warn('[useFollow] zaten takip ediliyor:', targetUserId);
        return { error: null };
      }

      console.error('[useFollow] takip işlemi başarısız:', mutationError);
      setIsFollowing(!next); // GERİ AL
      setError('İşlem tamamlanamadı. Tekrar dene.');
      return { error: mutationError };
    }

    return { error: null };
  }, [currentUserId, targetUserId, isSelf, isFollowing, loading, checking]);

  return { isFollowing, loading, checking, error, isSelf, toggleFollow, checkFollowStatus };
}

// ─── Takipçi / takip edilen listesi ───────────────────────────────────────────

export interface FollowUser {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

/**
 * Bir kullanıcının takipçilerini veya takip ettiklerini getirir.
 *
 * TEK SORGU: `profiles` gömülü kaynağı FK üzerinden çözülüyor, N ek istek yok.
 * İki yönün FK adı farklı olduğu için (`follows_follower_id_fkey` /
 * `follows_following_id_fkey`) select ifadesi de yöne göre değişiyor —
 * PostgREST aynı tabloya iki FK olduğunda hangisini kullanacağını bilemiyor.
 */
export function useFollowList(
  userId: string | undefined,
  type: 'followers' | 'following'
) {
  const [rawUsers, setRawUsers] = useState<FollowUser[]>([]);

  const { blocked, ready: blocksReady } = useBlocks();

  /**
   * Engelli kullanıcılar takipçi/takip listelerinden düşüyor.
   *
   * ⚠️ SAYAÇLAR (`useProfile`'ın takipçi/takip sayıları) DEĞİŞMİYOR —
   * bilinçli. Zaten migration 024 engellemede takibi iki yönde de siliyor,
   * yani asıl durumda sayı gerçekten düşüyor; burada kalan tek fark ÜÇÜNCÜ
   * bir kişinin listesinde engellinin gizlenmesi. Sayaç ile liste arasındaki
   * bu küçük tutarsızlık, alternatifin (her sayaç sorgusuna engel filtresi)
   * maliyetine değmiyor.
   *
   * ⚠️ Filtre TÜRETİLMİŞ, fetch anında değil: engel listesi asenkron geliyor
   * ve sorgu ondan önce dönerse engelli kişi bir kare görünürdü.
   * `blocksReady` false iken boş dönüyor — "engel yok" ile "henüz bilmiyorum"
   * aynı şey değil.
   */
  const users = useMemo(() => {
    if (!blocksReady) return [];
    if (blocked.size === 0) return rawUsers;
    return rawUsers.filter((u) => !blocked.has(u.id));
  }, [rawUsers, blocked, blocksReady]);
  const [loading, setLoading] = useState(false);
  /** Kullanıcıya GÖSTERİLEN kısa metin. Boş liste ile hata AYRI durumlar. */
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    const query =
      type === 'followers'
        ? supabase
            .from('follows')
            .select(
              'follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)'
            )
            .eq('following_id', userId)
        : supabase
            .from('follows')
            .select(
              'following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url)'
            )
            .eq('follower_id', userId);

    const { data, error: queryError } = await query;

    if (queryError) {
      console.error('[useFollowList] liste okunamadı:', queryError);
      setError('Liste yüklenemedi. Bağlantını kontrol et.');
    } else {
      /**
       * ⚠️ GÖMÜLÜ KAYNAK TİPİ: Supabase'in çıkarımı `profiles`'ı DİZİ sanıyor,
       * çünkü üretilmiş veritabanı tipleri olmadan ilişkinin tekil mi çoğul mu
       * olduğunu bilemiyor. Çalışma anında PostgREST bunu FK üzerinden tekil
       * çözüp NESNE döndürüyor.
       *
       * Eski kod bunu `(row: any)` ile geçiştiriyordu — tip denetimini tamamen
       * kapatmak yerine her iki şekli de karşılıyoruz: dizi gelirse ilk eleman,
       * nesne gelirse kendisi. Böylece Supabase ileride çıkarımı düzeltirse de
       * kod kırılmıyor.
       */
      type FollowRow = { profiles: FollowUser | FollowUser[] | null };
      const rows = (data ?? []) as unknown as FollowRow[];

      setRawUsers(
        rows
          .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
          // Profil satırı silinmişse null gelir. FK `on delete cascade`
          // olduğu için normalde oluşmaz, ama boş satır render etmektense
          // atmak doğru.
          .filter((p): p is FollowUser => !!p)
      );
    }

    setLoading(false);
  }, [userId, type]);

  /**
   * Listeden bir kişiyi çıkarır. Hangi satırın silineceğini `type` belirliyor:
   *   followers → `follower_id = o kişi,  following_id = liste sahibi`
   *               ("beni takip etmesin" — migration 019'un açtığı yol)
   *   following → `follower_id = liste sahibi, following_id = o kişi`
   *               ("takibi bırak" — baştan beri mümkündü)
   *
   * ⚠️ SATIR SAYISI KONTROL EDİLİYOR, `error` YETMİYOR. RLS bir satırı
   * reddettiğinde Supabase HATA DÖNDÜRMÜYOR — sessizce 0 satır etkiliyor.
   * Yalnızca `error`'a bakan bir kod, migration 019 çalıştırılmamışsa her
   * çıkarmayı "başarılı" gösterir ve kullanıcı çıkarmadığı birini çıkardım
   * sanır. `.select()` silinen satırları geri getiriyor, sayı da kanıt oluyor.
   *
   * 0 satır iki anlama gelebilir (politika reddetti / satır zaten yoktu) ve
   * ikisi istemciden AYIRT EDİLEMEZ. Bu yüzden başarı iddia etmiyoruz ama
   * listeyi de `fetchList()` ile yeniden okuyoruz: satır gerçekten gitmişse
   * kendiliğinden düşüyor, politika reddettiyse yerinde kalıyor — ekran her
   * iki durumda da GERÇEĞİ gösteriyor.
   */
  const removeUser = useCallback(
    async (otherUserId: string) => {
      if (!userId) return { error: new Error('Oturum açık değil') };

      const base = supabase.from('follows').delete();
      const scoped =
        type === 'followers'
          ? base.eq('follower_id', otherUserId).eq('following_id', userId)
          : base.eq('follower_id', userId).eq('following_id', otherUserId);

      const { data, error: deleteError } = await scoped.select('follower_id');

      if (deleteError) {
        console.error('[useFollowList] satır silinemedi:', deleteError);
        return { error: new Error('İşlem tamamlanamadı. Bağlantını kontrol et.') };
      }

      if (!data || data.length === 0) {
        console.error(
          '[useFollowList] silme 0 satır etkiledi — RLS reddetmiş ya da satır ' +
            'zaten yok olabilir. Migration 019 çalıştırıldı mı?'
        );
        await fetchList();
        return { error: new Error('Çıkarılamadı, tekrar dene.') };
      }

      setRawUsers((prev) => prev.filter((u) => u.id !== otherUserId));
      return { error: null };
    },
    [userId, type, fetchList]
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { users, loading, error, fetchList, removeUser };
}
