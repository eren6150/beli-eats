import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import ListDetailScreen from '../screens/lists/ListDetailScreen';
import DiaryEntryDetailScreen from '../screens/DiaryEntryDetailScreen';
import FollowersListScreen from '../screens/FollowersListScreen';
import {
  baseStackScreenOptions,
  restaurantDetailScreenOptions,
} from './detailStackOptions';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={baseStackScreenOptions}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={restaurantDetailScreenOptions}
      />
      {/* "En Çok Puanlayanlar" satırlarından açılıyor. Ekran kendi geri
          butonunu ve başlık şeridini çiziyor. */}
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />
      {/* `UserProfile`'ın zorunlu eşlikçisi: "Listeler" sekmesinden buraya
          geliniyor. Olmadan liste kartına dokunmak çalışma anında patlar. */}
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        options={{ headerShown: false }}
      />
      {/* `UserProfile`'ın "Günlük" sekmesinden açılıyor — ikinci zorunlu
          eşlikçi. Diff D'de aktivite akışı da buraya gelecek. */}
      <Stack.Screen
        name="DiaryEntryDetail"
        component={DiaryEntryDetailScreen}
        options={{ headerShown: false }}
      />
      {/* `UserProfile`'ın üçüncü zorunlu eşlikçisi: sayaçlardan buraya
          geliniyor. */}
      <Stack.Screen
        name="FollowersList"
        component={FollowersListScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
