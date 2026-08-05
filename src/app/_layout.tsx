import '@/global.css';

import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { vars } from 'nativewind';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'nativewind';
import { useColorScheme as useDeviceScheme } from 'react-native';

import { AriaLoading } from '@/components/aria-loading';
import { ToastHost } from '@/components/toast-host';
import { setupNotificationHandler } from '@/lib/alarms';
import { addAutomationTapListener } from '@/lib/automation-notices';
import { addDailyReviewTapListener } from '@/lib/daily-brief';
import { THEMES, resolveTheme, themeVars, type Palette } from '@/lib/colors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { flushOutbox, setSyncUser } from '@/lib/sync';
import { useAriaStore } from '@/store/aria-store';

SplashScreen.preventAutoHideAsync();

/**
 * How long Aria's loading screen stays up at minimum.
 *
 * Hydration is usually near-instant, so without a floor the screen flashes by
 * in under 100ms and reads as a glitch. Long enough to register the brand and
 * let the mark breathe once; short enough that it never feels like waiting.
 */
const MIN_LOADING_MS = 4000;

function navTheme(c: Palette, dark: boolean) {
  const base = dark ? DarkTheme : DefaultTheme;
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
  /**
   * Inter, in the three cuts the type scale actually uses.
   *
   * Held behind the loading screen below: without that, every screen paints in
   * the system font first and then reflows when Inter lands, which is a visible
   * jolt on the very first impression. The app already waits there for
   * hydration, so this costs nothing extra.
   *
   * A load *failure* is deliberately treated as "carry on", text falls back to
   * the system sans, which is an ordinary-looking app rather than a broken one.
   */
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const fontsSettled = fontsLoaded || !!fontError;

  // `setColorScheme` drives nativewind's `dark:` utilities; the device scheme
  // is read from Appearance so the two can't feed each other. See useTheme.
  const { setColorScheme } = useColorScheme();
  const deviceScheme = useDeviceScheme();
  const hydrated = useAriaStore((s) => s.hydrated);
  const themePref = useAriaStore((s) => s.settings.theme);
  const signedIn = useAriaStore((s) => s.signedIn);
  const onboarded = useAriaStore((s) => s.onboarded);
  const segments = useSegments();
  // When Supabase is wired up, wait for the session check before routing.
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    // Not gated on `hydrated`, Aria's loading screen takes over from here and
    // matches the splash pixel for pixel, so there's nothing to wait for.
    SplashScreen.hideAsync().catch(() => {
      /* already hidden */
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  // Register the notification handler once so alarm chimes show while the app is open.
  useEffect(() => {
    setupNotificationHandler();
  }, []);

  // Tapping "Aria has it ready" goes straight to the run screen, which is what
  // makes a scheduled task actionable the moment it comes due.
  useEffect(() => addAutomationTapListener(() => router.push('/aria/run')), []);
  // The morning prompt opens the day it is about, not wherever the app was left.
  useEffect(() => addDailyReviewTapListener(() => router.push('/review')), []);

  // Supabase session → drives signedIn/onboarded and hydrates the local cache.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let sub: { unsubscribe: () => void } | undefined;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session?.user) {
        setSyncUser(session.user.id);
        if (__DEV__) console.log('[aria] Supabase session found, sync user set');
        await useAriaStore.getState().hydrate(session.user.id);
      }
      if (__DEV__ && !session?.user) {
        console.error('[aria] no Supabase session at startup, nothing will sync to the server');
      }
      // No session at startup does *not* mean signed out. An expired token, a
      // refresh that hasn't finished, or no network for a moment all land here,
      // and clearing on any of them destroyed the device's only copy of the
      // data. The auth gate below routes to /login either way; the data waits.
      setAuthReady(true);

      const listener = supabase.auth.onAuthStateChange((event, s) => {
        if (s?.user) {
          setSyncUser(s.user.id);
          void useAriaStore.getState().hydrate(s.user.id);
          return;
        }
        // Only a deliberate sign-out wipes the device. Every other event that
        // arrives without a session is transient.
        if (event === 'SIGNED_OUT') useAriaStore.getState().clearLocal();
      });
      sub = listener.data.subscription;
    })();
    return () => sub?.unsubscribe();
  }, []);

  // Flush the offline outbox whenever the app comes to the foreground.
  // Deliberately *not* a re-hydrate: coming back from Mail or Messages is the
  // common case, and re-pulling the whole account on every app switch risks
  // overwriting local work with a stale or partial fetch. Pulling happens on
  // cold start and on auth changes; pushing happens continuously via the outbox.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void flushOutbox();
    });
    return () => sub.remove();
  }, []);

  // Apply the user's theme preference (System / Light / Dark).
  /**
   * The theme the user picked, resolved against the OS scheme.
   *
   * Also drives nativewind's own light/dark flag, so `dark:` utilities and the
   * navigation chrome still agree with a theme that is neither plain light nor
   * plain dark, "Cream" is a light theme, "Charcoal" a dark one.
   */
  const theme = resolveTheme(themePref, deviceScheme === 'dark');

  useEffect(() => {
    if (!hydrated) return;
    setColorScheme(
      themePref === 'system' ? 'system' : THEMES[themePref].dark ? 'dark' : 'light',
    );
  }, [hydrated, themePref, setColorScheme]);

  // Auth gate: signed out → /login, new signup → /welcome, otherwise into the app.
  useEffect(() => {
    if (!hydrated || !authReady) return;
    const first = segments[0];
    const onLogin = first === 'login';
    const onForgot = first === 'forgot-password';
    const onWelcome = first === 'welcome';
    if (!signedIn) {
      // Login and the password-reset flow are both reachable while signed out.
      if (!onLogin && !onForgot) router.replace('/login');
    } else if (!onboarded) {
      if (!onWelcome) router.replace('/welcome');
    } else if (onLogin || onForgot || onWelcome) {
      router.replace('/');
    }
  }, [hydrated, authReady, signedIn, onboarded, segments]);

  if (!hydrated || !authReady || !minElapsed || !fontsSettled)
    return <AriaLoading durationMs={MIN_LOADING_MS} />;

  return (
    /*
     * `vars()` writes the theme's CSS variables onto this view and every
     * className-styled descendant inherits them. The media query in global.css
     * only knows light and dark, so this is what lets a named theme like Cream
     * or Midnight drive `bg-surface`, `text-ink` and the rest.
     */
    <GestureHandlerRootView style={[{ flex: 1 }, vars(themeVars(theme))]}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme(theme.palette, theme.dark)}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.palette.bg } }}>
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            <Stack.Screen name="forgot-password" options={{ animation: 'fade' }} />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="task/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="aria/[taskId]" options={{ presentation: 'card' }} />
            <Stack.Screen name="aria/run" options={{ presentation: 'card' }} />
            <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
            <Stack.Screen name="activity" options={{ presentation: 'modal' }} />
            <Stack.Screen name="research/[taskId]" options={{ presentation: 'card' }} />
            <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
            <Stack.Screen name="rebalance" options={{ presentation: 'modal' }} />
            <Stack.Screen name="reschedule" options={{ presentation: 'modal' }} />
            <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="support" options={{ presentation: 'modal' }} />
            <Stack.Screen name="connections" options={{ presentation: 'modal' }} />
          </Stack>
          <ToastHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
