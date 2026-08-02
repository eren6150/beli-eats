import { ExpoConfig, ConfigContext } from 'expo/config';

// app.json statik bir JSON — içine "${EXPO_PUBLIC_...}" yazmak işe yaramaz,
// Expo orada değişken yerine koymaz ve native tarafa literal string gider.
// Ortam değişkeni okumanın tek yolu bu dinamik config dosyası.
//
// app.json hâlâ taban config olarak okunur ve aşağıya `config` parametresiyle
// gelir; burada sadece ortama bağlı alanları üzerine yazıyoruz.

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımsız — ' +
        'native harita gri/boş görünecek. .env dosyasını kontrol et.'
    );
  }

  return {
    ...config,
    // ExpoConfig bu ikisini zorunlu tutuyor; taban app.json'dan geliyor.
    name: config.name ?? 'Beli Eats',
    slug: config.slug ?? 'beli-eats',

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
