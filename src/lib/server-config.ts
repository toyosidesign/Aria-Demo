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
 * So the default is to say so loudly, once, rather than to crash — a demo
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
    effect: 'the same as a missing RESEND_API_KEY — no mail can be sent server-side',
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

  const detail = gaps.map((g) => `  · ${g.name} — ${g.effect}`).join('\n');
  const strict = process.env.ARIA_STRICT_CONFIG === '1';

  if (strict) {
    // Fail at import time, so a misconfigured deploy dies immediately instead of
    // serving plausible-looking scripted text to real users.
    throw new Error(
      `Aria is missing required configuration and ARIA_STRICT_CONFIG=1:\n${detail}`,
    );
  }

  console.warn(
    `[aria] running with degraded functionality — configuration missing:\n${detail}\n` +
      '  Set these in .env.local, or set ARIA_STRICT_CONFIG=1 to refuse to start without them.',
  );
}

/** Test seam: lets the verification script assert both branches. */
export const __requirements = REQUIREMENTS.map((r) => r.name);
export function __resetServerConfigCheck() {
  checked = false;
}
