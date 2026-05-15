import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { NotificationProvider } from '@/contexts/NotificationContext';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <ChatProvider>
        <NotificationProvider>
          <RootLayoutNav />
        </NotificationProvider>
      </ChatProvider>
    </AuthProvider>
  );
}

// ─── GUARDA DE AUTENTICAÇÃO ────────────────────────────────────────────────────

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // Não está logado e não está numa tela de auth → vai para login
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Já está logado mas está numa tela de auth → vai para home
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGuard />
      <Stack>
        {/* Telas de autenticação */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />

        {/* Tela principal (Tabs) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Tela de cadastro de imóvel */}
        <Stack.Screen
          name="criar-anuncio"
          options={{
            presentation: 'card',
            title: 'Anunciar Imóvel',
            headerTintColor: '#ff385c',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        />

        {/* Tela de edição de imóvel */}
        <Stack.Screen
          name="editar-anuncio/[id]"
          options={{
            presentation: 'card',
            title: 'Editar Imóvel',
            headerTintColor: '#ff385c',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        />

        {/* Modal padrão */}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}