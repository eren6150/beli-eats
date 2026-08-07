import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Profile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileWithStats extends Profile {
  followersCount: number;
  followingCount: number;
  rankingsCount: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Profil verisi
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        // Ham mesaj ekrana ÇIKMIYOR (CLAUDE.md → hata mesajı kuralı).
        // "Satır yok" ile "sorgu patladı" AYRI iki durum: ilki kullanıcının
        // profili gerçekten oluşmamış demek (kayıt trigger'ı), ikincisi
        // ağ/sunucu. Kullanıcıya farklı şey söylemek gerekiyor.
        if (profileError) {
          console.error('[useProfile] profil okunamadı:', profileError);
          setError('Profil bilgin yüklenemedi. Bağlantını kontrol et.');
        } else {
          console.warn('[useProfile] profil satırı yok:', userId);
          setError('Profil bilgin bulunamadı.');
        }
        setLoading(false);
        return;
      }

      // 2. Takipçi sayısı (kaç kişi bu kullanıcıyı takip ediyor)
      const { count: followersCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      // 3. Takip edilen sayısı (bu kullanıcı kaç kişiyi takip ediyor)
      const { count: followingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      // 4. Toplam mekan sayısı
      const { count: rankingsCount } = await supabase
        .from('user_rankings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      setProfile({
        ...profileData,
        followersCount: followersCount ?? 0,
        followingCount: followingCount ?? 0,
        rankingsCount: rankingsCount ?? 0,
      });
    } catch (e) {
      // `any` KALKTI: yakalanan değerin `message`'ı olduğu garanti değil ve
      // olsa bile ham metin ekrana gitmemeli.
      console.error('[useProfile] profil yüklenirken hata:', e);
      setError('Profil bilgin yüklenemedi. Bağlantını kontrol et.');
    }

    setLoading(false);
  }, [userId]);

  /**
   * Profil alanlarını günceller.
   *
   * ── `updated_at` GÖNDERİLMİYOR (düzeltildi) ──────────────────────────────
   * Eskiden `updated_at: new Date().toISOString()` yazılıyordu. Ama migration
   * 004 `profiles`'a `set_updated_at` trigger'ı ekledi — sunucu zaten yazıyor.
   * İstemcinin saatine güvenmek gereksiz ve saat kayarsa yanlış. `useLists`
   * ve `useListItems` bu satırı zaten göndermiyor; `updateProfile` aykırıydı.
   *
   * ── BOŞ PATCH'TE ERKEN DÖNÜŞ (eklendi) ───────────────────────────────────
   * `ListFormScreen`'in deseni: değişen alan yoksa ağa hiç çıkma. Onsuz
   * "hiçbir şeyi değiştirmeden Kaydet" her seferinde bir UPDATE atıyor ve
   * trigger `updated_at`'i boşuna ilerletiyordu.
   *
   * ── `null` KABUL EDİLİYOR ────────────────────────────────────────────────
   * `full_name`/`bio` nullable ve kullanıcı alanı BOŞALTABİLMELİ. Tip `string`
   * olsaydı temizleme ifade edilemez, boş string yazılırdı — "adı yok" ile
   * "adı boş string" ayrımını DB'ye taşımak sonradan pişmanlık olurdu.
   */
  const updateProfile = async (updates: {
    username?: string;
    full_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
  }) => {
    if (!userId) return { error: new Error('Not authenticated') };

    // `undefined` alanlar "dokunma" demek; onları ayıklıyoruz ki
    // Supabase'e gereksiz kolon göndermeyelim.
    const patch = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(patch).length === 0) return { error: null };

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId);

    if (error) {
      console.error('[useProfile] profil güncellenemedi:', error);
      return { error };
    }

    // İyimser yerel güncelleme — ekran anında doğru görünsün.
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));

    return { error: null };
  };

  return { profile, loading, error, fetchProfile, updateProfile };
}
