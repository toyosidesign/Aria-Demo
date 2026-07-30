import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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

/** POST JSON to one of Aria's routes with the caller's credentials attached. */
export async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify(body),
  });
}
