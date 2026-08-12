/**
 * What the server needs, checked once when the first route is imported.
 *
 * The Supabase variables already fail fast in lib/supabase.ts, because without
 * them the app falls back to mock auth that accepts any password. The keys here
 * are different: missing them is not a security hole, it is *silent
 * degradation*. Every route answers with scripted fallback text and looks like
 * it worked, which is how a dead API key survived unnoticed for a long time
 * (see the comment in app/api/draft+api.ts).
 *
 * So the default is to say so loudly, once, rather than to crash, a demo
 * deliberately run without keys is a legitimate configuration. Set
 * ARIA_STRICT_CONFIG=1 in a real deployment to turn that into a hard failure at
 * startup instead, which is what you want when scripted output reaching a user
 * would be worse than an outage.
 */

interface Requirement {
  name: string;
  /** What silently stops working when this is absent. */
  effect: string;
}

const REQUIREMENTS: Requirement[] = [
  {
    name: 'ANTHROPIC_API_KEY',
    effect: 'Aria returns scripted drafts, checklists and chat replies instead of written ones',
  },
  {
    name: 'RESEND_API_KEY',
    effect: 'scheduled email is handed off to the user’s mail app instead of being sent',
  },
  {
    name: 'ARIA_FROM_EMAIL',
    effect: 'the same as a missing RESEND_API_KEY: no mail can be sent server-side',
  },
];

function missing(): Requirement[] {
  return REQUIREMENTS.filter(({ name }) => !process.env[name]?.trim());
}

let checked = false;

/**
 * Report anything absent. Idempotent, so importing it from several routes still
 * produces one message rather than one per route per reload.
 */
export function checkServerConfig(): void {
  if (checked) return;
  checked = true;

  const gaps = missing();
  if (!gaps.length) return;

  const detail = gaps.map((g) => `  · ${g.name}: ${g.effect}`).join('\n');
  const strict = process.env.ARIA_STRICT_CONFIG === '1';

  if (strict) {
    // Fail at import time, so a misconfigured deploy dies immediately instead of
    // serving plausible-looking scripted text to real users.
    throw new Error(
      `Aria is missing required configuration and ARIA_STRICT_CONFIG=1:\n${detail}`,
    );
  }

  console.warn(
    `[aria] running with degraded functionality, configuration missing:\n${detail}\n` +
      '  Set these in .env.local, or set ARIA_STRICT_CONFIG=1 to refuse to start without them.',
  );
}

// ---------------------------------------------------------------------------
// Is the key any good?
//
// `checkServerConfig` above answers "is a key set", which is a different and
// much weaker question. A placeholder, `ANTHROPIC_API_KEY=sk-ant-...` copied
// out of a README and never replaced, passes it, boots cleanly, and then every
// route falls back to scripted text. That is exactly how this app ran for
// weeks: a present, invalid, 24-character key.
//
// So ask the API. `GET /v1/models` authenticates without generating anything,
// so it costs nothing and bills nothing.
// ---------------------------------------------------------------------------

export type KeyStatus =
  | 'unchecked' // hasn't run yet, or no key to check
  | 'ok'
  | 'invalid' // the API rejected it, 401/403
  | 'unreachable'; // network trouble; says nothing about the key

let keyStatus: KeyStatus = 'unchecked';

/** The last known verdict. Never blocks; never returns the key. */
export function modelKeyStatus(): KeyStatus {
  return keyStatus;
}

/**
 * Verify the key against the API, once.
 *
 * Deliberately never throws. A verification that can take down the server on a
 * flaky network is worse than the problem it detects, `unreachable` is not
 * `invalid`, and only the latter is the app's fault.
 */
export async function verifyModelKey(): Promise<KeyStatus> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return (keyStatus = 'unchecked');

  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });

    if (res.ok) return (keyStatus = 'ok');

    if (res.status === 401 || res.status === 403) {
      keyStatus = 'invalid';
      console.error(
        `[aria] ANTHROPIC_API_KEY was rejected by the API (HTTP ${res.status}).\n` +
          '  Every AI route will answer with scripted fallback text that looks like a\n' +
          '  real reply. A working key starts sk-ant-api03- and is ~108 characters.\n' +
          '  Get one at https://console.anthropic.com/settings/keys',
      );
      return keyStatus;
    }

    // 429, 5xx, the key may be perfectly fine.
    keyStatus = 'unreachable';
    console.warn(`[aria] could not verify ANTHROPIC_API_KEY (HTTP ${res.status}); continuing.`);
    return keyStatus;
  } catch {
    keyStatus = 'unreachable';
    console.warn('[aria] could not reach the Anthropic API to verify the key; continuing.');
    return keyStatus;
  }
}

/**
 * Kick verification off in the background at import.
 *
 * Not awaited: the first request should not wait on a network round trip, and
 * the result matters to whoever reads the logs, not to that request. By the
 * time anyone has typed a message the verdict is in.
 */
export function startKeyVerification(): void {
  if (keyStatus !== 'unchecked') return;
  void verifyModelKey();
}

/** Test seam: lets the verification script assert both branches. */
export const __requirements = REQUIREMENTS.map((r) => r.name);
export function __resetServerConfigCheck() {
  checked = false;
  keyStatus = 'unchecked';
}
