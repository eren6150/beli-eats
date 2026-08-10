import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase, supabaseRecovery } from '../lib/supabaseClient';

/**
 * Supabase hata KODU → kullanıcıya gösterilecek kısa Türkçe metin.
 *
 * ── NEDEN KOD, MESAJ DEĞİL ───────────────────────────────────────────────────
 * Projenin "hata türü AYRIŞTIRILMIYOR" kararı ağ/native mesajlarını regex'lemek
 * içindi ve o karar duruyor. Bu farklı: `code` **belgeli ve kararlı bir
 * sözleşme** — `useListItems`'ın Postgres `23505`/`23503` kodlarını ayrıştırması
 * da aynı gerekçeye dayanıyor.
 *
 * ── NEDEN HOOK'TA, EKRANDA DEĞİL ─────────────────────────────────────────────
 * Projenin kuralı: **hook kısa Türkçe metin döndürür, ham hata konsola gider.**
 * `useRankings` ve `useProfile` bir kez tam olarak bu şekilde düzeltilmişti.
 * Burada eşleme hook'ta olduğu için iki auth ekranı HİÇ DEĞİŞMEDİ — ikisi de
 * zaten `error.message` gösteriyor, artık gösterdikleri metin bu.
 */
const AUTH_ERROR_TEXT: Record<string, string> = {
  // Onay AÇILDIĞINDA en sık görülecek hata bu olacak (madde b).
  email_not_confirmed:
    'E-postanı onaylaman gerekiyor. Gelen kutunu kontrol et.',
  invalid_credentials: 'E-posta veya şifre hatalı.',
  // Onay KAPALIYKEN bugün de canlı: var olan bir e-postayla kaydolmayı denemek
  // düzgün hata veriyor ama metni ham İngilizce geliyordu.
  user_already_exists: 'Bu e-posta zaten kayıtlı, giriş yapmayı dene.',
  // "Tekrar gönder" için: Supabase kendi hız sınırını uyguluyor ve bizim
  // 60 sn'lik istemci kilidimizden bağımsız (başka cihazdan da denenebilir).
  over_email_send_rate_limit:
    'Çok sık denedin. Biraz bekleyip tekrar dene.',

  // ── Şifre sıfırlama (OTP) ────────────────────────────────────────────────
  // ⚠️ `otp_expired` YANLIŞ KOD İÇİN DE dönüyor, yalnızca süresi dolmuş kod
  // için değil (Supabase ikisini ayırmıyor: "Token has expired or is invalid").
  // Metin bu yüzden iki ihtimali de karşılıyor — "süresi doldu" demek, altı
  // haneyi yanlış yazan kullanıcıya yanlış teşhis koymak olurdu.
  otp_expired: 'Kod geçersiz ya da süresi dolmuş. Yeni kod iste.',
  weak_password: 'Bu şifre çok zayıf, daha güçlü bir tane dene.',
  same_password: 'Yeni şifren eskisiyle aynı olamaz.',
  // Kod doğrulama denemeleri de sınırlı — e-posta gönderiminden ayrı bir kota.
  over_request_rate_limit: 'Çok sık denedin. Biraz bekleyip tekrar dene.',
};

/**
 * Ham `AuthError`'ı ekrana basılabilir bir `Error`'a çevirir; `null` ise `null`.
 *
 * Bilinmeyen kod → tek bir genel metin. Bu **bilinçli**: teşhis koymayan kısa
 * bir mesaj, yanlış teşhis koyan uzun bir mesajdan iyi. Ham nesne zaten
 * `console.error`'da ve KOD ayrı bir alanda basılıyor — eşlenmemiş bir kod
 * çıkarsa testte görünür ve listeye eklenir.
 */
function toDisplayError(error: AuthError | null, kaynak: string): Error | null {
  if (!error) return null;

  console.error(`[useAuth] ${kaynak} — kod:`, error.code ?? '(yok)');
  console.error(`[useAuth] ${kaynak} — ham hata:`, error);

  const text =
    (error.code && AUTH_ERROR_TEXT[error.code]) ??
    'Bir şeyler ters gitti, tekrar dene.';

  return new Error(text);
}

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
  /**
   * Dönüş şekli GENİŞLEDİ (2026-08-09) — `error`'a iki semantik bayrak eklendi.
   * Ekran Supabase detayını (`data.user.identities`) BİLMİYOR; ayrım hook'ta.
   */
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{
    error: Error | null;
    /** E-posta zaten kayıtlı — Supabase bunu hata olarak DÖNDÜRMÜYOR. */
    alreadyRegistered: boolean;
    /** Kayıt oldu ama oturum yok: onay bağlantısı bekleniyor. */
    needsConfirmation: boolean;
  }>;
  /** Onay e-postasını tekrar gönderir. */
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
  /** Şifre sıfırlama için 6 haneli kodu e-postaya gönderir. */
  sendPasswordResetCode: (email: string) => Promise<{ error: Error | null }>;
  /** Kodu doğrulayıp yeni şifreyi yazar. Oturuma DOKUNMAZ (bkz. gövdesi). */
  resetPassword: (
    email: string,
    code: string,
    newPassword: string
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
    return { error: toDisplayError(error, 'signIn') };
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });

      /**
       * ── ÜÇ SONUCU AYIRAN TEK KAYNAK: `session` + `identities` ──────────────
       *
       * `session` VAR            → kullanıcı zaten giriş yaptı (onay KAPALI).
       *                            `RootNavigator` oturumu görüp uygulamaya
       *                            geçiyor; ekranın yapacağı bir şey yok.
       * `session` YOK + identities BOŞ
       *                          → **zaten kayıtlı e-posta** (madde c).
       *                            Supabase onay açıkken e-posta sayımını
       *                            engellemek için HATA DÖNDÜRMÜYOR; sahte bir
       *                            user nesnesi dönüyor ve tek ayırt edici
       *                            işaret `identities` dizisinin boş olması.
       * `session` YOK + identities DOLU
       *                          → **onay bekleniyor** (madde a).
       *
       * Bu ayrım panel ayarını OKUMUYOR: onay açık da olsa kapalı da olsa aynı
       * kod doğru davranıyor. Yapılandırmaya dallanmak, bu projede üç kez
       * pahalıya patlamış "belirli bir yapılandırma için doğru formül"
       * sınıfının auth tarafındaki karşılığı olurdu.
       */
      const alreadyRegistered =
        !error && !data.session && (data.user?.identities?.length ?? 0) === 0;

      const needsConfirmation =
        !error && !data.session && (data.user?.identities?.length ?? 0) > 0;

      return {
        error: toDisplayError(error, 'signUp'),
        alreadyRegistered,
        needsConfirmation,
      };
    },
    []
  );

  /**
   * Onay e-postasını tekrar gönderir (madde d).
   *
   * Spam'e düşen ya da silinen bir onay maili için tek çıkış yolu. Supabase'in
   * `resend`'i zaten vardı ama hiçbir yerden çağrılmıyordu.
   */
  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: toDisplayError(error, 'resend') };
  }, []);

  /**
   * Şifre sıfırlama kodunu gönderir.
   *
   * ── `redirectTo` GÖNDERİLMİYOR — bilinçli ────────────────────────────────
   * Şablon `{{ .Token }}` kullandığı için mailde bağlantı yok; yönlendirilecek
   * bir yer de yok. Bağlantılı akışa (deep link) geçildiği gün burası da
   * değişecek — o iş build paketinin 6. maddesi.
   *
   * ── VAR OLMAYAN E-POSTA HATA DÖNDÜRMEZ ───────────────────────────────────
   * Supabase e-posta sayımını (enumeration) engellemek için kayıtlı olmayan
   * adreslerde de BAŞARILI dönüyor. Ekran bu yüzden "gönderdik" değil
   * "kayıtlıysa gönderdik" diyor — `signUp`'ın `identities` ayrımıyla aynı
   * aile, ama burada ayırt edici bir işaret YOK, yani ayrım da yapılamaz.
   */
  const sendPasswordResetCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: toDisplayError(error, 'resetPasswordForEmail') };
  }, []);

  /**
   * Kodu doğrular ve yeni şifreyi yazar — **ana oturuma hiç dokunmadan**.
   *
   * İki çağrı da `supabaseRecovery` üzerinde: gerekçenin tamamı
   * `supabaseClient.ts`'te, bu istemcinin tanımının başında. Kısaca:
   * `verifyOtp` oturum AÇAR ve ana istemcide çağrılsaydı kullanıcı yeni
   * şifresini girmeden uygulamanın içine düşerdi.
   *
   * ── ADIM SIRASI ÖNEMLİ ───────────────────────────────────────────────────
   * `verifyOtp` başarısızsa `updateUser` HİÇ ÇAĞRILMIYOR — geçersiz kodla
   * şifre yazma denemesi zaten reddedilirdi ama hata mesajı "kodun yanlış"
   * yerine alakasız bir şey olurdu.
   *
   * ── `signOut` HER İKİ YOLDA DA ÇAĞRILIYOR ────────────────────────────────
   * `scope: 'local'` şart: varsayılan `'global'` kullanıcının **diğer
   * cihazlardaki oturumlarını da** kapatırdı. Burada istenen tek şey bu geçici
   * bellek-içi oturumu bırakmak; istemci modül seviyesinde yaşadığı için
   * temizlenmezse uygulama kapanana kadar elde kalırdı.
   */
  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      const { error: verifyError } = await supabaseRecovery.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });

      if (verifyError) {
        return { error: toDisplayError(verifyError, 'verifyOtp') };
      }

      const { error: updateError } = await supabaseRecovery.auth.updateUser({
        password: newPassword,
      });

      await supabaseRecovery.auth.signOut({ scope: 'local' });

      return { error: toDisplayError(updateError, 'updateUser') };
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
    () => ({
      session,
      user,
      loading,
      signIn,
      signUp,
      resendConfirmation,
      sendPasswordResetCode,
      resetPassword,
      signOut,
    }),
    [
      session,
      user,
      loading,
      signIn,
      signUp,
      resendConfirmation,
      sendPasswordResetCode,
      resetPassword,
      signOut,
    ]
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
