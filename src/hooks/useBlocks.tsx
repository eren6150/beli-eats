import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

/**
 * Engel listesi — uygulamanın TEK örneği.
 *
 * ── NEDEN CONTEXT, DÜZ HOOK DEĞİL ───────────────────────────────────────────
 * Engel bilgisini ALTI okuma yolu birden istiyor (`useActivityFeed`,
 * `useProfile`, `usePlacePhotos`, `usePlaceRankings`, `useFollow`,
 * `HomeScreen`). Düz hook olsaydı her biri kendi sorgusunu atardı: açılışta
 * altı istek ve altı ayrı "henüz yüklenmedi" penceresi.
 *
 * 🔑 Asıl zarar istek sayısı değil YARIŞ: liste boşken yapılan bir filtreleme
 * engellenen kişiyi BİR KARE GÖSTERİR. `useAuth`'un Context'e çevrilme
 * gerekçesinin birebir aynısı ("ekran `user?.id` ile sorgu atıyor, oturum
 * çözülünce sorgu tekrarlanmıyordu") — ve buradaki semptom daha kötü, çünkü
 * gizlenmesi gereken içerik görünüyor.
 *
 * Bu yüzden `ready` AYRI bir alan olarak dışarı veriliyor: filtreleyen taraf
 * "liste boş" ile "liste henüz gelmedi"yi ayırt edebilsin.
 *
 * ── 🔑 BU BİR GÜVENLİK SINIRI DEĞİL ─────────────────────────────────────────
 * Filtreleme İSTEMCİDE. Sosyal tabloların hepsi `select using (true)` ve anon
 * key bundle'da, yani engellenen biri düz bir REST çağrısıyla veriyi zaten
 * okuyabiliyor. RLS'e görünürlük filtresi koymak, her okumaya alt sorgu
 * bindirip karşılığında SAHTE bir güvence vermek olurdu; gerekçenin tamamı
 * migration 024'ün başında.
 *
 * RLS'in gerçekten zorladığı şey ETKİLEŞİM: engelli çift birbirini takip
 * edemiyor ve beğenemiyor (024'teki iki `as restrictive` politika).
 *
 * ── SİMETRİK: İKİ YÖN DE OKUNUYOR ───────────────────────────────────────────
 * `blocked` kümesi hem "benim engellediklerim" hem "beni engelleyenler"i
 * içeriyor — ürün kararı iki yönlü gizleme. Migration 024'ün SELECT politikası
 * (`blocker_id` VEYA `blocked_id` benim) tam olarak bunu mümkün kılmak için
 * iki tarafa da açık; gerekçesi ve takası orada yazılı.
 *
 * ⚠️ `blockedByMe` AYRI tutuluyor: "engeli kaldır" YALNIZCA benim koyduğum
 * engel için mümkün (024'ün DELETE politikası) ve engellenenler listesi
 * ekranı yalnızca onu göstermeli. Tek küme olsaydı ekran, beni engelleyen
 * kişiyi de "engeli kaldır" butonuyla gösterirdi — tıklanabilir görünüp
 * sessizce 0 satır silen bir buton.
 */
interface BlocksContextValue {
  /** Gizlenecek kullanıcı id'leri — İKİ YÖN birden. */
  blocked: Set<string>;
  /** Yalnızca BENİM engellediklerim; engeli kaldırma bu kümeye bakar. */
  blockedByMe: Set<string>;
  /**
   * Liste sunucudan geldi mi? `false` iken filtreleme yapılmamalı —
   * boş küme ile "henüz bilmiyorum" aynı şey değil.
   */
  ready: boolean;
  /** Kullanıcıya GÖSTERİLEN kısa metin — ham hata değil. */
  error: string | null;
  isBlocked: (userId: string | null | undefined) => boolean;
  blockUser: (userId: string) => Promise<{ error: string | null }>;
  unblockUser: (userId: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const BlocksContext = createContext<BlocksContextValue | null>(null);

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [blockedByMe, setBlockedByMe] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      // Oturum yok: kümeler boş ama `ready` TRUE — filtrelenecek bir şey
      // olmadığı BİLİNİYOR. `false` bırakmak auth ekranlarını beklemeye
      // sokardı.
      setBlocked(new Set());
      setBlockedByMe(new Set());
      setReady(true);
      return;
    }

    setError(null);

    // Tek sorgu, iki yön: RLS zaten yalnızca beni ilgilendiren satırları
    // döndürüyor (024'ün SELECT politikası), o yüzden filtre `or` ile
    // yazılıyor ama sunucu tarafında ikinci bir güvence var.
    const { data, error: queryError } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    if (queryError) {
      console.error('[useBlocks] engel listesi okunamadı:', queryError);
      setError('Engel listesi yüklenemedi.');
      /**
       * ⚠️ HATA HÂLİNDE `ready` TRUE YAPILMIYOR ve kümeler KORUNUYOR.
       *
       * Sıfırlamak, geçici bir ağ hatasında engellenen içeriğin ekrana
       * DÜŞMESİ demekti. Filtrelemenin yanlış tarafta hata vermesi
       * (fazladan gizlemek) az zararlı; eksik gizlemek asıl kusur.
       */
      return;
    }

    const all = new Set<string>();
    const mine = new Set<string>();

    for (const row of data ?? []) {
      if (row.blocker_id === userId) {
        all.add(row.blocked_id);
        mine.add(row.blocked_id);
      } else {
        // Beni engelleyen: gizliyorum ama engeli KALDIRAMAM.
        all.add(row.blocker_id);
      }
    }

    setBlocked(all);
    setBlockedByMe(mine);
    setReady(true);
  }, [userId]);

  // Oturum değişince (giriş/çıkış/hesap değiştirme) liste yeniden kuruluyor.
  useEffect(() => {
    setReady(false);
    refresh();
  }, [refresh]);

  const isBlocked = useCallback(
    (id: string | null | undefined) => (id ? blocked.has(id) : false),
    [blocked]
  );

  /**
   * Engelle — `block_user` RPC'si.
   *
   * RPC, engel satırını yazmak ve İKİ YÖNDEKİ takibi silmek işini TEK
   * transaction'da yapıyor (gerekçe migration 024'te). İstemci ayrıca
   * `follows` silmiyor; ikinci bir yazma yolu açmak, kuralı iki yerde
   * tutmak olurdu.
   */
  const blockUser = useCallback(
    async (targetId: string) => {
      const { error: rpcError } = await supabase.rpc('block_user', {
        p_blocked: targetId,
      });

      if (rpcError) {
        console.error('[useBlocks] engelleme başarısız:', rpcError);
        return { error: 'Kullanıcı engellenemedi, tekrar dene.' };
      }

      // İyimser güncelleme YOK, tam tazeleme var: engelleme nadir bir eylem
      // ve RPC takipleri de sildiği için başka state'ler zaten yeniden
      // okunacak. Yanlış bir iyimser durum burada "engelledim sandım"
      // demekti.
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  /**
   * Engeli kaldır — düz `delete`, RPC gerekmiyor (024'ün DELETE politikası
   * yetiyor). Takip GERİ GELMİYOR ve gelmemeli.
   *
   * ⚠️ `.select()` ŞART: RLS reddi Supabase'de hata değil SESSİZ 0 SATIR
   * (migration 019'un dersi). Yalnızca `error`'a bakan bir istemci, politika
   * reddettiğinde de "kaldırıldı" gösterirdi.
   */
  const unblockUser = useCallback(
    async (targetId: string) => {
      if (!userId) return { error: 'Oturum bulunamadı.' };

      const { data, error: delError } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', targetId)
        .select();

      if (delError) {
        console.error('[useBlocks] engel kaldırılamadı:', delError);
        return { error: 'Engel kaldırılamadı, tekrar dene.' };
      }

      // 0 satır iki anlama gelebilir (politika reddetti / satır zaten yoktu)
      // ve ikisi istemciden AYIRT EDİLEMEZ. İddiada bulunmuyoruz; listeyi
      // yeniden okuyoruz, ekran her iki durumda da gerçeği gösteriyor.
      if (!data || data.length === 0) {
        console.warn('[useBlocks] engel kaldırma 0 satır etkiledi:', targetId);
      }

      await refresh();
      return { error: null };
    },
    [userId, refresh]
  );

  const value = useMemo<BlocksContextValue>(
    () => ({
      blocked,
      blockedByMe,
      ready,
      error,
      isBlocked,
      blockUser,
      unblockUser,
      refresh,
    }),
    [blocked, blockedByMe, ready, error, isBlocked, blockUser, unblockUser, refresh]
  );

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}

export function useBlocks(): BlocksContextValue {
  const ctx = useContext(BlocksContext);
  // Sessiz varsayılan DÖNDÜRÜLMÜYOR (`useAuth`'un kararı): boş bir küme
  // döndürmek, sağlayıcı unutulduğunda filtrelemeyi sessizce kapatırdı ve
  // hata ancak engellenen içerik ekranda görününce fark edilirdi.
  if (!ctx) {
    throw new Error('useBlocks, BlocksProvider içinde kullanılmalı (bkz. App.tsx).');
  }
  return ctx;
}
