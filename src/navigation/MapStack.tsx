import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MapStackParamList } from '../types';
import MapScreen from '../screens/MapScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
import ListDetailScreen from '../screens/lists/ListDetailScreen';
import DiaryEntryDetailScreen from '../screens/DiaryEntryDetailScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import FollowersListScreen from '../screens/FollowersListScreen';
import {
  baseStackScreenOptions,
  restaurantDetailScreenOptions,
} from './detailStackOptions';

const Stack = createNativeStackNavigator<MapStackParamList>();

/**
 * Harita sekmesinin kendi stack'i. Detay sayfası bu stack'e push edildiği
 * için geri tuşu kullanıcıyı haritaya döndürüyor, sekme değişmiyor.
 */
export default function MapStack() {
  return (
    <Stack.Navigator screenOptions={baseStackScreenOptions}>
      <Stack.Screen
        name="Map"
        component={MapScreen}
        // Harita tam ekran ve kendi overlay bilgi kartını çiziyor.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={restaurantDetailScreenOptions}
      />
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        // Ekran kendi geri butonunu ve başlık şeridini çiziyor.
        options={{ headerShown: false }}
      />
      {/* `RestaurantDetail`'in zorunlu eşlikçisi: mekan sayfasındaki "Senin
          Ziyaretlerin" satırları buraya gidiyor. */}
      <Stack.Screen
        name="DiaryEntryDetail"
        component={DiaryEntryDetailScreen}
        options={{ headerShown: false }}
      />
      {/* `RestaurantDetail`'in İKİNCİ zorunlu eşlikçisi (2026-08-13): mekan
          sayfasındaki fotoğrafın tam ekran görüntüleyicisinde kullanıcı adına
          dokunmak buraya geliyor. Bu stack'te KAYITLI DEĞİLDİ; ızgaradaki
          fotoğraflar HERKESE ait olduğu için Harita sekmesinden gelen
          kullanıcıda dokunuş çalışma anında patlardı. */}
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />
      {/* `UserProfile`'ın takipçi/takip sayaçlarının hedefi. Onun diğer iki
          eşlikçisi (`ListDetail`, `DiaryEntryDetail`) bu stack'te zaten
          kayıtlıydı — başka gerekçelerle. */}
      <Stack.Screen
        name="FollowersList"
        component={FollowersListScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
