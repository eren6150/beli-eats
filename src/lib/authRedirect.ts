import * as Linking from 'expo-linking';

/**
 * Auth yönlendirmelerinin TEK adresi — e-posta onayı ve Google girişi ikisi de
 * buraya dönüyor.
 *
 * ── NEDEN TEK YOL, İKİ AYRI ADRES DEĞİL ──────────────────────────────────────
 * İki akış da aynı şeyi getiriyor: bir `?code=`. Ayrı adresler iki ayrı
 * dinleyici, iki ayrı ayrıştırma ve iki ayrı Supabase Redirect URL kaydı
 * demekti — ve bunlardan biri unutulduğunda hata ancak sahada görünürdü.
 * `AuthProvider`'daki tek işleyici ikisini de karşılıyor.
 *
 * ── NEDEN FONKSİYON, SABİT DEĞİL ─────────────────────────────────────────────
 * `createURL` çalıştığı ORTAMA göre farklı adres üretiyor:
 *   Expo Go       → exp://192.168.x.x:8081/--/auth-callback
 *   Gerçek APK    → com.eren.platestamp://auth-callback
 * Modül seviyesinde sabitlemek, adresi import anında dondurmak olurdu;
 * fonksiyon çağrıldığı anda doğru değeri veriyor.
 *
 * ⚠️ EXPO GO BİÇİMİ SUPABASE TARAFINDAN KABUL EDİLMİYOR — kanıtlandı.
 * `exp://IP:PORT/--/auth-callback` üç ayrı Redirect URL deseniyle denendi
 * (joker, çift joker ve **jokersiz birebir adres**) ve üçünde de Supabase
 * adresi yok sayıp Site URL'e düştü. Gerçek APK'daki `com.eren.platestamp://auth-callback`
 * ise **ilk denemede çalıştı** (2026-08-11, versionCode 5).
 * Yani bu yolda Expo Go ile doğrulama yapılamaz; deneyen bir sonraki kişi
 * aynı üç turu tekrar etmesin. Tam teşhis: CLAUDE.md → Bilinen Açık İşler.
 */
export const AUTH_REDIRECT_PATH = 'auth-callback';

export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_REDIRECT_PATH);
}
