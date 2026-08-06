import 'react-native-url-polyfill/auto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/hooks/useAuth';

// SafeAreaProvider kökte olmak zorunda: useSafeAreaInsets ve
// safe-area-context'in SafeAreaView'ı inset değerlerini buradan alır.
//
// AuthProvider `RootNavigator`'ın ÜSTÜNDE olmak zorunda: o da bir tüketici
// (`session`/`loading` ile oturum kapısını çiziyor). Öncesinde `useAuth` düz
// bir hook'tu ve her çağıran kendi oturum örneğini kuruyordu — 10 ayrı
// `getSession()` ve 10 abonelik; gerekçe `useAuth.tsx`'in başında.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
