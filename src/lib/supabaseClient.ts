import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// EXPO_PUBLIC_* değerleri BUNDLE'A GÖMÜLÜR, çalışma anında okunmaz: Expo Go'da
// Metro yerel .env'den, EAS build'inde ise eas.json'daki profilin `environment`
// alanının işaret ettiği ortamdan. O alan profilde yoksa değerler bundle'a hiç
// girmez ve aşağıdaki iki sabit boş string kalır.
//
// Boş bırakmak SESSİZ BİR ÇÖKME demekti ve bir preview APK'sında tam olarak
// yaşandı: createClient boş string'i falsy sayıp modül import'unda
// `supabaseUrl is required.` fırlatıyor (@supabase/supabase-js helpers.ts:110),
// exception React ağacı kurulmadan atıldığı için uygulama hiçbir arayüz
// göstermeden kapanıyor. Cihazda görünen tek şey "sürekli olarak duruyor".
//
// Kural (CLAUDE.md): ekrana kısa ve eyleme dönük metin, konsola tam teşhis.
// Bu yüzden burada FIRLATMIYORUZ. Uygulama açılıyor, teşhis konsola gidiyor,
// kullanıcı ekranlarda zaten var olan kısa hata şeridini ("Bağlantını kontrol
// et" + Tekrar dene) görüyor. Açılışta çökmek bunun en kötü biçimiydi: ne
// kullanıcı ne geliştirici sebebi görebiliyordu.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const missingEnvVars: string[] = [];
if (!supabaseUrl) missingEnvVars.push('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseAnonKey) missingEnvVars.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (missingEnvVars.length > 0) {
  // Kurulum hatası, geliştiriciye ait: konsola tam adımlarla.
  console.error(
    '[supabaseClient] Zorunlu ortam değişkeni eksik: ' +
      missingEnvVars.join(', ') +
      '. Supabase çağrılarının tamamı başarısız olacak (giriş yapılamaz, ' +
      'veri gelmez). Yerelde: .env dosyasını kontrol et ve Metro sunucusunu ' +
      'yeniden başlat (bundle bir kez gömüyor). EAS build ise: eas.json ' +
      'profilinde "environment" alanı ile expo.dev > Environment variables ' +
      'listesindeki ortamın eşleştiğini doğrula.'
  );
}

// Yer tutucu, açılıştaki çökmeyi sıradan bir ağ hatasına dönüştürüyor.
// `https://` öneki şart: createClient onu da doğruluyor.
const UNCONFIGURED_URL = 'https://unconfigured.invalid';
const UNCONFIGURED_KEY = 'unconfigured';

export const supabase = createClient(
  supabaseUrl || UNCONFIGURED_URL,
  supabaseAnonKey || UNCONFIGURED_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

/**
 * ── ŞİFRE SIFIRLAMA İÇİN AYRI İSTEMCİ ────────────────────────────────────────
 *
 * ⚠️ Bu ikinci istemci bir "temizlik" tercihi DEĞİL, bir hata sınıfını kökten
 * kaldıran bir karar. Sadeleştirip tek istemciye indirmek hatayı geri getirir.
 *
 * ── NEYDİ ────────────────────────────────────────────────────────────────────
 * `verifyOtp({ type: 'recovery' })` başarılı olduğunda **oturum açar**. Ana
 * istemcide çağrılsaydı `onAuthStateChange` tetiklenir, `AuthProvider`
 * `session`'ı doldurur ve `RootNavigator`'ın `session ? <Main/> : <Auth/>`
 * anahtarı dönerdi — yani kullanıcı **yeni şifresini girmeden** uygulamanın
 * içine düşer, sıfırlama ekranı unmount olurdu.
 *
 * Asıl zarar navigasyon değil SESSİZ YANLIŞ DURUM: ardından gelen
 * `updateUser` patlarsa (ağ hatası, "şifre çok zayıf") kullanıcı uygulamanın
 * içindedir, şifresi DEĞİŞMEMİŞTİR ve bunu söyleyen hiçbir şey yoktur. Yanlışı
 * ancak bir dahaki girişte, yeni şifresi kabul edilmediğinde fark ederdi.
 *
 * ── ŞİMDİ ────────────────────────────────────────────────────────────────────
 * Doğrulama ve şifre yazma bu istemcide olup bitiyor; ana istemcinin oturumu
 * hiç değişmiyor, `RootNavigator` kımıldamıyor, ekran akışın sonuna kadar
 * kontrolü elinde tutuyor ve hatayı düzgün gösterebiliyor.
 *
 * Yan fayda: akış "şifren güncellendi → giriş yap" ile bitiyor, yani yeni şifre
 * ANINDA kanıtlanıyor. Yazım hatası orada yakalandığı için ayrı bir "şifreni
 * tekrar gir" alanına da gerek kalmadı.
 *
 * ── ÜÇ AYARIN ÜÇÜ DE ZORUNLU ────────────────────────────────────────────────
 * `persistSession: false`  → oturum yalnızca bellekte; diske hiç yazılmıyor.
 * `storageKey` FARKLI      → emniyet kemeri. supabase-js depolama anahtarını
 *                            proje URL'inden türetiyor, yani iki istemci
 *                            varsayılanda AYNI anahtarı kullanır; bir gün
 *                            `persistSession` yanlışlıkla açılırsa bu istemci
 *                            kullanıcının GERÇEK oturumunu ezerdi.
 * `autoRefreshToken: false`→ geçici bir oturum, arka planda yenilenmesin.
 */
export const supabaseRecovery = createClient(
  supabaseUrl || UNCONFIGURED_URL,
  supabaseAnonKey || UNCONFIGURED_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-beli-eats-recovery',
    },
  }
);
