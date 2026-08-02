import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SearchStackParamList } from '../types';
import SearchScreen from '../screens/SearchScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
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
    </Stack.Navigator>
  );
}
