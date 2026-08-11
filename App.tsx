import 'react-native-url-polyfill/auto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
//
// ── KeyboardProvider: BU BUILD'DE YALNIZCA SAĞLAYICI KURULUYOR ──────────────
// `react-native-keyboard-controller` klavye/edge-to-edge sınıfının doğru
// cevabı (IME ölçülerini WindowInsets'ten doğrudan okuyor). NATIVE bir modül,
// yani OTA ile gidemez — build'e ŞİMDİ girmesi gerekiyordu.
//
// Ama ekranların ona TAŞINMASI saf JS ve OTA ile gidebilir. Bu yüzden bu
// build'e yalnızca sağlayıcı giriyor; `KeyboardAvoidingView` kullanan ekranlar
// (auth ekranları, `EditProfile`, `ListForm`, `DiaryEntrySheet`) bugünkü
// halleriyle kalıyor. Gerekçe: keyboard-controller Expo Go'da YOK, yani
// buradaki hiçbir değişiklik build'den önce doğrulanamıyor — beş ekranı körü
// körüne taşımak, doğrulanmamış işleri build'in hemen öncesinde üst üste
// yığmak olurdu.
//
// Sağlayıcının kendisi büyük ölçüde etkisiz (bağlam kurup klavye olaylarını
// dinliyor). Sorun çıkarırsa geri almak da SAF JS, yani OTA ile mümkün —
// build'e bağımlı olan tek şey paketin native tarafı.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
