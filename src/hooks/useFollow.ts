import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Mevcut kullanıcının `targetUserId`'yi takip edip etmediğini yönetir.
 * @param currentUserId  — Oturum açmış kullanıcının ID'si
 * @param targetUserId   — Takip edilen/edilecek kullanıcının ID'si
 */
export function useFollow(
  currentUserId: string | undefined,
  targetUserId: string | undefined
) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Takip durumunu başlangıçta kontrol et
  useEffect(() => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
    checkFollowStatus();
  }, [currentUserId, targetUserId]);

  const checkFollowStatus = async () => {
    if (!currentUserId || !targetUserId) return;
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId)
      .maybeSingle();

    setIsFollowing(!!data);
  };

  const toggleFollow = useCallback(async () => {
    if (!currentUserId || !targetUserId) return;
    setLoading(true);

    if (isFollowing) {
      // Takibi bırak
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId);
      setIsFollowing(false);
    } else {
      // Takip et
      await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: targetUserId });
      setIsFollowing(true);
    }

    setLoading(false);
  }, [currentUserId, targetUserId, isFollowing]);

  return { isFollowing, loading, toggleFollow, checkFollowStatus };
}

// ─── Followers list hook ───────────────────────────────────────────────────────

export interface FollowUser {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

/**
 * Bir kullanıcının takipçiler veya takip edilenler listesini getirir.
 */
export function useFollowList(
  userId: string | undefined,
  type: 'followers' | 'following'
) {
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    if (type === 'followers') {
      // Bu kullanıcıyı takip edenler
      const { data } = await supabase
        .from('follows')
        .select('follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)')
        .eq('following_id', userId);

      if (data) {
        setUsers(data.map((row: any) => row.profiles).filter(Boolean));
      }
    } else {
      // Bu kullanıcının takip ettikleri
      const { data } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url)')
        .eq('follower_id', userId);

      if (data) {
        setUsers(data.map((row: any) => row.profiles).filter(Boolean));
      }
    }

    setLoading(false);
  }, [userId, type]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { users, loading, fetchList };
}
