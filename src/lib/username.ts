import { supabase } from './supabaseClient';

/**
 * Kullanıcı adı doğrulama ve müsaitlik kontrolü — kayıt ve profil düzenleme
 * ekranlarının ORTAK parçası.
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Migration 012 çakışmayı sunucuda çözüyor: `eren` doluysa trigger `eren2`
 * üretiyor ve kayıt ASLA patlamıyor. Bu mekanizma sağlam ve yerinde duruyor.
 * Sorun onun ÇEVRESİNDEYDİ:
 *
 *   1. Yeniden adlandırma TAMAMEN SESSİZ. Kullanıcı `eren` yazıyor, `eren2`
 *      alıyor ve ekranda "Başarılı!" görüyor — adının değiştiği hiçbir yerde
 *      söylenmiyor.
 *   2. (e) düzeltildikten sonra bu KÖTÜLEŞTİ. Eskiden metadata boştu ve taban
 *      e-postanın @ öncesiydi (kimsenin seçmediği bir ad); artık istemci
 *      kullanıcının YAZDIĞI adı gönderiyor, yani sistem bilinçli bir tercihi
 *      sessizce eziyor.
 *   3. Kaçış yolu yoktu: `EditProfile` kullanıcı adını kilitli gösteriyordu.
 *
 * Bu dosya (1) ve (2)'yi önden uyararak, çağıran ekranlar da (3)'ü kilidi
 * açarak kapatıyor. Sunucudaki sonek mantığı EMNİYET AĞI olarak kalıyor —
 * iki kişi aynı anda kaydolursa ön kontrol yarışı çözemez, kısıt çözer.
 */

/** DB'de `not null`; boş/whitespace ad sunucuda `kullanici`'ya düşerdi. */
const MIN_LENGTH = 3;

/**
 * ⚠️ Şemada kullanıcı adının uzunluk sınırı YOK (`username text unique not
 * null`). `review_text`'le aynı tutarsızlık. Buradaki 30 İSTEMCİ tarafı bir
 * savunma; gerçek tavan için CHECK kısıtı ayrı bir migration işi.
 */
const MAX_LENGTH = 30;

/** Boş string `null` değil: alan `not null`, "temizleme" diye bir şey yok. */
export function normalizeUsername(raw: string): string {
  return raw.trim();
}

/**
 * Biçim kontrolü — hata varsa GÖSTERİLECEK metni, yoksa `null` döndürür.
 *
 * ⚠️ KURALLAR BİLİNÇLİ OLARAK MİNİMAL. Karakter kümesi (yalnızca küçük harf,
 * rakam, alt çizgi) ve büyük/küçük harf normalleştirmesi EKLENMEDİ: mevcut
 * kullanıcıların adları e-postanın @ öncesinden türedi ve nokta/tire içerebilir
 * ya da kullanıcının elle yazdığı hali büyük harf taşıyabilir. Daha sıkı bir
 * kural onları geçersiz kılar ve ayrı bir karar + veri göçü gerektirir.
 * Buradaki üç kural yalnızca AÇIKÇA BOZUK girdileri eliyor.
 */
export function validateUsername(username: string): string | null {
  if (username.length < MIN_LENGTH) {
    return `Kullanıcı adı en az ${MIN_LENGTH} karakter olmalı.`;
  }
  if (username.length > MAX_LENGTH) {
    return `Kullanıcı adı en fazla ${MAX_LENGTH} karakter olabilir.`;
  }
  // Boşluk `@eren gencan` gibi bozuk bir görünüm üretirdi.
  if (/\s/.test(username)) {
    return 'Kullanıcı adı boşluk içeremez.';
  }
  return null;
}

/** Çakışmada iki ekranın da gösterdiği TEK metin. */
export const USERNAME_TAKEN_TEXT =
  'Bu kullanıcı adı alınmış, başka bir tane dene.';

/**
 * Kullanıcı adı alınmış mı?
 *
 * ── `checked` NEDEN VAR ──────────────────────────────────────────────────────
 * Sorgu başarısız olursa (ağ hatası, ya da anon rolünün `profiles`'ı
 * okuyamaması) `checked: false` dönüyor ve çağıran **kaydı BLOKLAMIYOR**.
 * Bir kolaylık kontrolünün başarısızlığı, kullanıcının hesap açmasını
 * engellememeli — sunucudaki sonek mantığı zaten devrede.
 *
 * ── YARIŞI ÇÖZMÜYOR, ÇÖZMESİ DE GEREKMİYOR ───────────────────────────────────
 * Kontrol ile yazma arasında başka biri o adı alabilir. Gerçek teklik kısıtın
 * kendisinde: kayıtta trigger sonek üretiyor, düzenlemede `23505` yakalanıp
 * aynı metne çevriliyor. Bu fonksiyon yalnızca yaygın durumu ÖNDEN yakalıyor.
 */
export async function isUsernameTaken(
  username: string
): Promise<{ taken: boolean; checked: boolean }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(1);

  if (error) {
    console.warn('[username] müsaitlik kontrolü yapılamadı:', error);
    return { taken: false, checked: false };
  }

  return { taken: (data ?? []).length > 0, checked: true };
}
