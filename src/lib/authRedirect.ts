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
 *   Gerçek APK    → belieats://auth-callback
 * İkisi de Supabase panelindeki Redirect URLs listesinde kayıtlı. Modül
 * seviyesinde sabitlemek, adresi import anında dondurmak olurdu; fonksiyon
 * çağrıldığı anda doğru değeri veriyor.
 *
 * ⚠️ `exp://` kaydı GEÇİCİ ve yalnızca geliştirme içindir; genel yayından önce
 * Supabase panelinden silinmeli (Bilinen Açık İşler'de kayıtlı).
 */
export const AUTH_REDIRECT_PATH = 'auth-callback';

export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_REDIRECT_PATH);
}
