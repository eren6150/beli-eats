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

  const updateProfile = async (updates: {
    username?: string;
    full_name?: string;
    bio?: string;
    avatar_url?: string;
  }) => {
    if (!userId) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (!error) {
      // Optimistic local update
      setProfile((prev) =>
        prev ? { ...prev, ...updates } : prev
      );
    }

    return { error };
  };

  return { profile, loading, error, fetchProfile, updateProfile };
}
