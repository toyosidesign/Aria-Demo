/**
 * Regression tests for the security fixes. Run with `npm run security-check`.
 *
 * These import the real modules, not copies, so they fail if a control is
 * weakened or removed. Each test names the finding it guards, because a bare
 * "expected 401" tells whoever breaks it nothing about why it mattered.
 *
 * Offline only: nothing here reaches the network. The live route wiring is
 * checked separately by ./live.mjs against a running dev server.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { isConfirmedUser, protectedRoute } from '@/lib/api-auth';
import {
  AssistantSchema,
  ChecklistSchema,
  MAX_BODY_BYTES,
  SendEmailSchema,
  parseBody,
} from '@/lib/api-schemas';
import { __ceilings, __resetRateLimits, limitAi, limitMail } from '@/lib/rate-limit';
import { emailSubject, normaliseSubject } from '@/lib/email-subject';
import {
  __requirements,
  __resetServerConfigCheck,
  checkServerConfig,
} from '@/lib/server-config';

const ROOT = path.resolve(import.meta.dirname, '../..');

let passed = 0;
const failures: string[] = [];

async function test(name: string, body: () => void | Promise<void>) {
  try {
    await body();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures.push(name);
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${message}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** A request carrying an arbitrary raw body, with an honest content-length. */
function req(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://aria.test/api/subtasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

const valid = JSON.stringify({ title: 'History essay' });

// ───────────────────────────────────────────────────────────────────────────────
section('FINDING #1a — the confirmed-contact predicate (opt-in via env)');

await test('enforcement is opt-in, and currently reflects the environment', () => {
  // The gate is only correct when Supabase is actually withholding confirmation.
  // This asserts the wiring, not a policy: it fails if the flag stops being
  // read, which would silently change who can spend money.
  const src = readFileSync(path.join(ROOT, 'src/lib/api-auth.ts'), 'utf8');
  assert.match(src, /ARIA_REQUIRE_CONFIRMED_EMAIL === '1'/, 'must be env-gated');
  assert.match(
    src,
    /requireConfirmed && !isConfirmedUser\(data\.user\)/,
    'the gate must consult the flag, not run unconditionally',
  );
  console.log(
    `      (currently ${process.env.ARIA_REQUIRE_CONFIRMED_EMAIL === '1' ? 'ENFORCED' : 'not enforced'} — ` +
      'set ARIA_REQUIRE_CONFIRMED_EMAIL=1 alongside Supabase "Confirm email")',
  );
});

await test('a brand-new unconfirmed signup is rejected', () => {
  assert.equal(isConfirmedUser({}), false);
});

await test('explicit nulls are rejected (Supabase sends null, not undefined)', () => {
  assert.equal(
    isConfirmedUser({
      email_confirmed_at: null as unknown as undefined,
      phone_confirmed_at: null as unknown as undefined,
    }),
    false,
  );
});

await test('an empty-string timestamp is rejected, not treated as present', () => {
  assert.equal(isConfirmedUser({ email_confirmed_at: '' }), false);
});

await test('a confirmed email is accepted', () => {
  assert.equal(isConfirmedUser({ email_confirmed_at: '2026-07-29T10:00:00Z' }), true);
});

await test('a confirmed phone is accepted, so an SMS flow is not locked out', () => {
  assert.equal(isConfirmedUser({ phone_confirmed_at: '2026-07-29T10:00:00Z' }), true);
});

// ───────────────────────────────────────────────────────────────────────────────
section('FINDING #1b — process-wide ceiling bounds a scripted account fan-out');

await test('a single user is cut off at their own hourly ceiling', () => {
  __resetRateLimits();
  const me = 'user-aaa';
  for (let i = 0; i < __ceilings.aiPerUser; i += 1) {
    assert.equal(limitAi(me).ok, true, `call ${i + 1} should be allowed`);
  }
  assert.equal(limitAi(me).ok, false, 'the call past the ceiling must be refused');
});

await test('many accounts each under their own ceiling still hit the global one', () => {
  __resetRateLimits();
  // The exact attack: every request is from a different "account", so every
  // per-user check passes. Before the global ceiling this was unbounded.
  let allowed = 0;
  for (let i = 0; i < __ceilings.aiGlobal * 2; i += 1) {
    if (limitAi(`throwaway-${i}`).ok) allowed += 1;
  }
  assert.equal(allowed, __ceilings.aiGlobal, 'fan-out must stop at the global ceiling');
});

await test('a user refused by the global ceiling is not charged for it', () => {
  __resetRateLimits();
  // Exhaust the global ceiling using other accounts.
  for (let i = 0; i < __ceilings.aiGlobal; i += 1) limitAi(`filler-${i}`);

  const victim = 'user-bbb';
  assert.equal(limitAi(victim).ok, false, 'blocked by the shared ceiling');
  assert.equal(limitAi(victim).ok, false, 'still blocked');

  // If those rejections had consumed the victim's quota, they would have fewer
  // than a full allowance once the window clears. Someone else exhausting a
  // shared resource must not eat into your budget.
  __resetRateLimits();
  let mine = 0;
  while (limitAi(victim).ok) mine += 1;
  assert.equal(mine, __ceilings.aiPerUser, 'full personal quota must survive');
});

await test('mail has its own, tighter pair of ceilings', () => {
  __resetRateLimits();
  assert.ok(
    __ceilings.mailPerUser < __ceilings.aiPerUser,
    'mail is costlier to abuse and must be scarcer',
  );
  let allowed = 0;
  for (let i = 0; i < __ceilings.mailGlobal * 2; i += 1) {
    if (limitMail(`throwaway-${i}`).ok) allowed += 1;
  }
  assert.equal(allowed, __ceilings.mailGlobal);
});

await test('AI spend does not draw down the mail budget', () => {
  __resetRateLimits();
  for (let i = 0; i < __ceilings.aiGlobal; i += 1) limitAi(`filler-${i}`);
  assert.equal(limitMail('user-ccc').ok, true, 'buckets must be independent');
});

await test('a refused caller gets a positive, non-growing Retry-After', () => {
  __resetRateLimits();
  const me = 'user-ddd';
  for (let i = 0; i < __ceilings.aiPerUser; i += 1) limitAi(me);
  const first = limitAi(me);
  const second = limitAi(me);
  assert.equal(first.ok, false);
  assert.ok(first.retryAfter > 0, 'must tell the client when to come back');
  assert.ok(
    second.retryAfter <= first.retryAfter,
    'hammering must not push the retry time further out',
  );
});

// ───────────────────────────────────────────────────────────────────────────────
section('FINDING #2 — oversized bodies are refused before they are parsed');

await test('a legitimate body still parses', async () => {
  const parsed = await parseBody(req(valid), ChecklistSchema);
  assert.deepEqual(parsed, { title: 'History essay' });
});

await test('a body over the cap is refused', async () => {
  const huge = JSON.stringify({ title: 'x'.repeat(MAX_BODY_BYTES + 1000) });
  assert.equal(await parseBody(req(huge), ChecklistSchema), null);
});

await test('a body is refused on real size even when content-length lies', async () => {
  // The attack against a header-only check: claim to be tiny, send megabytes.
  const huge = JSON.stringify({ title: 'x'.repeat(MAX_BODY_BYTES + 1000) });
  const lying = new Request('https://aria.test/api/subtasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'content-length': '12' },
    body: huge,
  });
  assert.equal(await parseBody(lying, ChecklistSchema), null);
});

await test('the cap counts bytes, not UTF-16 units', async () => {
  // Each emoji is 2 UTF-16 units but 4 UTF-8 bytes, so `String.length` measures
  // this payload at half its real size. Built to sit *under* the cap by units
  // and *over* it by bytes: a length-based check would wave it through.
  //
  // For today's schemas the field caps are a second net (no schema allows a
  // field long enough to reach 64KB on its own), so this guards the cap itself
  // against a future schema with a larger allowance.
  const body = JSON.stringify({ title: '🙂'.repeat(MAX_BODY_BYTES / 3) });
  assert.ok(body.length < MAX_BODY_BYTES, 'under the cap by code units...');
  assert.ok(
    Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES,
    '...but over it in real bytes, which is what must count',
  );
  assert.equal(await parseBody(req(body), ChecklistSchema), null);
});

await test('legitimate non-ASCII text is not over-rejected by the byte cap', async () => {
  // The regression risk of counting bytes: a cap that is too eager turns into a
  // bug that only shows up for people who do not write in English.
  const title = 'Räsonnement über Kierkegaard — 参考文献と結論 🙂';
  assert.ok(Buffer.byteLength(title, 'utf8') > title.length, 'genuinely multi-byte');
  const parsed = await parseBody(req(JSON.stringify({ title })), ChecklistSchema);
  assert.deepEqual(parsed, { title });
});

await test('the cap clears the largest body the schemas actually allow', async () => {
  // The invariant that matters, and the one a character-count intuition gets
  // wrong: zod's .max() counts UTF-16 units, the wire carries UTF-8, and CJK is
  // 1 unit to 3 bytes. Every field below sits at its documented maximum, so this
  // is a request the API promises to accept — a full chat history in Japanese.
  //
  // A 64KB cap passed every other test in this file and rejected this one.
  const cjk = (n: number) => '要'.repeat(n);
  const worstCase = {
    message: cjk(2000),
    today: '2026-07-30',
    history: Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      text: cjk(2000),
    })),
    senderName: cjk(120),
    senderContext: cjk(300),
  };

  // It must genuinely be schema-valid, or this proves nothing.
  assert.equal(AssistantSchema.safeParse(worstCase).success, true, 'must be a valid request');

  const raw = JSON.stringify(worstCase);
  assert.ok(
    Buffer.byteLength(raw, 'utf8') < MAX_BODY_BYTES,
    `largest valid body is ${Buffer.byteLength(raw, 'utf8')} bytes but the cap is ` +
      `${MAX_BODY_BYTES} — raise MAX_BODY_BYTES or lower a field cap`,
  );

  const request = new Request('https://aria.test/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
  assert.notEqual(await parseBody(request, AssistantSchema), null, 'must be accepted');
});

await test('malformed JSON is refused', async () => {
  assert.equal(await parseBody(req('{"title": '), ChecklistSchema), null);
});

await test('a well-formed body that violates the schema is refused', async () => {
  assert.equal(await parseBody(req(JSON.stringify({ title: '' })), ChecklistSchema), null);
});

await test('field-level caps still apply under the body cap', async () => {
  // 400 chars is a small body but exceeds ChecklistSchema's 300-char title.
  const body = JSON.stringify({ title: 'x'.repeat(400) });
  assert.ok(Buffer.byteLength(body) < MAX_BODY_BYTES);
  assert.equal(await parseBody(req(body), ChecklistSchema), null);
});

// ───────────────────────────────────────────────────────────────────────────────
section('FINDING #4 — protectedRoute makes route auth default-deny');

/** Records whether the wrapped handler ever ran. */
function spyRoute() {
  const state = { handlerRuns: 0, quotaChecks: 0 };
  const route = protectedRoute(
    ChecklistSchema,
    (userId) => {
      state.quotaChecks += 1;
      return limitAi(userId);
    },
    async () => {
      state.handlerRuns += 1;
      return Response.json({ ok: true });
    },
  );
  return { state, route };
}

await test('no Authorization header → 401', async () => {
  const { route } = spyRoute();
  assert.equal((await route(req(valid))).status, 401);
});

await test('the handler never runs for an unauthenticated request', async () => {
  const { state, route } = spyRoute();
  await route(req(valid));
  assert.equal(state.handlerRuns, 0, 'the paid work must not execute');
});

await test('an unauthenticated request does not consume quota', async () => {
  // Otherwise anyone could exhaust the shared ceiling with no credentials at
  // all, turning the rate limiter itself into the denial of service.
  const { state, route } = spyRoute();
  await route(req(valid));
  assert.equal(state.quotaChecks, 0, 'quota must be checked only after identity');
});

await test('a non-Bearer Authorization scheme → 401', async () => {
  const { route } = spyRoute();
  const r = await route(req(valid, { Authorization: 'Basic YWRtaW46YWRtaW4=' }));
  assert.equal(r.status, 401);
});

await test('an empty Bearer token → 401', async () => {
  const { route } = spyRoute();
  assert.equal((await route(req(valid, { Authorization: 'Bearer ' }))).status, 401);
});

await test('a 401 body leaks nothing about why', async () => {
  const { route } = spyRoute();
  const payload = await (await route(req(valid))).json();
  assert.deepEqual(payload, { error: 'Unauthorized' });
});

await test('auth is checked before the body is even read', async () => {
  // An oversized unauthenticated body must cost a 401, not a parse.
  const huge = JSON.stringify({ title: 'x'.repeat(MAX_BODY_BYTES + 1000) });
  const { state, route } = spyRoute();
  assert.equal((await route(req(huge))).status, 401);
  assert.equal(state.handlerRuns, 0);
});

// ───────────────────────────────────────────────────────────────────────────────
section('1.6 — a deploy missing its keys says so instead of degrading silently');

await test('missing keys are reported, not swallowed', () => {
  const saved = __requirements.map((k) => process.env[k]);
  try {
    for (const k of __requirements) delete process.env[k];
    __resetServerConfigCheck();
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(String(args[0]));
    try {
      checkServerConfig();
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1, 'exactly one warning');
    for (const k of __requirements) {
      assert.ok(warnings[0].includes(k), `${k} must be named in the warning`);
    }
  } finally {
    __requirements.forEach((k, i) => {
      if (saved[i] !== undefined) process.env[k] = saved[i];
    });
  }
});

await test('the warning is emitted once, not per route import', () => {
  const saved = __requirements.map((k) => process.env[k]);
  try {
    for (const k of __requirements) delete process.env[k];
    __resetServerConfigCheck();
    let calls = 0;
    const original = console.warn;
    console.warn = () => void (calls += 1);
    try {
      checkServerConfig();
      checkServerConfig();
      checkServerConfig();
    } finally {
      console.warn = original;
    }
    assert.equal(calls, 1);
  } finally {
    __requirements.forEach((k, i) => {
      if (saved[i] !== undefined) process.env[k] = saved[i];
    });
  }
});

await test('ARIA_STRICT_CONFIG=1 turns a missing key into a hard startup failure', () => {
  const saved = __requirements.map((k) => process.env[k]);
  try {
    for (const k of __requirements) delete process.env[k];
    process.env.ARIA_STRICT_CONFIG = '1';
    __resetServerConfigCheck();
    assert.throws(() => checkServerConfig(), /missing required configuration/);
  } finally {
    delete process.env.ARIA_STRICT_CONFIG;
    __requirements.forEach((k, i) => {
      if (saved[i] !== undefined) process.env[k] = saved[i];
    });
    __resetServerConfigCheck();
  }
});

await test('a fully configured server reports nothing', () => {
  const saved = __requirements.map((k) => process.env[k]);
  try {
    for (const k of __requirements) process.env[k] = 'set';
    __resetServerConfigCheck();
    let calls = 0;
    const original = console.warn;
    console.warn = () => void (calls += 1);
    try {
      checkServerConfig();
    } finally {
      console.warn = original;
    }
    assert.equal(calls, 0, 'no noise when everything is present');
  } finally {
    __requirements.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
section('FINDING #3 — sessions are never written to disk on web');

const supabaseSrc = readFileSync(path.join(ROOT, 'src/lib/supabase.ts'), 'utf8');

await test('persistSession is disabled in a browser', () => {
  assert.match(
    supabaseSrc,
    /persistSession:\s*!isBrowser/,
    'a refresh token in localStorage is a lasting account takeover',
  );
});

await test('no storage adapter is attached in a browser', () => {
  assert.match(supabaseSrc, /storage:\s*isBrowser\s*\?\s*undefined\s*:\s*secureSessionStore/);
});

await test('isBrowser distinguishes a real browser from the server render', () => {
  assert.match(supabaseSrc, /isBrowser\s*=\s*Platform\.OS === 'web' && typeof window !== 'undefined'/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Regression guards — controls that must not silently disappear');

const authSrc = readFileSync(path.join(ROOT, 'src/lib/api-auth.ts'), 'utf8');

await test('requireUser still validates the token against Supabase', () => {
  assert.match(authSrc, /verifier\.auth\.getUser\(token\)/, 'never decode the JWT locally');
});

await test('requireUser still fails closed on a network error', () => {
  assert.match(authSrc, /catch\s*{\s*\n\s*\/\/[^\n]*\n\s*return null;/);
});

/**
 * Every API route on disk, found rather than listed.
 *
 * A hardcoded list would have exactly the hole protectedRoute exists to close:
 * a route added later is a route this test never looks at. Recursive, because
 * `+api.ts` files can sit in subdirectories.
 */
function apiRouteFiles(dir = path.join(ROOT, 'src/app')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...apiRouteFiles(full));
    else if (entry.name.endsWith('+api.ts') || entry.name.endsWith('+api.tsx')) found.push(full);
  }
  return found;
}

const ROUTE_FILES = apiRouteFiles();

await test('the suite actually found the API routes it is meant to guard', () => {
  // Guards the guard: if the glob silently matched nothing, every assertion
  // below would vacuously pass and report green on an unprotected app.
  assert.ok(ROUTE_FILES.length >= 4, `expected at least 4 routes, found ${ROUTE_FILES.length}`);
});

await test('every API route on disk is declared through protectedRoute', () => {
  for (const file of ROUTE_FILES) {
    const rel = path.relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    assert.match(
      src,
      /export const (POST|GET|PUT|PATCH|DELETE) = protectedRoute\(/,
      `${rel} must be declared with protectedRoute — a bare handler is unauthenticated`,
    );
  }
});

await test('no API route exports a bare handler function', () => {
  for (const file of ROUTE_FILES) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /export\s+(async\s+)?function\s+(POST|GET|PUT|PATCH|DELETE)\b/,
      `${path.relative(ROOT, file)} exports a handler that bypasses every guard`,
    );
  }
});

await test('no route exports a GET, which browsers can trigger without intent', () => {
  for (const file of ROUTE_FILES) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /export\s+(const\s+GET\b|(async\s+)?function\s+GET\b)/,
      `${path.relative(ROOT, file)} exposes a GET`,
    );
  }
});

await test('a header-injection attempt in an email subject is refused', async () => {
  const attempt = {
    to: 'someone@example.com',
    subject: 'Happy birthday!\nBcc: attacker@evil.example',
    body: 'hi',
  };
  assert.equal(SendEmailSchema.safeParse(attempt).success, false, 'CRLF must not pass');
  // The body is message text, not a header — newlines there are legitimate.
  assert.equal(
    SendEmailSchema.safeParse({ ...attempt, subject: 'Happy birthday!', body: 'line\nline' })
      .success,
    true,
  );
});

await test('a task title containing a newline still produces a sendable subject', () => {
  // The regression the CRLF check above created on its own: titles are not
  // newline-constrained (pasted, or written by the model) and `.trim()` leaves
  // internal breaks in place, so the subject was refused and the send failed
  // with a 400 the user could only read as "it didn't work".
  const messy = 'Email prof\nabout the essay\r\n\tdraft';
  const subject = emailSubject(messy, 'general');

  assert.doesNotMatch(subject, /[\r\n\t]/, 'must be a single line');
  assert.equal(subject, 'Email prof about the essay draft', 'and must stay readable');
  assert.equal(
    SendEmailSchema.safeParse({ to: 'a@b.co', subject, body: 'hi' }).success,
    true,
    'the normalised subject must pass the boundary check',
  );

  // A caller-supplied subject goes through the same normalisation.
  assert.equal(normaliseSubject('  Hi\nthere  '), 'Hi there');
  // And the fixed subjects for occasions are untouched.
  assert.equal(emailSubject('anything', 'birthday'), 'Happy birthday!');
});

await test('the service_role key appears nowhere in src/', () => {
  const hits = execSync(
    `grep -rli "service_role\\|serviceRole" ${JSON.stringify(path.join(ROOT, 'src'))} || true`,
    { encoding: 'utf8' },
  ).trim();
  assert.equal(hits, '', 'an RLS-bypassing key must never enter the app');
});

await test('the password reset screen does not echo the provider error', () => {
  const src = readFileSync(path.join(ROOT, 'src/app/forgot-password.tsx'), 'utf8');
  assert.doesNotMatch(src, /setError\(err\.message\)/, 'that is an account-existence oracle');
  assert.doesNotMatch(src, /setError\(vErr\.message\)/);
});

// ───────────────────────────────────────────────────────────────────────────────
console.log(
  failures.length
    ? `\n\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n` +
        failures.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${passed} offline checks passed.\x1b[0m`,
);
process.exit(failures.length ? 1 : 0);
