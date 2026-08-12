import { createClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { badRequest, parseBody } from '@/lib/api-schemas';
import { tooManyRequests, type RateLimitResult } from '@/lib/rate-limit';
import { checkServerConfig, startKeyVerification } from '@/lib/server-config';

/**
 * Who is calling an API route.
 *
 * The routes spend money, Anthropic tokens, Resend sends, so each one has to
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
 * Only consulted when `requireConfirmed` below is on. Where it applies, it is
 * what stops a scripted signup loop from minting spend quota: the per-user
 * ceilings in lib/rate-limit.ts scale with however many addresses an attacker
 * can cycle through, and a confirmed contact makes each one cost a mailbox
 * rather than a string.
 *
 * Phone counts alongside email so this doesn't lock out a future SMS sign-up.
 */
export function isConfirmedUser(user: {
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
}): boolean {
  return Boolean(user.email_confirmed_at || user.phone_confirmed_at);
}

/**
 * Whether to enforce the check above. Off unless explicitly switched on.
 *
 * It is only meaningful when the Supabase project actually withholds
 * confirmation, with autoconfirm on, every account arrives already confirmed
 * and the check waves everyone through. Worse, it is enforced against a field
 * this app does not control: if a future GoTrue stopped stamping
 * `email_confirmed_at` under autoconfirm, an always-on check would 401 every
 * real user and the app would quietly serve scripted fallbacks instead.
 *
 * So it is opt-in and tied to the dashboard setting it mirrors. Turn Supabase's
 * "Confirm email" on, set ARIA_REQUIRE_CONFIRMED_EMAIL=1, and free signups stop
 * carrying a spend quota. Leave both off and the ceilings in lib/rate-limit.ts
 * are what bound abuse.
 */
const requireConfirmed = process.env.ARIA_REQUIRE_CONFIRMED_EMAIL === '1';

/**
 * The authenticated caller's user id, or null when there isn't one.
 *
 * `getUser(token)` asks Supabase to check the token's signature and expiry.
 * Decoding the JWT here instead would mean trusting a value the caller handed
 * us, which is the thing being guarded against, a forged payload would sail
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

    // Only when the project is actually withholding confirmation, see
    // `requireConfirmed`.
    if (requireConfirmed && !isConfirmedUser(data.user)) return null;

    return data.user.id;
  } catch {
    // A network failure reaching Supabase must deny, not allow.
    return null;
  }
}

/**
 * Development, decided from the environment rather than from `__DEV__`.
 *
 * `__DEV__` is a Metro global. It exists in the bundle and does not exist when
 * this module is imported directly by a check suite in plain Node, where
 * referencing it is a ReferenceError that fails seven security checks at once.
 */
const isDev = process.env.NODE_ENV !== 'production';

/** 401 in the same shape the routes already use for errors. */
export const unauthorized = (): Response =>
  Response.json({ error: 'Unauthorized' }, { status: 401 });

/**
 * Declare a route that cannot run unauthenticated.
 *
 * Expo Router has no `middleware.ts`, so protection here is per-file: every
 * route repeated the same four guards by hand, and a newly added route was
 * fully public until someone remembered to copy them. That failure is silent , 
 * working code, no error, no test failure, no symptom.
 *
 * So the guards are not something a handler *calls*, they are how it is
 * reached. The authenticated user id and the validated body arrive as
 * arguments, which means a handler that skips a check cannot be written: there
 * is no other way to obtain either value.
 *
 * Order is deliberate and load-bearing. Identity, then quota, then shape, then
 * spend, nothing costly happens before we know who is asking and whether they
 * have budget left.
 */
export function protectedRoute<T extends z.ZodTypeAny>(
  schema: T,
  quota: (userId: string) => RateLimitResult,
  handler: (body: z.infer<T>, userId: string) => Promise<Response>,
  /**
   * A larger body ceiling, for the one route that carries an uploaded file.
   *
   * An argument rather than a property of the schema, so raising it is a visible
   * decision at the route rather than a side effect of adding a base64 field , 
   * and so every other route keeps the default without having to say so.
   */
  maxBytes?: number,
): (request: Request) => Promise<Response> {
  // Runs when the route module is first imported, every route goes through
  // here, so a deploy missing its keys says so once at startup rather than
  // quietly serving scripted output. See lib/server-config.ts.
  checkServerConfig();
  // Presence is checked synchronously above; whether the key actually works is
  // answered in the background, see server-config.ts.
  startKeyVerification();

  return async (request: Request): Promise<Response> => {
    const userId = await requireUser(request);
    if (!userId) {
      /*
       * Say it out loud in development.
       *
       * A 401 here is invisible from the phone: the caller catches it and falls
       * back to scripted text, which reads like a real answer. That is the
       * project's standing failure mode, and it cost a day when a chat that
       * repeated the same sentence turned out to be an unauthenticated request
       * rather than a bad model. The terminal is where somebody is already
       * looking when they wonder why Aria sounds stupid.
       */
      if (isDev) {
        const route = new URL(request.url).pathname;
        console.warn(
          `[aria] 401 on ${route}: no valid session on the request. ` +
            'The caller will fall back to scripted text, which looks like a bad answer rather than a signed-out app.',
        );
      }
      return unauthorized();
    }

    const limited = quota(userId);
    if (!limited.ok) {
      // Same reasoning: a throttled request degrades to scripted text, and
      // "Aria got worse for an hour" is not a diagnosis anybody can act on.
      if (isDev) console.warn(`[aria] rate limited: ${new URL(request.url).pathname}`);
      return tooManyRequests(limited);
    }

    const body = await parseBody(request, schema, maxBytes);
    if (!body) return badRequest();

    return handler(body, userId);
  };
}
