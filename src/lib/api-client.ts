import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { limitReachedNote } from '@/lib/quota';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Calling Aria's own API routes.
 *
 * The routes authenticate every request, so the access token has to travel with
 * it. One helper rather than four copies: a route that quietly stopped sending
 * the header would fail closed and look like a network problem, which is a
 * miserable thing to debug.
 */
export async function apiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isSupabaseConfigured) return headers;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // No token means the route answers 401 and the caller falls back to its
    // scripted path, which is the correct outcome for a signed-out client.
  }
  return headers;
}

/**
 * Turn `/api/draft` into something a phone can actually fetch.
 *
 * A relative URL only resolves where there is a document to resolve it against.
 * On web that is the page; in React Native there is no origin at all, so
 * `fetch('/api/draft')` throws before it reaches the network, and every caller
 * here catches and falls back to its scripted path. The result is an app that
 * looks like it is working: chat replies, drafts appear, subtasks generate,
 * none of it from the model. On a device, *every* AI route was doing this.
 *
 * That is the project's standing failure mode wearing a different hat, see the
 * silent-degradation note in HANDOFF.md, and it is why a draft that "didn't
 * work" still produced text.
 *
 * In development the origin is the machine running Metro, which Expo already
 * knows: `hostUri` is the same `host:port` the bundle was fetched from, so it
 * follows the dev server across networks without anything being configured.
 * In a release build there is no Metro, so it must be stated , 
 * `EXPO_PUBLIC_API_URL` is that statement.
 */
export function apiUrl(path: string): string {
  // Web resolves relative paths itself, and the API routes are same-origin.
  if (Platform.OS === 'web') return path;

  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return `${configured.replace(/\/$/, '')}${path}`;

  // `hostUri` is "192.168.0.148:8081" in dev, absent in a release build.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri) return `http://${hostUri.split('/')[0]}${path}`;

  // Nothing to resolve against. Returning the bare path keeps the failure in
  // one place rather than inventing a host that would fail more confusingly.
  return path;
}

/** POST JSON to one of Aria's routes with the caller's credentials attached. */
/**
 * The routes that cost money, and therefore the ones a free day is spent on.
 *
 * Listed rather than inferred: a route added later should have to be thought
 * about once, here, rather than quietly becoming free forever or quietly
 * costing somebody their allowance.
 *
 * `/api/health` and `/api/send-email` are deliberately absent. Neither writes
 * anything, and a limit that stops mail going out would be charging for the
 * part of the app that has nothing to do with writing.
 */
const COSTS_WRITING = new Set([
  '/api/assistant',
  '/api/draft',
  '/api/subtasks',
  '/api/guide',
  '/api/brief',
]);

export async function postJson(path: string, body: unknown): Promise<Response> {
  /*
   * The free day's allowance, spent here because everything passes through.
   *
   * One choke point rather than a check in each of five callers, three of which
   * are libraries the check suites load without a store. A refusal is shaped
   * like the server's own 429 so every caller already handles it: they fall
   * back to their scripted path, which is the right behaviour, and the toast is
   * what stops that reading as Aria having got worse.
   */
  if (COSTS_WRITING.has(path) && !useAriaStore.getState().spendWrite()) {
    showToast(limitReachedNote(), 'clock');
    return new Response(JSON.stringify({ error: 'Daily writing limit reached' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return fetch(apiUrl(path), {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify(body),
  });
}
