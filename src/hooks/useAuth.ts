import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  /**
   * Profil satırını YAZMIYOR — yazan tek şey `on_auth_user_created` trigger'ı.
   *
   * ── Öncesi neydi (CLAUDE.md → Auth / kayıt akışı, madde (e)) ───────────────
   * `signUp({ email, password })` çağrılıyordu, yani `options.data` GÖNDERİLMİYORDU.
   * Trigger metadata okumak üzere yazılmıştı:
   *     coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1))
   * Metadata boş kaldığı için `coalesce` hep ikinci dala düşüyor ve kullanıcı adı
   * **e-postanın @ öncesi** oluyordu — kullanıcının yazdığı ad SESSİZCE ATILIYORDU.
   *
   * Ardından buradan `profiles.insert` deniyordu ama satırı trigger zaten yazmış
   * oluyordu → PK çakışması (`23505`) → ve o çağrının sonucu **hiç kontrol
   * edilmiyordu** (`await` vardı, `error` yakalanmıyordu), yani hata sessizce
   * yutuluyordu. Yani ölü koddu: hiçbir zaman çalışmadı, sadece bir tur ağ yaktı.
   *
   * ── Şimdi ─────────────────────────────────────────────────────────────────
   * Kullanıcı adı `options.data` ile metadata'ya yazılıyor, trigger onu okuyor.
   * Profil yazmanın TEK kaynağı trigger oldu. Yan fayda: e-posta onayı açıldığı
   * gün `signUp` `session: null` döndüreceği için buradaki insert **anon olarak**
   * çalışıp RLS'e de takılacaktı — o sorun kökten kalktı.
   *
   * Çakışma artık sorun değil: migration 012 trigger'da sonek üretiyor
   * (`eren` → `eren2`), yani iki kişinin aynı kullanıcı adını yazması kaydı
   * patlatmıyor.
   */
  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, user, loading, signIn, signUp, signOut };
}
