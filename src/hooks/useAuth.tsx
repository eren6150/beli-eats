import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

/**
 * Oturum durumu — TEK KAYNAK (Context).
 *
 * ── ÖNCESİ NEYDİ ─────────────────────────────────────────────────────────────
 * `useAuth` düz bir hook'tu ve HER ÇAĞIRAN kendi bağımsız örneğini kuruyordu:
 * 3 `useState` + bir `getSession()` + bir `onAuthStateChange` aboneliği.
 * Kod tabanında 10 çağrı noktası var (dört ekran, iki modal bileşeni, iki auth
 * ekranı, `RootNavigator`, liste formu) — yani açılışta 10'a kadar ayrı oturum
 * sorgusu ve 10 ayrı abonelik. Mekan detayında "Listeye Ekle" açıkken üç örnek
 * aynı anda yaşıyordu.
 *
 * Asıl zarar performans değil YARIŞTI: her örnek `user = null` ile başlıyor,
 * ekran `user?.id` ile sorgu atıyor, hook erken dönüyor ve oturum çözülünce
 * sorgu TEKRARLANMIYORDU. Dört ekran bunu tek tek
 * `useFocusEffect(useCallback(…, [fetchX]))` ile yamalamak zorunda kalmıştı ve
 * her yeni ekran aynı yamayı gerektiriyordu. Faz 3 en az üç yeni ekran
 * getireceği için refactor onun ÖN KOŞULU olarak yapıldı.
 *
 * ── ŞİMDİ ────────────────────────────────────────────────────────────────────
 * `AuthProvider` bir kez kuruluyor (App.tsx), tüketiciler hazır değeri okuyor.
 * `RootNavigator` zaten `loading` bitene kadar splash gösterdiği için, sekme
 * ekranları mount olduğunda oturum ÇÖZÜLMÜŞ oluyor — yarış kökten kalkıyor.
 *
 * ── DÖNÜŞ ŞEKLİ BİLİNÇLİ OLARAK AYNI ────────────────────────────────────────
 * `{ session, user, loading, signIn, signUp, signOut }` birebir korundu, bu
 * yüzden 10 çağrı noktasının HİÇBİRİ değişmedi — importları bile aynı kaldı.
 * Refactor'ün riskini bu tutuyor: değişen tek şey değerin nereden geldiği.
 *
 * ── `useFocusEffect` YAMALARI SİLİNMEDİ ─────────────────────────────────────
 * O kalıp iki iş görüyor: (a) oturum çözülünce sorguyu tekrarlamak — Context
 * bunu gereksizleştirdi; (b) ekrana her dönüşte veriyi TAZELEMEK — bu hâlâ
 * isteniyor. Silmek ayrı bir davranış değişikliği olurdu.
 */

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

/**
 * Varsayılan `null`: provider yoksa `useAuth` sessizce boş bir oturum
 * döndürmek yerine AÇIKÇA patlasın. Sessiz varsayılan, "kullanıcı yok" gibi
 * görünüp herkesi giriş ekranına atardı ve sebebi kodda görünmezdi.
 */
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

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
  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      return { error };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /**
   * `useMemo` + `useCallback` — süs değil.
   * Provider'ın her render'ında yeni bir nesne/fonksiyon üretmek, değer
   * gerçekten değişmese bile TÜM tüketicileri yeniden render ettirir ve
   * tüketicilerin bağımlılık dizilerini (`useCallback([signOut])` gibi)
   * durmadan geçersiz kılar. Tek örnek olduğu için bunun maliyeti artık
   * uygulama geneline yayılıyor.
   */
  const value = useMemo<AuthContextValue>(
    () => ({ session, user, loading, signIn, signUp, signOut }),
    [session, user, loading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Bu hata yalnızca geliştirme sırasında, ağaca `AuthProvider` koymayı
    // unutunca görülür — kullanıcıya ulaşabilecek bir durum değil.
    throw new Error('useAuth, AuthProvider içinde kullanılmalı (bkz. App.tsx).');
  }
  return ctx;
}
