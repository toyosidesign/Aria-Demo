import '@/global.css';

import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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
import { addTaskAlarmTapListener } from '@/lib/alarms';
import { addDailyReviewTapListener } from '@/lib/daily-brief';
import { launchRoute } from '@/lib/launch-route';
import { runWorkAhead, workPassReport } from '@/lib/work-runner';
import { showToast } from '@/lib/toast';
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

/**
 * How long the startup session check may take before the app opens anyway.
 *
 * A backstop, not a budget. The check normally settles in well under a second;
 * this exists so a call that never settles at all cannot pin the loading screen
 * forever, which is a state with no way out but force-quitting the app.
 *
 * Longer than a slow mobile round trip, so a genuinely slow network still gets
 * its session, and short enough that nobody stares at a logo wondering whether
 * it has crashed.
 */
const AUTH_WATCHDOG_MS = 8000;

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
  // A tapped task alarm opens that task. It used to open nothing in particular,
  // because the alarm did not say which task it was about.
  useEffect(() => addTaskAlarmTapListener((id) => router.push(`/task/${id}`)), []);

  /*
   * And the tap that started the app.
   *
   * The listeners above register at startup, by which point a launch tap has
   * already been delivered, so it was silently dropped and people landed on
   * whatever the auth gate chose: "Get started" from cold, or the last tab they
   * had open. Deliberately waits for the gate to finish first, or the route
   * would be replaced a moment later by the gate's own redirect.
   */
  const launchHandled = useRef(false);
  useEffect(() => {
    if (!hydrated || !authReady || !signedIn || !onboarded) return;
    if (launchHandled.current) return;
    launchHandled.current = true;
    void launchRoute().then((route) => {
      if (route) router.push(route as Href);
    });
  }, [hydrated, authReady, signedIn, onboarded]);

  // Supabase session → drives signedIn/onboarded and hydrates the local cache.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let sub: { unsubscribe: () => void } | undefined;
    /*
     * Nothing here may hold the app at the loading screen.
     *
     * `authReady` is one of four gates in front of the whole app, and it used
     * to be set on the last line of an async block containing two awaits and no
     * catch: a session read that threw, or a `hydrate` whose network call never
     * came back, left the splash up permanently with no way out but a restart.
     * That is exactly what happened on web, where the session is held in memory
     * and the first read takes a different path.
     *
     * Two defences, because the two failures are different. `finally` covers a
     * rejection, and the timer covers a call that simply never settles.
     */
    const watchdog = setTimeout(() => setAuthReady(true), AUTH_WATCHDOG_MS);
    (async () => {
      try {
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
      } catch (err) {
        // Reported, never fatal. The device already holds its own copy, and the
        // gate below routes to /login when there is no session.
        console.warn('[aria] session check failed at startup:', err);
      } finally {
        clearTimeout(watchdog);
        // No session at startup does *not* mean signed out. An expired token, a
        // refresh that hasn't finished, or no network for a moment all land
        // here, and clearing on any of them destroyed the device's only copy of
        // the data. The auth gate below routes to /login either way; the data
        // waits.
        setAuthReady(true);
      }

      try {
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
      } catch (err) {
        // Losing the listener costs live updates, not the app.
        console.warn('[aria] could not subscribe to auth changes:', err);
      }
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

  /*
   * The Pro work pass: prepare what is due soon, re-date what has slipped.
   *
   * On foreground rather than on a timer, and once the store has hydrated so it
   * is working from the real task list rather than an empty one. `runWorkAhead`
   * is a no-op for Free and refuses to overlap with itself, so this can fire as
   * often as the OS decides to wake the app.
   *
   * What it did is said out loud. Work that appears with no explanation reads
   * as the app having changed something behind your back, which is the opposite
   * of what Pro is supposed to feel like.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const pass = () => {
      void runWorkAhead().then((result) => {
        if (cancelled) return;
        const line = workPassReport(result);
        if (line) showToast(line, 'check');
      });
    };
    pass();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') pass();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [hydrated]);

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
