import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { secureSessionStore } from '@/lib/secure-session-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True once EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.
 * Until then the app runs on the local mock auth + local-only data, so
 * everything keeps working before the Supabase project is wired up.
 */
export const isSupabaseConfigured = !!(url && anon);

/**
 * Refuse to run a release build without a backend.
 *
 * The mock path below accepts any email and password. That's fine while
 * developing and unacceptable in something installed on someone's phone, and
 * the failure was silent: a build missing these two variables looked like it
 * worked and had no login at all. `__DEV__` is false in any release build, so
 * this crashes at startup there and never in local development.
 */
if (!isSupabaseConfigured && !__DEV__) {
  throw new Error(
    'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY before building. Refusing to start with ' +
      'mock authentication, which accepts any password.',
  );
}

// This module is also evaluated in Node during Expo Router's server render
// (the app uses server output for the /api routes). There, AsyncStorage's web
// path touches `window` and crashes, so on the server we skip storage and
// session persistence entirely (Supabase is never used server-side anyway).
const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

/**
 * Web exists to host the /api routes, not to sign people in.
 *
 * `secureSessionStore` falls back to AsyncStorage off-mobile, and on
 * react-native-web that is localStorage, plaintext, readable by any script on
 * the origin, and persistent across tabs. A refresh token is the identity RLS
 * trusts, so one read there is an account takeover that outlives the session.
 *
 * So on web the session is held in memory for the tab's lifetime and never
 * written to disk. The cost is re-authenticating after a refresh, which is the
 * right trade for a surface that is not the product. If browser sign-in ever
 * becomes a real feature, this needs server-set httpOnly cookies via
 * @supabase/ssr, not a different client-side store, because every one of them
 * is reachable from script.
 */
const isBrowser = Platform.OS === 'web' && typeof window !== 'undefined';

// A client is always created (with harmless placeholders when unconfigured) so
// imports never crash; real network calls are gated by `isSupabaseConfigured`.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'public-anon-placeholder',
  {
    auth: isServerRender
      ? { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      : {
          // Keychain / Keystore rather than plaintext AsyncStorage: the refresh
          // token is the identity RLS trusts, so it should not sit readable on
          // disk. See lib/secure-session-store.ts for the migration.
          //
          // On web there is no such store, so nothing is persisted at all , 
          // `storage: undefined` keeps the session in memory. See `isBrowser`.
          storage: isBrowser ? undefined : secureSessionStore,
          autoRefreshToken: true,
          persistSession: !isBrowser,
          detectSessionInUrl: false,
        },
  },
);
