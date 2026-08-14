import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import {
  GoogleSansFlex_400Regular,
  GoogleSansFlex_600SemiBold,
  GoogleSansFlex_700Bold,
  GoogleSansFlex_800ExtraBold,
} from '@expo-google-fonts/google-sans-flex';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import TabNavigator from './TabNavigator';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import Icon from '../components/ui/Icon';
import { Colors, Type, Spacing, Radius } from '../constants/theme';
import { SkeletonBox } from '../components/ui/SkeletonLoader';

/** Logo dairesinin çapı — iki auth ekranıyla AYNI, splash'ten geçişte zıplamasın. */
const LOGO_SIZE = 80;

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

// ── Splash / Auth loading screen ─────────────────────────────────────────────

function SplashScreen() {
  return (
    <View style={styles.splash}>
      {/* Logo — auth ekranlarıyla aynı lockup: emoji değil Icon, aynı çap. */}
      <View style={styles.logoCircle}>
        <Icon name="restaurant" size={40} color={Colors.brandStrong} />
      </View>
      <Text style={styles.logoName}>Beli Eats</Text>
      <Text style={styles.logoSub}>Yemeğin Letterboxd'ı</Text>

      {/* Skeleton shimmer placeholder */}
      <View style={styles.skeletonGroup}>
        <SkeletonBox width="60%" height={14} style={styles.skeletonTop} />
        <SkeletonBox width="40%" height={12} style={styles.skeletonBottom} />
      </View>
    </View>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export default function RootNavigator() {
  const { session, loading } = useAuth();

  /**
   * ── FONT YÜKLEME ──────────────────────────────────────────────────────────
   * DÖRT AĞIRLIK TEK TEK yükleniyor. Android özel fontlarda `fontWeight`'i
   * sentezlemiyor, yani her yüz kendi aile adıyla kayıtlı olmalı
   * (`theme.ts` → `Type`'ın her rolü bu adlardan birine bağlı).
   *
   * Yalnızca `Type`'ın gerçekten kullandığı ağırlıklar var: 400/600/700/800.
   * Paket 300–900 ve italikleri de taşıyor; kullanılmayanları yüklemek OTA
   * paketini boşuna büyütürdü.
   *
   * ── NEDEN BURADA, App.tsx'te DEĞİL ────────────────────────────────────────
   * Bu bileşende oturum için ZATEN bir bekleme kapısı ve bir splash var; font
   * beklemesini aynı kapıya bağlamak ikinci bir yükleme ekranı yazmayı
   * gereksiz kılıyor. İki bekleme paralel ilerliyor, toplam süre uzamıyor.
   *
   * ⚠️ Hata durumunda UYGULAMA KİLİTLENMİYOR: `useFonts` yüklenemezse
   * `fontError` doluyor ve kapı açılıyor — metinler sistem fontuna düşer,
   * `Type`'ın `fontWeight` değerleri korunduğu için hiyerarşi ayakta kalır.
   * Font yüzünden açılamayan bir uygulama, fontsuz bir uygulamadan kötüdür.
   */
  const [fontsLoaded, fontError] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
    GoogleSansFlex_800ExtraBold,
  });

  if (loading || (!fontsLoaded && !fontError)) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Main" component={TabNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['3xl'],
  },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    // Yeşil parıltı gölgesi kaldırıldı — auth ekranlarındaki aynı logo
    // dairesinde de yok, splash'ten Login'e geçişte fark ediliyordu.
  },
  logoName: {
    ...Type.display,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.xxs,
  },
  logoSub: {
    ...Type.body,
    color: Colors.textSecondary,
    marginBottom: Spacing['3xl'],
  },
  skeletonGroup: {
    width: '100%',
  },
  skeletonTop: {
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  skeletonBottom: {
    alignSelf: 'center',
  },
});
