import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ListFormScreen from '../screens/lists/ListFormScreen';
import ListDetailScreen from '../screens/lists/ListDetailScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
import {
  baseStackScreenOptions,
  restaurantDetailScreenOptions,
} from './detailStackOptions';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

/**
 * Profil sekmesinin stack'i.
 *
 * Diğer üç sekme baştan beri kendi stack'ineydi; profil tek ekran olduğu için
 * doğrudan `TabNavigator`'a bağlıydı. Liste oluşturma modal'ı ikinci ekranı
 * getirdiği için stack artık gerekli.
 *
 * DİKKAT — bu dosya bir kez SİLİNMİŞTİ: var olmayan ekranları import ediyordu
 * (`EditProfile`, `UserProfile`, ...). Buraya YALNIZCA gerçekten yazılmış
 * ekranlar eklenir; `ProfileStackParamList` de aynı kuralla budandı.
 * `EditProfile` 2026-08-06'da EKRANIYLA BİRLİKTE geldi; `UserProfile` ve
 * `FollowersList` hâlâ yok ve yazılana kadar da girmeyecek.
 */
export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={baseStackScreenOptions}>
      <Stack.Screen
        name="MyProfile"
        component={ProfileScreen}
        // Ekran kendi SafeAreaView'ını ve başlığını çiziyor.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ListForm"
        component={ListFormScreen}
        options={{
          headerShown: false,
          // Modal sunum: form ekranı sekmenin üstüne geliyor, altındaki profil
          // görünmeye devam ediyor. Ekran kendi "İptal / Oluştur" şeridini
          // çiziyor — native header açmıyoruz, uygulamadaki ekranların hiçbiri
          // header göstermiyor.
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerShown: false,
          // `ListForm` ile aynı sunum: form sekmenin üstüne geliyor, ekran
          // kendi "İptal / Kaydet" şeridini çiziyor.
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        // Ekran kendi geri butonunu ve başlık şeridini çiziyor.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={restaurantDetailScreenOptions}
      />
    </Stack.Navigator>
  );
}
