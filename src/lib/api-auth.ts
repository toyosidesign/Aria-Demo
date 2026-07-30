import { createClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { badRequest, parseBody } from '@/lib/api-schemas';
import { tooManyRequests, type RateLimitResult } from '@/lib/rate-limit';
import { checkServerConfig } from '@/lib/server-config';

/**
 * Who is calling an API route.
 *
 * The routes spend money — Anthropic tokens, Resend sends — so each one has to
 * know whose request it is before doing any of that. Every route was open to
 * anyone with the URL before this existed.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * A client just for verifying tokens.
 *
 * Deliberately not the app's client from `lib/supabase.ts`: that one persists a
 * session to device storage, which inside a request handler is meaningless at
 * best. This one holds no session and never writes anything.
 */
const verifier =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

/**
 * Whether Supabase considers this account's contact details verified.
 *
 * Signing up is free, so without this the per-user ceilings in
 * lib/rate-limit.ts bounded nothing an attacker cares about: script the signup
 * form and every new account arrives carrying a fresh spend quota. Requiring a
 * confirmed contact means abuse costs a mailbox per account instead of a string.
 *
 * Phone counts alongside email so this doesn't silently lock out a future SMS
 * sign-up flow. When Supabase autoconfirm is on it stamps `email_confirmed_at`
 * at creation, so this is not a gate on projects that have deliberately turned
 * confirmation off.
 *
 * Exported because it is the predicate deciding who may spend money, so it is
 * asserted directly rather than trusted.
 */
export function isConfirmedUser(user: {
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
}): boolean {
  return Boolean(user.email_confirmed_at || user.phone_confirmed_at);
}

/**
 * The authenticated caller's user id, or null when there isn't one.
 *
 * `getUser(token)` asks Supabase to check the token's signature and expiry.
 * Decoding the JWT here instead would mean trusting a value the caller handed
 * us, which is the thing being guarded against — a forged payload would sail
 * straight through.
 */
export async function requireUser(request: Request): Promise<string | null> {
  if (!verifier) return null;
  // Header lookup is case-insensitive per the Fetch spec, so one read is enough.
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data.user) return null;

    // An unverified address is not a person yet — see isConfirmedUser.
    if (!isConfirmedUser(data.user)) return null;

    return data.user.id;
  } catch {
    // A network failure reaching Supabase must deny, not allow.
    return null;
  }
}

/** 401 in the same shape the routes already use for errors. */
export const unauthorized = (): Response =>
  Response.json({ error: 'Unauthorized' }, { status: 401 });

/**
 * Declare a route that cannot run unauthenticated.
 *
 * Expo Router has no `middleware.ts`, so protection here is per-file: every
 * route repeated the same four guards by hand, and a newly added route was
 * fully public until someone remembered to copy them. That failure is silent —
 * working code, no error, no test failure, no symptom.
 *
 * So the guards are not something a handler *calls*, they are how it is
 * reached. The authenticated user id and the validated body arrive as
 * arguments, which means a handler that skips a check cannot be written: there
 * is no other way to obtain either value.
 *
 * Order is deliberate and load-bearing. Identity, then quota, then shape, then
 * spend — nothing costly happens before we know who is asking and whether they
 * have budget left.
 */
export function protectedRoute<T extends z.ZodTypeAny>(
  schema: T,
  quota: (userId: string) => RateLimitResult,
  handler: (body: z.infer<T>, userId: string) => Promise<Response>,
): (request: Request) => Promise<Response> {
  // Runs when the route module is first imported — every route goes through
  // here, so a deploy missing its keys says so once at startup rather than
  // quietly serving scripted output. See lib/server-config.ts.
  checkServerConfig();

  return async (request: Request): Promise<Response> => {
    const userId = await requireUser(request);
    if (!userId) return unauthorized();

    const limited = quota(userId);
    if (!limited.ok) return tooManyRequests(limited);

    const body = await parseBody(request, schema);
    if (!body) return badRequest();

    return handler(body, userId);
  };
}
