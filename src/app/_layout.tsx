import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'nativewind';

import { palette } from '@/lib/colors';
import { useAriaStore } from '@/store/aria-store';

SplashScreen.preventAutoHideAsync();

function navTheme(scheme: 'light' | 'dark') {
  const c = palette[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.ink,
      border: c.border,
      notification: c.accent,
    },
  };
}

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const hydrated = useAriaStore((s) => s.hydrated);
  const themePref = useAriaStore((s) => s.settings.theme);
  const signedIn = useAriaStore((s) => s.signedIn);
  const onboarded = useAriaStore((s) => s.onboarded);
  const segments = useSegments();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  // Apply the user's theme preference (System / Light / Dark).
  useEffect(() => {
    if (hydrated) setColorScheme(themePref);
  }, [hydrated, themePref, setColorScheme]);

  // Auth gate: signed out → /login, new signup → /welcome, otherwise into the app.
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0];
    const onLogin = first === 'login';
    const onWelcome = first === 'welcome';
    if (!signedIn) {
      if (!onLogin) router.replace('/login');
    } else if (!onboarded) {
      if (!onWelcome) router.replace('/welcome');
    } else if (onLogin || onWelcome) {
      router.replace('/');
    }
  }, [hydrated, signedIn, onboarded, segments]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme(scheme)}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette[scheme].bg } }}>
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="task/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="aria/[taskId]" options={{ presentation: 'card' }} />
            <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
            <Stack.Screen name="rebalance" options={{ presentation: 'modal' }} />
            <Stack.Screen name="reschedule" options={{ presentation: 'modal' }} />
            <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
