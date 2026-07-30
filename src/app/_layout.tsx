import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'nativewind';

import { AriaLoading } from '@/components/aria-loading';
import { LockScreen } from '@/components/lock-screen';
import { ToastHost } from '@/components/toast-host';
import { setupNotificationHandler } from '@/lib/alarms';
import { addAutomationTapListener } from '@/lib/automation-notices';
import { biometricSupport } from '@/lib/biometrics';
import { palette } from '@/lib/colors';
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
  // When Supabase is wired up, wait for the session check before routing.
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [minElapsed, setMinElapsed] = useState(false);

  // Biometric lock. `locked` starts null so nothing renders until we know
  // whether this device can authenticate — flashing the app for a frame before
  // locking it would defeat the point.
  const biometricLock = useAriaStore((s) => s.settings.biometricLock);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [bioLabel, setBioLabel] = useState('Face ID');

  useEffect(() => {
    // Not gated on `hydrated` — Aria's loading screen takes over from here and
    // matches the splash pixel for pixel, so there's nothing to wait for.
    SplashScreen.hideAsync().catch(() => {
      /* already hidden */
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!biometricLock || !signedIn) {
        if (!cancelled) setLocked(false);
        return;
      }
      const support = await biometricSupport();
      if (cancelled) return;
      setBioLabel(support.label);
      // No usable biometrics — never lock someone out of their own account.
      setLocked(support.available);
    })();
    return () => {
      cancelled = true;
    };
  }, [biometricLock, signedIn]);

  // Register the notification handler once so alarm chimes show while the app is open.
  useEffect(() => {
    setupNotificationHandler();
  }, []);

  // Tapping "Aria has it ready" goes straight to the run screen, which is what
  // makes a scheduled task actionable the moment it comes due.
  useEffect(() => addAutomationTapListener(() => router.push('/aria/run')), []);

  // Supabase session → drives signedIn/onboarded and hydrates the local cache.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let sub: { unsubscribe: () => void } | undefined;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session?.user) {
        setSyncUser(session.user.id);
        await useAriaStore.getState().hydrate(session.user.id);
      } else {
        useAriaStore.getState().clearLocal();
      }
      setAuthReady(true);
      const listener = supabase.auth.onAuthStateChange((_event, s) => {
        if (s?.user) {
          setSyncUser(s.user.id);
          void useAriaStore.getState().hydrate(s.user.id);
        } else {
          useAriaStore.getState().clearLocal();
        }
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
  useEffect(() => {
    if (hydrated) setColorScheme(themePref);
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

  if (!hydrated || !authReady || !minElapsed || locked === null)
    return <AriaLoading durationMs={MIN_LOADING_MS} />;

  if (locked) return <LockScreen label={bioLabel} onUnlock={() => setLocked(false)} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme(scheme)}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette[scheme].bg } }}>
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
