import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
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
    </Stack.Navigator>
  );
}
