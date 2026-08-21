/**
 * Platestamp — Global Design System
 *
 * İKİ KATMANLI YAPI:
 *
 *   Palette (ham ramp'ler)  →  Colors (anlamsal token'lar)  →  ekranlar
 *
 * Ekranlar YALNIZCA `Colors` / `Type` / `Spacing` / `Radius` / `Elevation`
 * import eder. `Palette`'e doğrudan erişmek yasak — o zaman marka rengini
 * değiştirmek tekrar dosya taramasına dönüşür.
 *
 * NEDEN İKİ KATMAN:
 *  1. Marka değişimi tek nokta. Kodda dört ayrı açık yeşil vardı
 *     (#DCFCE7, #F0FDF4, #D1FAE5, #BBF7D0); `Colors.primary` değiştirilse
 *     üçü yeşil kalıyordu. Artık hepsi `Palette.green` ramp'ine bakıyor.
 *  2. Dark mode ileride mümkün. `surface`/`textPrimary` gibi anlamsal isimler
 *     tema başına farklı ramp'e bağlanabilir; `card`/`background` bunu
 *     kapatıyordu. DARK MODE BUGÜN İNŞA EDİLMİYOR — yalnızca kapı açık.
 *
 * GEÇİŞ TAMAMLANDI (Faz 1b, 2026-07-31): dosyanın sonunda bir dönem duran
 * "LEGACY" blokları (`FontSize`, `FontWeight`, `Shadow` ve 15 deprecated renk)
 * SİLİNDİ. Artık tek isim seti var — bir token'ın iki adı olması, ikisinin
 * zamanla ayrışması demekti.
 */

import type { TextStyle, ViewStyle } from 'react-native';

// ═══════════════════════════════════════════════════════════════════════════
// PALETTE — ham ramp'ler. Ekranlar buradan OKUMAZ.
// ═══════════════════════════════════════════════════════════════════════════
//
// Ramp'ler Tailwind ölçeğinden alındı. Sebep: kodda zaten kullanılan renklerin
// neredeyse tamamı bu ramp'lerin üyesiydi — biz onları isimlendirmemişiz.
// Üç kaçak tespit edildi ve ramp'e çekildi:
//   #D1FAE5 → emerald-100'dü (yanlış aile), green-100 oldu
//   #FEF9C3 → yellow-100'dü (yanlış aile), amber-100 oldu
//   #F0F0F0 → hiçbir ramp'te yoktu, gray-100 oldu
// Son ikisi görünür (çok küçük) bir renk değişimi demek; ekran ekran
// migrasyonda uygulanıyor, bu dosyada değil (bkz. LEGACY blokları).

const Palette = {
  /**
   * ── MARKA RAMP'İ: ZEYTİN YEŞİLİ (2026-08-13) ──────────────────────────────
   * Önceki hal Tailwind `green` (500 = #22C55E) idi ve bilinçli olarak
   * değiştirildi: o ton "bildirim yeşili" gibi okunuyordu, yemek uygulamasına
   * ait hissettirmiyordu. Yenisi bir tasarım turundan çıktı ve **500 adımı
   * elle seçildi** (`#5F7527`) — ara adımlar HSL üzerinden ondan türetildi
   * (H≈77, S≈50, L eğrisi 500'de bu tona oturacak şekilde kuruldu).
   *
   * ⚠️ 500'ü hesaplanmış değere (#607728) yuvarlama: YAPILMADI. Seçilen ton
   * korunuyor, ramp ona uyuyor — tersi değil.
   *
   * 🎁 YAN KAZANÇ — KONTRAST DÜZELDİ. Beyaz metin (`textOnBrand`) birincil
   * butonun üstünde eski yeşilde **2.3:1** ile WCAG AA eşiğinin (4.5:1)
   * ALTINDAYDI; koyu zeytinde **5.2:1**. Yani "Puanı Kaydet" butonunun yazısı
   * bugüne kadar erişilebilirlik sınırının altındaydı ve bu tesadüfen kapandı.
   *
   * 300/400/700/800/900 bugün hiçbir yerden OKUNMUYOR (yalnızca 50/100/200/
   * 500/600 kullanılıyor); ramp'in tamlığı için duruyorlar, koyu uçtaki
   * sıkışma pratikte görünmüyor.
   */
  green: {
    50: '#F6F8F2',
    100: '#EBEFE1',
    200: '#D8E1C1',
    300: '#BBCC8E',
    400: '#92B045',
    500: '#5F7527',
    600: '#506520',
    700: '#415219',
    800: '#344413',
    900: '#28340E',
  },

  /**
   * SICAK NÖTR — yalnızca zemin için.
   *
   * `canvas`/`canvasAlt` bir dönem `gray` ramp'ine bakıyordu (#F9FAFB), yani
   * SOĞUK bir griydi. Zeytin yeşiliyle birlikte istenen his sıcak krem; fark
   * küçük ama ekranın tamamını kapladığı için baskın.
   *
   * ⚠️ METİN VE KENARLIK GRİLERİ NÖTR KALIYOR, bilinçli: onları da ısıtmak
   * metni çamurlaştırır ve okunabilirliği düşürür — ayrı ve riskli bir karar.
   * Bu ramp'in işi yalnızca zemin.
   */
  sand: {
    50: '#F9F8F5',
    100: '#F3F1ED',
    200: '#E7E5DE',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  /**
   * PUANLAMA SARISI. 500 adımı `#F59E0B`'den `#E4A425`'e çekildi (2026-08-13):
   * eski ton turuncuya kaçıyordu ve zeytin yeşilinin yanında cırtlak
   * duruyordu; yenisi daha derin ve sakin bir altın.
   *
   * ⚠️ YARIM YILDIZ MEKANİZMASINA DOKUNULMADI. `StarRating` dolu `★` glifini
   * kırparak yarım yıldız çiziyor ve bu fonttan bağımsız çalışsın diye
   * bilinçli seçilmişti; burada değişen yalnızca renk.
   */
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    300: '#FCD34D',
    500: '#E4A425',
    700: '#B45309',
    900: '#78350F',
  },
  red: {
    50: '#FEF2F2',
    200: '#FECACA',
    500: '#EF4444',
    700: '#B91C1C',
  },
  white: '#FFFFFF',
  black: '#000000',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// COLORS — anlamsal token'lar. Ekranların kullandığı katman.
// ═══════════════════════════════════════════════════════════════════════════

export const Colors = {
  // ─── Marka ───────────────────────────────────────────────────────────────
  // İsim/logo netleştiğinde YALNIZCA Palette.green ramp'i değişir; aşağıdaki
  // beş token ve onları kullanan her ekran birlikte döner.
  brand: Palette.green[500],
  /** Basılı/aktif durum, koyu zemin üzerinde metin */
  brandStrong: Palette.green[600],
  /** Chip zemini, hafif vurgu */
  brandSubtle: Palette.green[100],
  /** En açık marka zemini — buton/kart arka planı */
  brandSurface: Palette.green[50],
  /** Marka zeminli öğelerin kenarlığı */
  brandBorder: Palette.green[200],
  /**
   * ⚠️ RAMP'E BAĞLI DEĞİL — elle güncellenmesi gereken TEK marka değeri.
   * `rgba()` gerektiği için `Palette.green[500]`'den türetilemiyor; ramp
   * değişirse burası SESSİZCE eski renkte kalır. 2026-08-13'te zeytine
   * çevrildi: `#5F7527` = rgb(95,117,39).
   */
  brandShadow: 'rgba(95,117,39,0.30)',

  // ─── Yüzeyler ────────────────────────────────────────────────────────────
  /** Kart, sheet, header — içeriğin üstünde durduğu yüzey */
  surface: Palette.white,
  /**
   * Ekranın en alt zemini. SICAK nötr (`sand`), soğuk gri DEĞİL — zeytin
   * yeşiliyle birlikte istenen krem hissi buradan geliyor. Fark küçük ama
   * ekranın tamamını kapladığı için baskın.
   */
  canvas: Palette.sand[50],
  /** Girdi alanı, thumb placeholder, pasif buton */
  canvasAlt: Palette.sand[100],

  // ─── Metin ───────────────────────────────────────────────────────────────
  textPrimary: Palette.gray[900],
  /** Başlık altı, form etiketi — primary ile secondary arası */
  textStrong: Palette.gray[700],
  textSecondary: Palette.gray[500],
  textMuted: Palette.gray[400],
  textInverse: Palette.white,
  /** Marka zemini üzerindeki metin */
  textOnBrand: Palette.white,

  // ─── Kenarlıklar ─────────────────────────────────────────────────────────
  /** Ayraç, liste satır çizgisi, kart kenarlığı. */
  borderSubtle: Palette.gray[100],
  borderStrong: Palette.gray[200],
  /** Girdi alanı kenarlığı, daha belirgin ayrım */
  borderMuted: Palette.gray[300],

  // ─── Puanlama ────────────────────────────────────────────────────────────
  // Tek görsel dil: eskiden StarRating dolu yıldızı #F59E0B, RestaurantCard
  // rozeti #FCD34D ile çiziyordu. Aynı üründe iki farklı puanlama altını.
  rating: Palette.amber[500],
  /** Boş yıldız — dolu yıldızın altındaki taban katman */
  ratingTrack: Palette.gray[200],
  /** "Google ortalaması" gibi puan etiketlerinin zemini */
  ratingSurface: Palette.amber[100],
  ratingText: Palette.amber[900],

  // ─── Durum ───────────────────────────────────────────────────────────────
  danger: Palette.red[500],
  dangerSurface: Palette.red[50],
  dangerBorder: Palette.red[200],
  warning: Palette.amber[500],
  success: Palette.green[500],

  // ─── Örtü katmanları ─────────────────────────────────────────────────────
  /** Fotoğraf üstü rozet zemini — metin okunabilir kalmalı */
  scrim: 'rgba(0,0,0,0.62)',
  /** Görsel altı yumuşak koyulaştırma */
  scrimSoft: 'rgba(0,0,0,0.08)',
  /** Modal/sheet arkası */
  scrimMedium: 'rgba(0,0,0,0.45)',
  /**
   * Tam ekran görsel görüntüleyici zemini (`PhotoGrid`).
   * `scrimMedium` burada YETMİYOR: arkadaki arayüz fotoğrafın kenarlarından
   * sızıp dikkat dağıtıyor ve açık renkli fotoğraflarda kontrast kayboluyor.
   * Ayrı bir rol, çünkü modal arkası ile görsel zemini farklı işler —
   * birini koyulaştırmak diğerini de koyulaştırmamalı.
   */
  scrimStrong: 'rgba(0,0,0,0.92)',
  /**
   * Opacity'si ANİMASYONLANAN örtüler için opak taban.
   * rgba token'ı kullanılamaz: kendi alfası animasyonlu opacity ile çarpışıp
   * beklenenden açık bir örtü verir.
   */
  scrimBase: Palette.black,
  /** Görsel üstünde duran yarı saydam beyaz yüzey (geri butonu vb.) */
  surfaceTranslucent: 'rgba(255,255,255,0.92)',

  // ─── İskelet yükleyici ───────────────────────────────────────────────────
  skeletonBase: Palette.gray[200],
  skeletonHighlight: Palette.gray[100],

} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE — tipografi rolleri
// ═══════════════════════════════════════════════════════════════════════════
//
// Eski `FontSize` (SİLİNDİ) 11→32 arası 12 kademeydi ve altısı 5px içine
// sıkışmıştı (xs 11, sm 12, base 13, md 14, lg 15, xl 16). Bu bir hiyerarşi
// kurmuyor; her ekran komşu değerlerden birini keyfî seçiyordu.
//
// Rol bazlı yapının farkı: boyut, satır yüksekliği ve kalınlık BİRLİKTE
// geliyor. Tutarlı tipografi kademe sayısından değil, bu üçlünün her yerde
// aynı eşleşmesinden çıkıyor.
//
// Kullanım: <Text style={[Type.heading, { color: Colors.textPrimary }]}>
// Renk bilinçli olarak dahil DEĞİL — aynı rol farklı zeminlerde kullanılıyor.

/**
 * ── ÖLÇEK KONTRASTI AÇILDI (2026-08-13) ─────────────────────────────────────
 * Üst üç kademe büyütüldü: `display` 28→32, `title` 22→24, `heading` 17→18.
 * `body` ve aşağısı DEĞİŞMEDİ.
 *
 * NEDEN: tasarım turunda istenen "hiyerarşi okunmadan, bir bakışta hissedilsin"
 * etkisinin büyük kısmı fonttan değil, başlık ile gövde ARASINDAKİ FARKTAN
 * geliyor. Eskiden `heading` 17 ile `body` 15 arasında 2px vardı — aynı
 * ağırlıkta görünüyorlardı; şimdi 3px + kalınlık farkı.
 *
 * Satır yükseklikleri oranı büyüdükçe SIKILAŞIYOR (display 1.19, title 1.25,
 * heading 1.33, body 1.47): büyük metin kendi içinde daha az nefes ister,
 * aksi halde başlıklar dağınık görünür.
 *
 * ⚠️ `display` bir dönem 32'den 28'e ÇEKİLMİŞTİ (Faz 1b adım 7, iki auth
 * ekranı farklı boyuttaydı ve rol tek olduğu için birleşmişti). O bir
 * birleştirme kararıydı, ölçü kararı değil — 32'ye dönmek onu bozmuyor,
 * iki ekran hâlâ tek rolden besleniyor.
 *
 * Kullanım yeri az ve kontrollü: `display` 6 yerde (mekan adı, profil adı,
 * splash, üç auth ekranı). ⚠️ Mekan ve profil adında `numberOfLines` YOK —
 * yani uzun bir ad KIRPILMIYOR, SARIYOR. Kırpılma riski bu yüzden doğmuyor;
 * bedeli yalnızca dikeyde birkaç piksel ve ikisi de kaydırılabilir bir
 * kapsayıcının içinde. Sabit yükseklikli bir kutuya konsaydı bu projenin iki
 * kez ısırdığı "sabit yükseklik varsayımı" sınıfına girerdi.
 */
/**
 * ── ÖZEL FONT: GOOGLE SANS FLEX (2026-08-13) ────────────────────────────────
 * `@expo-google-fonts/google-sans-flex`. Sistem fontundan çıkıldı.
 *
 * ⚠️ LİSANS — bu font BİR DÖNEM KULLANILAMAZDI. "Google Sans" on yıl boyunca
 * Google'ın kendi ürünlerine özel, tescilli bir marka fontuydu. 2025'te
 * **SIL Open Font License 1.1** ile açık kaynağa çevrildi; ticari kullanım
 * serbest, atıf zorunluluğu yok. npm paketinin lisans alanı da bunu söylüyor:
 * `MIT AND OFL-1.1` (MIT sarmalayıcı JS, OFL fontun kendisi). Eski "Google
 * Sans kullanılamaz" bilgisiyle karşılaşan biri bu satırı okusun.
 *
 * Değişken (variable) bir font ama paket STATİK, ağırlık başına ayrı `.ttf`
 * getiriyor — yani RN tarafında eksen (axis) uğraşı yok.
 *
 * ⚠️ Dosyalar Figtree'nin ~3,3 katı (ağırlık başına ~130 KB, dört ağırlık
 * ~520 KB). Bilinçli kabul edildi; OTA paketini büyütüyor.
 *
 * ── ⚠️ HER AĞIRLIK KENDİ AİLE ADI — Android'in kuralı ──────────────────────
 * Özel bir `fontFamily` verildiğinde Android `fontWeight`'i SENTEZLEMİYOR:
 * `fontFamily: 'GoogleSansFlex'` + `fontWeight: '600'` düz Regular çizer. Bu yüzden
 * her rol kendi yüz adına bağlı (`GoogleSansFlex_600SemiBold` gibi) ve o yüzler
 * `RootNavigator`'da tek tek yükleniyor.
 *
 * ── 🔴 `fontWeight` HİÇBİR ROLDE YOK — ÖLÇÜMLE KANITLANDI ──────────────────
 * Bir dönem `fontFamily` ile BİRLİKTE duruyordu ("11 yer `Type.X.fontWeight`'i
 * okuyor, silinirse form alanları ağırlığını kaybeder" gerekçesiyle). O taviz
 * SAHADA FONTU TAMAMEN ÖLDÜRÜYORDU: Android, ağırlığa özgü bir aileye ayrıca
 * `fontWeight` verildiğinde o ailenin "bold" yüzünü arıyor, bulamıyor ve
 * SİSTEM FONTUNA düşüyor. Yani özel font hiçbir yerde uygulanmıyordu.
 *
 * ── NASIL BULUNDU (yöntem notu) ────────────────────────────────────────────
 * Belirti "yalnızca Ana Sayfa'nın başlıkları farklı" diye bildirildi ve iki
 * hipotez (ekrana özgü stil, font yükleme yarışı) kod okumasıyla ÇÜRÜTÜLDÜ:
 * başlıklar paylaşılan `SectionHeader`'ı kullanıyor ve `RootNavigator`'ın
 * kapısı fontlar yüklenmeden `NavigationContainer`'ı hiç render etmiyor.
 *
 * Çözen şey tahmin değil ÖLÇÜM oldu: Ana Sayfa'ya geçici olarak AYNI metni
 * üç farklı yolla çizen üç satır kondu —
 *   A = `Type.title` (token yolu)   B = yalnızca `fontFamily`   C = sistem
 * Sonuç **A ≡ C ≠ B**. Yani token yolu sistem fontuna eşitti.
 *
 * ⚠️ Bu aynı zamanda "sorun Ana Sayfa'ya özgü" gözlemini de çürüttü: `title`
 * düşüyorsa HER rol düşüyordu, yani uygulamanın tamamı sistem fontundaydı.
 * Ekranlar arası "fark" algısı, aynı fontun farklı boyutlardaki örnekleriydi.
 *
 * Bedeli ödendi: `Type.X.fontWeight` okuyan 11 satır `fontFamily` okumaya
 * çevrildi. Ağırlık artık YALNIZCA yüz adından geliyor — tek kaynak.
 */
export const Type = {
  /** Detay ekranı mekan adı — sayfada tek bir tane olur */
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: 'GoogleSansFlex_800ExtraBold',
  },
  /** Ekran başlığı */
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  /** Bölüm başlığı, kart adı, liste satırı adı */
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  /** Gövde metni, yorum, açıklama */
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  /** Vurgulu gövde — buton etiketi, seçili sekme */
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  /** Adres, meta bilgi, yardımcı metin */
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  /**
   * Vurgulu küçük metin — form etiketi, sayaç değeri.
   *
   * NEDEN 8. ROL: Faz 1b adım 7'de üç ayrı yer (auth ekranlarının form
   * etiketleri, `MapScreen`'in "N puanlanan" sayacı) 13px + 600 istedi.
   * `caption` 13/400, `micro` 11/600 — ikisi de karşılamıyordu, üçü de
   * kalınlığını kaybediyordu. Rol eklemek, ekranlarda `fontWeight` override
   * yazmaktan iyi: override'lar "boyut+satır+kalınlık birlikte gelir"
   * ilkesini deler ve tek tek kayar.
   */
  captionStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  /** Chip etiketi, sayaç alt yazısı — en küçük okunabilir kademe */
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
} as const satisfies Record<string, TextStyle>;

// ═══════════════════════════════════════════════════════════════════════════
// SPACING — 4 tabanlı
// ═══════════════════════════════════════════════════════════════════════════
//
// KURAL: layout ölçüsü (padding/margin/gap) ham sayı olarak yazılmaz.
// Kodda dağılmış 2/3/6 gibi değerler 4 veya 8'e yuvarlanır.
// Tek istisna: `StarRating`'in glif matematiği (optik hizalama, gerekçesi
// o dosyanın yorumunda yazılı) ve 1px kenarlık kalınlıkları.

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// RADIUS
// ═══════════════════════════════════════════════════════════════════════════

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  full: 999,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// ELEVATION — kullanım adlı gölge katmanları
// ═══════════════════════════════════════════════════════════════════════════
//
// Eskiden sm/md/lg/xl idi: hangi bileşenin hangisini alacağı kararı her
// ekranda yeniden veriliyordu. İsimler artık kullanımı söylüyor.
//
// Midas kararı gereği kartlarda gölge yerine ince kenarlık + yüzey kontrastı
// tercih edilecek; `card` bu yüzden bilinçli olarak çok hafif.

export const Elevation = {
  /** Liste kartı, header — neredeyse görünmez ayrım */
  card: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  /** Havada duran öğe: FAB, harita üstü bilgi kartı */
  floating: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  /**
   * Bottom sheet — gölge YUKARI doğru (offset negatif), çünkü sheet ekranın
   * altından geliyor ve üstündeki içerikten ayrılması gerekiyor.
   * Elevation 20: sheet her şeyin üstünde, `floating`/`card` ile aynı ligde değil.
   */
  sheet: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  /** Modal, tam ekran örtü */
  modal: {
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  /** Marka renkli gölge — birincil buton */
  brand: {
    shadowColor: Palette.green[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const satisfies Record<string, ViewStyle>;
