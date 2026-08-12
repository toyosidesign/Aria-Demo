/**
 * End-to-end checks against a running dev server.
 *
 * The offline suite proves the guards work in isolation. This proves they are
 * actually wired into the shipped routes, specifically that Expo Router
 * recognises `export const POST = protectedRoute(...)`. If it only honoured
 * `export async function POST`, all four routes would answer 404 and the app
 * would be broken rather than protected, so this is the check that matters most.
 *
 * Usage: node scripts/security-check/live.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:8099';
const ROUTES = ['/api/assistant', '/api/draft', '/api/subtasks', '/api/send-email'];

let passed = 0;
const failures = [];

async function test(name, body) {
  try {
    await body();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${err.message.split('\n')[0]}`);
  }
}

const post = (path, body, headers = {}) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log(`\n\x1b[1mLive route checks against ${BASE}\x1b[0m`);

// The wiring check. A 404 here means protectedRoute is not being registered as
// a handler at all, the routes would be unreachable, not merely unprotected.
for (const route of ROUTES) {
  await test(`${route} is registered and rejects an anonymous caller with 401`, async () => {
    const res = await post(route, { title: 'probe', message: 'probe', today: '2026-07-30', to: 'a@b.co', body: 'x', kind: 'general' });
    assert(res.status !== 404, 'route not registered, Expo Router did not pick up the handler');
    assert(res.status !== 405, 'POST not accepted, handler export shape is wrong');
    assert(res.status === 401, `expected 401, got ${res.status}`);
    const payload = await res.json();
    assert(payload.error === 'Unauthorized', `expected an opaque 401 body, got ${JSON.stringify(payload)}`);
  });
}

for (const route of ROUTES) {
  await test(`${route} rejects a forged Bearer token`, async () => {
    // A syntactically valid but unsigned JWT. Anything that decodes it locally
    // instead of verifying it against Supabase would accept this.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated', exp: 9999999999 })).toString('base64url') +
      '.not-a-real-signature';
    const res = await post(route, { title: 'probe' }, { Authorization: `Bearer ${forged}` });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });
}

await test('GET is rejected on every route (no browser-triggerable spend)', async () => {
  // `!== 200` was too weak an assertion: a route that 500s on GET would pass it
  // while still executing something. The method must be refused outright.
  for (const route of ROUTES) {
    const res = await fetch(BASE + route);
    assert(
      res.status === 405 || res.status === 404,
      `${route} answered a GET with ${res.status}, expected the method to be refused`,
    );
  }
});

await test('other state-changing methods are rejected too', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const res = await fetch(BASE + '/api/send-email', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert(
      res.status === 405 || res.status === 404,
      `${method} /api/send-email returned ${res.status}, expected the method to be refused`,
    );
  }
});

await test('an oversized anonymous body is refused without being parsed', async () => {
  // 5MB. Should come back 401 from the auth check, never an OOM or a hang.
  const huge = JSON.stringify({ title: 'x'.repeat(5 * 1024 * 1024) });
  const started = Date.now();
  const res = await post('/api/subtasks', huge);
  assert(res.status === 401, `expected 401, got ${res.status}`);
  assert(Date.now() - started < 15000, 'took too long, body may be fully parsed before rejection');
});

await test('no response leaks a stack trace or internal path', async () => {
  for (const route of ROUTES) {
    const res = await post(route, '{ not json');
    const text = await res.text();
    assert(!/ at .*\.(ts|tsx|js):\d+/.test(text), `${route} leaked a stack frame`);
    assert(!text.includes('/Users/'), `${route} leaked a filesystem path`);
    assert(!/ANTHROPIC_API_KEY|RESEND_API_KEY|sk-ant-/.test(text), `${route} leaked a secret name`);
  }
});

console.log(
  failures.length
    ? `\n\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n` + failures.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${passed} live checks passed.\x1b[0m`,
);
process.exit(failures.length ? 1 : 0);
