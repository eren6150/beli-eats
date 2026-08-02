import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Colors } from '../constants/theme';

/**
 * RestaurantDetail üç ayrı stack'te (Home, Search, Map) kayıtlı. Ayarlar
 * burada tek yerde durmazsa zamanla birbirinden ayrışır ve aynı ekran
 * sekmeye göre farklı görünür.
 */

/**
 * Stack'lerin ortak taban ayarları.
 *
 * Header BİÇİMLENDİRME ayarı yok, bilinçli: üç stack'te kayıtlı altı ekranın
 * hepsi header'ını gizliyor (liste ekranları `headerShown: false`, detay ekranı
 * `restaurantDetailScreenOptions` üzerinden aynısı). Bir dönem burada
 * `headerStyle` / `headerTintColor` / `headerTitleStyle` /
 * `headerShadowVisible` duruyordu ve hiçbiri render edilen bir şeye
 * dokunmuyordu — "demek ki bir yerde header var" yanılgısı yaratıyordu.
 * İleride bir ekranda header açılırsa ayarları o zaman ekle.
 *
 * `contentStyle` canlı: geçiş animasyonu sırasında ekranların arkasında
 * görünen zemin.
 */
export const baseStackScreenOptions: NativeStackNavigationOptions = {
  contentStyle: { backgroundColor: Colors.canvas },
};

/**
 * RestaurantDetail'in kendi ayarları.
 *
 * Header TAMAMEN kapalı: ekranın hero fotoğrafı bilinçli olarak tam kanamalı
 * ve geri butonunu ekranın kendisi çiziyor (safe area inset'iyle birlikte).
 *
 * DİKKAT — burada `headerTransparent: true` + `title: ''` vardı ve bu bir
 * hataydı: `headerTransparent` header'ı GİZLEMEZ, yalnızca arka planını
 * saydamlaştırıp içeriğin üstünde yüzdürür. Native geri butonu duruyordu,
 * yani ekranda iki geri butonu birden görünüyordu (biri ekranın kendi
 * yuvarlak butonu, biri durum çubuğu hizasındaki native ok).
 * Header'ı kapatan property `headerShown`.
 */
export const restaurantDetailScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
};
