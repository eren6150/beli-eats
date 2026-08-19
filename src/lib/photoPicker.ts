import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Fotoğraf KAYNAĞI seçimi — kamera mı galeri mi.
 *
 * ── NEDEN MODÜL FONKSİYONU, HOOK DEĞİL ──────────────────────────────────────
 * Bu mantık önce yalnızca `usePendingPhotos`'un içindeydi ve o hook'u
 * kullanan iki form ("Ziyaret Ekle" + "Puanı Kaydet") kameraya erişebiliyordu.
 * Mekan sayfasının FOTOĞRAF IZGARASI ise ayrı bir yol izliyor ve oraya hook'u
 * takmak mümkün değil — modelleri farklı:
 *
 *   · hook yolu   → seçilenleri BEKLEYEN listeye topluyor, tür soruyor,
 *                   yüklemeyi form kaydedilince yapıyor
 *   · ızgara yolu → seçimden hemen sonra ANINDA yüklüyor, türü aktif
 *                   sekmeden alıyor
 *
 * Hook'u ızgaraya takmak o ekranın yükleme modelini değiştirmek olurdu; bu bir
 * ürün kararı, kamera menüsü işi değil. Bu yüzden ortak olan tek şey —
 * kaynak seçimi — modül seviyesine çıkarıldı. `addPlaceToList`'in
 * `useListItems` dışında durmasıyla aynı gerekçe: çağıranın elinde hook örneği
 * yok.
 *
 * ── KAMERA İZNİ BUILD GEREKTİRMİYOR ─────────────────────────────────────────
 * `expo-image-picker` `android.permission.CAMERA`'yı KENDİ AndroidManifest'inde
 * ilan ediyor ve kütüphane autolink edildiği için izin versionCode 4'ten beri
 * APK'da. Bu bir prebuild mod'u olduğundan `npx expo config` çıktısında
 * GÖRÜNMÜYOR — oraya bakıp "izin yok" sonucuna varmak yanlış olur.
 */

/**
 * Seçilen görselin `makePhotoRenditions`'ın beklediği asgari şekli.
 *
 * `width`/`height` ZORUNLU: `ImagePickerAsset` ikisini de her zaman veriyor ve
 * `makePhotoRenditions` uzun kenar kararı için ikisine de ihtiyaç duyuyor.
 * Opsiyonel yapmak, çağıranı anlamsız bir `?? 0` yazmaya zorlardı.
 */
export interface PickedPhotoAsset {
  uri: string;
  width: number;
  height: number;
}

export type PhotoSource = 'camera' | 'library';

/**
 * İzni ister, seçiciyi açar, seçilen görseli döndürür.
 *
 * `null` dönüşü üç durumu birden karşılıyor ve çağıran hiçbirinde HATA
 * göstermemeli: izin reddedildi (kullanıcı zaten uyarıyı gördü), seçici
 * iptal edildi, ya da seçim boş döndü. Üçü de kullanıcının kararı.
 */
export async function pickPhotoAsset(
  source: PhotoSource
): Promise<PickedPhotoAsset | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    Alert.alert(
      'İzin gerekli',
      source === 'camera'
        ? 'Fotoğraf çekmek için kamera erişimine izin vermelisin.'
        : 'Fotoğraf eklemek için galeri erişimine izin vermelisin.'
    );
    return null;
  }

  // `quality: 1` — burada SIKIŞTIRMA YOK. Sıkıştırmayı `makePhotoRenditions`
  // yapıyor; iki kez sıkıştırmak çift kayıp olurdu.
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
        });

  if (picked.canceled || !picked.assets?.[0]) return null;

  const asset = picked.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * "+" menüsü: kaynak sorar, seçilen görseli `onPicked`'e verir.
 *
 * ⚠️ Üç seçenek Android `Alert`'in TAM SINIRINDA (en fazla üç buton), yani
 * burada sheet yazmaya gerek yok. Tür seçimi dörde çıktığı için ORADA sheet
 * gerekiyor (`PhotoKindSheet`). Buraya dördüncü bir seçenek eklenirse Android
 * sessizce birini yutar — o gün sheet'e geçilmeli.
 *
 * `onPicked` YALNIZCA gerçek bir seçimde çağrılıyor; iptal/izin-reddi
 * durumlarında hiç çağrılmıyor, yani çağıranın ayrıca kontrol etmesi gerekmez.
 */
export function promptPhotoSource(
  onPicked: (asset: PickedPhotoAsset) => void
): void {
  const run = async (source: PhotoSource) => {
    const asset = await pickPhotoAsset(source);
    if (asset) onPicked(asset);
  };

  Alert.alert('Fotoğraf ekle', 'Nereden eklemek istersin?', [
    { text: 'İptal', style: 'cancel' },
    { text: 'Kamera', onPress: () => void run('camera') },
    { text: 'Galeriden Seç', onPress: () => void run('library') },
  ]);
}
