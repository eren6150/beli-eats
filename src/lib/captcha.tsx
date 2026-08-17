import React, { useEffect, useRef } from 'react';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

/**
 * ── BOT KORUMASI — hCaptcha köprüsü ──────────────────────────────────────────
 *
 * Supabase'in CAPTCHA koruması açıkken beş auth ucu token İSTİYOR:
 * `signUp` · `signInWithPassword` · `resend` · `resetPasswordForEmail` ·
 * `verifyOtp`. Token üretmenin tek yolu hCaptcha'nın web widget'ı, o da bir
 * WebView içinde çalışıyor — `react-native-webview` bu yüzden eklendi ve bu
 * yüzden bu iş OTA ile GİDEMEZ.
 *
 * ── 🔴 DAĞITIM SIRASI — TERSİ SAHAYI KIRAR ───────────────────────────────────
 * Supabase'deki anahtar PROJE GENELİ ve geri uyumluluk kaçışı YOK: açıldığı an
 * token taşımayan her istek reddedilir. Sahadaki APK token göndermiyor, yani
 * anahtar erken açılırsa kayıt/giriş/şifre sıfırlama ANINDA ölür ve düzeltme
 * OTA ile gönderilemez. Sıra: **build → herkes kursun → doğrula → SONRA
 * panel anahtarı.** (Migration 017'nin "önce migration sonra OTA" durumunun
 * daha sert hali: orada `default true` eski istemciyi koruyordu, burada
 * koruyan bir varsayılan yok.)
 *
 * Ters yön güvenli ve bu planın emniyet kemeri: token GÖNDEREN istemci anahtar
 * KAPALIYKEN de çalışır, sunucu token'a bakmaz. Geri alma bu yüzden anlık ve
 * kodsuz — bir şey ters giderse panelden anahtarı kapatmak yeter.
 *
 * ── NEDEN MODÜL FONKSİYONU, HOOK DEĞİL ───────────────────────────────────────
 * `useAuth`'un beş callback'i de token istiyor ve hiçbiri bir hook örneğine
 * sahip değil. `addPlaceToList`'in `useListItems` dışında modül seviyesinde
 * durmasıyla aynı gerekçe: çağıran, hook'un yaşadığı yerde değil. Yan fayda,
 * `useCallback` bağımlılık dizilerinin boş kalması.
 *
 * ── EKRANLAR DEĞİŞMİYOR ──────────────────────────────────────────────────────
 * Widget'ı `AuthProvider` kendi ağacında render ediyor, üç auth ekranı token'ı
 * hiç görmüyor. `useAuth`'un Context'e çevrilmesindeki kararın aynısı: dönüş
 * şekli birebir korunur, çağrı noktaları değişmez. Supabase/hCaptcha detayı
 * hook'ta kalır (`toDisplayError`'ın gerekçesi).
 */

/**
 * Site anahtarı PUBLIC'tir (gizli olan, Supabase paneline girilen secret key).
 * `EXPO_PUBLIC_*` çalışma anında okunmaz, BUNDLE'A GÖMÜLÜR — yani EAS
 * ortamında tanımlı değilse buraya boş string gelir.
 *
 * ⚠️ O durumda uygulamayı KİLİTLEMİYORUZ, tokensiz devam ediyoruz:
 * anahtar kapalıyken her şey normal çalışır, açıkken düzgün bir captcha
 * hatası verir. `supabaseClient.ts`'in "açılışta fırlatma, konsola tam teşhis
 * yaz" kararının aynısı — eksik yapılandırmayı sessiz bir ölüme çevirmek bu
 * projede bir kez APK'yı açılışta çökertmişti.
 */
const SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY ?? '';

if (!SITE_KEY) {
  console.error(
    '[captcha] EXPO_PUBLIC_HCAPTCHA_SITE_KEY tanımsız. Doğrulama token\'ı ' +
      'ÜRETİLMEYECEK. Supabase panelinde CAPTCHA koruması KAPALIYSA uygulama ' +
      'normal çalışır; AÇIKSA kayıt/giriş/şifre sıfırlama reddedilir. ' +
      'Yerelde: .env dosyasına ekle ve Metro sunucusunu yeniden başlat ' +
      '(bundle bir kez gömüyor). EAS build ise: expo.dev > Environment ' +
      'variables altında preview ve production ortamlarına ekle.'
  );
}

export type CaptchaResult = {
  /** Sunucuya gönderilecek tek kullanımlık token. `null` → token yok, devam et. */
  token: string | null;
  /** Kullanıcı doğrulamayı kapattı. HATA DEĞİL — sunum çağırana ait. */
  cancelled: boolean;
  error: Error | null;
};

/** Token yok ama engel de yok: çağıran isteği tokensiz göndersin. */
const PROCEED_WITHOUT_TOKEN: CaptchaResult = {
  token: null,
  cancelled: false,
  error: null,
};

/**
 * Bekleyen isteği sonsuza kadar asılı bırakmamak için üst sınır.
 *
 * hCaptcha'nın kendi yükleme zaman aşımı var (`error` mesajı gönderiyor), ama
 * o yalnızca YÜKLEMEYİ kapsıyor. Widget yüklenip hiç cevap vermezse bu
 * backstop devreye giriyor — yoksa ekrandaki "Giriş Yap" spinner'ı sonsuza
 * kadar dönerdi. Bu projede "sonsuz spinner" bir kez gerçek bir hata oldu
 * (dosyası eksik fotoğraf, tam ekran görüntüleyici).
 */
const TOKEN_TIMEOUT_MS = 120_000;

let pendingResolve: ((result: CaptchaResult) => void) | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let showChallenge: (() => void) | null = null;
let hideChallenge: (() => void) | null = null;

/**
 * Bekleyen promise'i tek seferlik olarak kapatır.
 *
 * ⚠️ İDEMPOTENT OLMASI ŞART, süs değil. `hide()`'ın sözleşmesi belirsiz:
 * kütüphanenin `.d.ts`'i "argümansız çağırmak `cancel` olayını tetikler" gibi
 * okunabiliyor ama KAYNAK bunun tersini yapıyor (`if (source) onMessage(...)`,
 * yani argümansız çağrı olay ÜRETMİYOR). İki okumadan hangisi doğru olursa
 * olsun sonuç aynı kalsın diye ilk kapatan kazanıyor; sonradan gelen sahte bir
 * `cancel` sessizce yutuluyor.
 */
function settle(result: CaptchaResult) {
  if (!pendingResolve) return;

  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;

  const resolve = pendingResolve;
  pendingResolve = null;
  resolve(result);
}

/**
 * hCaptcha'dan gelen olaylar.
 *
 * Sözleşme (kütüphanenin README'si + kaynağı):
 *   · `event.success === true` → `nativeEvent.data` TOKEN'dır
 *   · `'open'`   → challenge görünür oldu; **terminal DEĞİL**, beklemeye devam
 *   · `'cancel'` / `'challenge-closed'` → kullanıcı kapattı
 *   · `'expired'` / `'error'` / hCaptcha hata kodları → başarısız
 */
function handleMessage(event: {
  nativeEvent?: { data?: string };
  success?: boolean;
  markUsed?: () => void;
}) {
  const data = event?.nativeEvent?.data;
  if (!data) return;

  if (event.success) {
    // Token tek kullanımlık; kütüphane tekrar kullanımı bu çağrıyla işaretliyor.
    event.markUsed?.();
    hideChallenge?.();
    settle({ token: String(data), cancelled: false, error: null });
    return;
  }

  // Challenge AÇILDI — bir sonuç değil, bir ara durum. Erken kapatmak
  // kullanıcıyı bulmacayı çözerken yarıda keserdi.
  if (data === 'open') return;

  if (data === 'cancel' || data === 'challenge-closed') {
    hideChallenge?.();
    settle({ token: null, cancelled: true, error: null });
    return;
  }

  // Kural: ekrana kısa ve eyleme dönük metin, konsola tam teşhis.
  console.error('[captcha] doğrulama başarısız:', data);
  hideChallenge?.();
  settle({
    token: null,
    cancelled: false,
    error: new Error('Doğrulama tamamlanamadı, tekrar dene.'),
  });
}

/**
 * Bir doğrulama turu çalıştırıp token döndürür.
 *
 * `size: 'invisible'` olduğu için çoğu turda kullanıcı HİÇBİR ŞEY görmüyor —
 * hCaptcha yalnızca şüphelendiğinde bulmaca çıkarıyor. Görünür bir checkbox'ı
 * her girişe koymak, korumanın bedelini her meşru kullanıcıya ödetirdi.
 */
export async function getCaptchaToken(): Promise<CaptchaResult> {
  if (!SITE_KEY) return PROCEED_WITHOUT_TOKEN;

  if (!showChallenge) {
    // `CaptchaHost` ağaçta değil. Auth'u kilitlemek yerine tokensiz devam:
    // yanlış kurulmuş bir ağaç, kullanıcıyı uygulamanın dışında bırakmamalı.
    console.error(
      '[captcha] CaptchaHost ağaçta değil, token üretilemiyor. ' +
        'AuthProvider onu render etmeli (bkz. useAuth.tsx).'
    );
    return PROCEED_WITHOUT_TOKEN;
  }

  if (pendingResolve) {
    // Ekranlar butonu `loading` ile zaten kilitliyor; buraya düşmek bir hata
    // işareti. İkinci turu başlatmak ilkinin token'ını çöpe atardı.
    console.error('[captcha] önceki doğrulama sürerken yenisi istendi.');
    return {
      token: null,
      cancelled: false,
      error: new Error('Doğrulama zaten sürüyor, biraz bekle.'),
    };
  }

  return new Promise<CaptchaResult>((resolve) => {
    pendingResolve = resolve;
    pendingTimer = setTimeout(() => {
      console.error('[captcha] zaman aşımı — widget cevap vermedi.');
      hideChallenge?.();
      settle({
        token: null,
        cancelled: false,
        error: new Error('Doğrulama tamamlanamadı, tekrar dene.'),
      });
    }, TOKEN_TIMEOUT_MS);

    showChallenge?.();
  });
}

/**
 * Widget'ın ağaçtaki tek örneği. `AuthProvider` render ediyor.
 *
 * Gizliyken hiçbir yer kaplamıyor: kütüphane her şeyi
 * `<Modal transparent visible={show}>` içine koyuyor, `show` false iken ağaç
 * boş. Bu yüzden `children`'ın yanına konması güvenli.
 */
export function CaptchaHost() {
  const ref = useRef<ConfirmHcaptcha>(null);

  useEffect(() => {
    showChallenge = () => ref.current?.show();
    hideChallenge = () => ref.current?.hide();

    return () => {
      showChallenge = null;
      hideChallenge = null;
      // Sağlayıcı sökülürken bekleyen bir tur varsa çağıranı asılı bırakma.
      settle({ token: null, cancelled: true, error: null });
    };
  }, []);

  if (!SITE_KEY) return null;

  return (
    <ConfirmHcaptcha
      ref={ref}
      siteKey={SITE_KEY}
      baseUrl="https://hcaptcha.com"
      languageCode="tr"
      size="invisible"
      onMessage={handleMessage}
    />
  );
}
