// app.json statik bir JSON — içine "${EXPO_PUBLIC_...}" yazmak işe yaramaz,
// Expo orada değişken yerine koymaz ve native tarafa literal string gider.
// Ortam değişkeni okumanın tek yolu bu dinamik config dosyası.
//
// app.json hâlâ taban config olarak okunur ve aşağıya `config` parametresiyle
// gelir; burada sadece ortama bağlı alanları üzerine yazıyoruz.
//
// ── NEDEN .ts DEĞİL .js ──────────────────────────────────────────────────────
// Bu dosya bir dönem `app.config.ts` idi ve `npx eas-cli` onu okuyamadı:
//   Error reading Expo config ... Cannot read properties of undefined
//   (reading 'CommonJS')
// Sebep: EAS CLI npx önbelleğinden, projenin node_modules'ünün DIŞINDA
// çalışıyor; TypeScript config'i transpile etmek için gereken çözümleyiciyi
// (`sucrase`/`ts-node`) bulamayınca TypeScript API'sine düşüyor ve `ts` nesnesi
// tanımsız kalıyor. `ts-node`'u devDependency olarak eklemek de bir çözümdü ama
// yalnızca config dosyası için bir bağımlılık daha taşımak gerekirdi.
// Düz JS'te transpile adımı HİÇ YOK — sorun sınıfı ortadan kalkıyor.
// Kaybedilen tek şey `ExpoConfig` tip kontrolü; dosya 20 satırlık düz config.

/**
 * NATIVE harita anahtarı — YALNIZCA Maps SDK için.
 *
 * ⚠️ Places REST çağrıları BU ANAHTARI KULLANMIYOR. Onlar
 * `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`'i okuyor (`src/lib/places.ts`,
 * `src/screens/SearchScreen.tsx`) ve o değişken buraya HİÇ girmiyor —
 * Metro onu doğrudan JS bundle'ına gömüyor.
 *
 * Ayrımın sebebi: Maps SDK isteğe paket adını + imzayı kendisi eklediği için
 * "Android apps (paket + SHA-1)" kısıtlaması bu anahtarda ÇALIŞIYOR; düz
 * HTTPS ile giden Places çağrılarında o bilgi olmadığı için aynı kısıtlama
 * onları REQUEST_DENIED'a düşürürdü.
 *
 * Pratik sonucu: bu anahtar build anında AndroidManifest'e gömülüyor, yani
 * DEĞİŞTİRMEK BUILD GEREKTİRİYOR. Places anahtarı ise her OTA ile yeniden
 * gidiyor.
 */
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

module.exports = ({ config }) => {
  // ⚠️ Bu uyarı YEREL komutlarda YANLIŞ ALARM olabilir: Expo CLI app config'i
  // `.env`'i yüklemeden ÖNCE değerlendiriyor (çıktı sırası: uyarı → "env: load
  // .env" → "Starting Metro Bundler"). Yani uyarı görünse bile Metro bundle'ı
  // anahtarla üretiyor. Uyarının GERÇEKTEN anlamlı olduğu yer `eas build`:
  // orada `.env` sunucuya hiç gitmiyor, değer EAS ortamından geliyor ve
  // eksikse native haritanın anahtarı boş kalır. Ayrıntı: CLAUDE.md → Dağıtım §8.
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY config okunurken tanımsız — ' +
        'yerel komutlarda .env henüz yüklenmemiş olabilir (zararsız). ' +
        'eas build sırasında görülüyorsa GERÇEK: EAS ortam değişkenlerini kontrol et.'
    );
  }

  // ── EAS Update (OTA) ───────────────────────────────────────────────────────
  // projectId app.json'da (`extra.eas.projectId`) ve güncelleme URL'i ondan
  // TÜRETİLİYOR — iki yere elle yazmak, birini değiştirip diğerini unutmanın
  // sessiz yolu olurdu. Aynı gerekçeyle Google anahtarı da tek yerden okunuyor.
  const projectId = config.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      '[app.config] extra.eas.projectId yok — OTA güncelleme URL\'i ' +
        'kurulamıyor, build güncelleme alamaz. app.json içindeki ' +
        'extra.eas.projectId alanını kontrol et.'
    );
  }

  return {
    ...config,
    // Expo bu ikisini zorunlu tutuyor; taban app.json'dan geliyor.
    name: config.name ?? 'Beli Eats',
    slug: config.slug ?? 'beli-eats',

    /**
     * `appVersion` — runtime = `version` alanı ("1.0.0"), yani yerelde ve
     * EAS'te BİREBİR aynı hesaplanıyor.
     *
     * ── NEDEN `fingerprint` DEĞİL (2026-08-05'te denendi ve BUILD PATLATTI) ──
     * `fingerprint` önce seçilmişti (native değişiklikte runtime'ı otomatik
     * çeviriyor, uyumsuz binary'ye JS göndermeyi engelliyor). Ama ilk build
     * "Configure expo-updates" aşamasında runtime version mismatch ile düştü:
     * EAS `expo prebuild` çalıştırıp native ağacı ürettikten SONRA fingerprint
     * hesaplıyor, yerelde ise o ağaç hiç yok. Tam teşhis CLAUDE.md → Dağıtım
     * §9'da; iki bağımsız ıraksama kaynağı var ve biri yerelde kanıtlanamıyor.
     *
     * ── ⚠️ KAYBEDİLEN KORUMA — RİTÜELE BAĞLANDI ────────────────────────────
     * Native bir şey değiştiğinde runtime ARTIK OTOMATİK DEĞİŞMİYOR.
     * `app.json`'daki `version` ELLE yükseltilmeli, yoksa uyumsuz bir binary'ye
     * JS gönderilir. Kural CLAUDE.md → Dağıtım §2'de yazılı: her build'de
     * `versionCode` artar; native bir şey değiştiyse `version` de artar.
     */
    runtimeVersion: { policy: 'appVersion' },

    /**
     * Varsayılan davranış (açıkça yazılmadı çünkü Expo dokümanı ilan ediyor,
     * `eas.json`'daki `environment` alanının durumundan farklı): uygulama
     * açılışta cache'teki bundle ile HEMEN başlar, güncellemeyi arka planda
     * indirir ve BİR SONRAKİ açılışta uygular. Yani kullanıcı güncellemeyi
     * ikinci açılışta görür; açılış hiçbir zaman ağ beklemez.
     */
    updates: {
      url: `https://u.expo.dev/${projectId}`,
    },

    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    },

    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: GOOGLE_MAPS_API_KEY },
      },
    },
  };
};
