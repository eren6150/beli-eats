import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SearchStackParamList } from '../types';
import SearchScreen from '../screens/SearchScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
import DiaryEntryDetailScreen from '../screens/DiaryEntryDetailScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import ListDetailScreen from '../screens/lists/ListDetailScreen';
import FollowersListScreen from '../screens/FollowersListScreen';
import {
  baseStackScreenOptions,
  restaurantDetailScreenOptions,
} from './detailStackOptions';

const Stack = createNativeStackNavigator<SearchStackParamList>();

/**
 * Arama sekmesinin kendi stack'i. Bir sonuca dokunup detaya gidildiğinde
 * geri tuşu arama sonuçlarına dönüyor, Ana Sayfa sekmesine atlamıyor.
 */
export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={baseStackScreenOptions}>
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        // SearchScreen kendi başlığını ve arama çubuğunu çiziyor.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={restaurantDetailScreenOptions}
      />
      {/* `RestaurantDetail`'in zorunlu eşlikçisi: mekan sayfasındaki "Senin
          Ziyaretlerin" satırları buraya gidiyor. Ekran kendi geri butonunu
          çiziyor. */}
      <Stack.Screen
        name="DiaryEntryDetail"
        component={DiaryEntryDetailScreen}
        options={{ headerShown: false }}
      />
      {/* `RestaurantDetail`'in İKİNCİ zorunlu eşlikçisi (2026-08-13): mekan
          sayfasındaki fotoğrafın tam ekran görüntüleyicisinde kullanıcı adına
          dokunmak buraya geliyor. Bu stack'te KAYITLI DEĞİLDİ; ızgaradaki
          fotoğraflar HERKESE ait olduğu için Ara sekmesinden gelen kullanıcıda
          dokunuş çalışma anında patlardı. */}
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />
      {/* Aşağıdaki ikisi `RestaurantDetail`'in değil `UserProfile`'ın
          eşlikçisi: onun "Listeler" sekmesi ve takipçi sayaçları buraya
          gidiyor. `UserProfile` bir stack'e girdiğinde YALNIZ GELMİYOR.
          (`DiaryEntryDetail` — onun "Günlük" sekmesinin hedefi — zaten
          yukarıda kayıtlı.) */}
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FollowersList"
        component={FollowersListScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
