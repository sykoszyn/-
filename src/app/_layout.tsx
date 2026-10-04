import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useHydrated } from '@/store';
import { Colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.background, text: colors.text, border: colors.border },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackTitle: 'Volver',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Inicio' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, title: 'Bienvenida' }} />
        <Stack.Screen name="expense/new" options={{ presentation: 'modal', title: 'Cargar gasto' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Detalle' }} />
        <Stack.Screen name="settle" options={{ presentation: 'modal', title: 'Saldar cuentas' }} />
        <Stack.Screen name="bill/edit" options={{ presentation: 'modal', title: 'Gasto fijo' }} />
        <Stack.Screen name="goal/edit" options={{ presentation: 'modal', title: 'Meta' }} />
        <Stack.Screen name="goal/[id]" options={{ title: 'Meta' }} />
        <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
      </Stack>
    </ThemeProvider>
  );
}
