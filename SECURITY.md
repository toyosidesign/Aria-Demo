# Security notes

## Controls to not accidentally remove

- **RLS is the only thing authorizing database access from the app.** There is no
  server-side DB layer, the app talks to Supabase with the anon key and every
  table's policy does the work. If you add a table, it needs `enable row level
  security` plus a policy with **both** `using` and `with check`. Without
  `with check`, a client can insert rows owned by someone else. See
  `supabase/schema.sql`.
- **Exactly one thing bypasses RLS, and it is not in the app.** See below.
- **API routes are declared with `protectedRoute`** (`src/lib/api-auth.ts`), not
  as bare `export async function POST`. Expo Router has no middleware, so that
  wrapper is the only thing making auth default-deny. A route that exports POST
  directly is unauthenticated and will not be caught by anything but review.
- **`requireUser` must keep failing closed.** Its `catch` returns `null`, so a
  network failure reaching Supabase denies rather than allows.
- **Sessions are never persisted on web** (`src/lib/supabase.ts`). The only
  browser store available is localStorage, which is readable by any script on
  the origin, and a refresh token there is a lasting account takeover.

## The one `service_role` key, and why it exists

Until the scheduler, this project had no RLS-bypassing key anywhere, and that
absence was a property worth having. Adding one was a deliberate change to the
security model. This section is the reasoning; do not undo it by accident, and
do not widen it casually.

**Why there was no alternative.** Aria could not act while the app was closed.
`runAutomation` was called from exactly one place, a *screen*, so an email
scheduled for Friday sat on the device until the student opened the app, which
is the moment they did not need an assistant. Sending it without a device means
a scheduled job; a scheduled job has no user session; with no session
`auth.uid()` is null and every policy in the schema denies it. There is no way
to send on a student's behalf from a cron under RLS. The key is the feature.

**Where it lives.** `supabase/functions/run-automations/index.ts`, read from the
Edge Function's own environment (`SUPABASE_SERVICE_ROLE_KEY`, injected by the
platform). It is never written to a file, never in `.env.local`, never in the
repo, and never sent to a client. Expo compiles `EXPO_PUBLIC_*` into the app
bundle, so that prefix is the one mistake that would turn "a key on a server"
into "RLS is off for everyone", the suite fails if a service_role key ever
appears under `src/`, or under an `EXPO_PUBLIC_` name in any env file.

**What bounds it.**

- One job. The function sends email automations that are due and does nothing
  else. It has no other entry point and takes no input, the request body is
  ignored entirely, so there is no parameter for a caller to steer it with.
- It is not reachable by app users. Supabase's `verify_jwt` would accept the
  anon key, which ships inside the bundle, so "has a valid JWT" is a property
  every user of the app already has. It is deployed `--no-verify-jwt` and
  authenticates on `x-aria-cron-secret`, which only the cron holds; everything
  else gets a 404. It is POST-only, so no method a browser issues on its own
  can reach it even with the secret.
- Email only. `channel=eq.email` is in the queue query, not a check in the loop.
  No mobile OS lets an app send a text or a WhatsApp message as the user, so
  those channels have no server-side equivalent to fall back to.
- It cannot double-send. Both the cron and an open phone claim a row with the
  same conditional update (`status = 'sending' where status = 'scheduled'`)
  before sending, and send only if a row comes back. The update is the lock.
  Reasoned through in full at the foot of `supabase/migrations/003_automations.sql`.
  A phone that cannot reach Supabase to make that claim does not send, the mail
  route is a different host, so an unreachable database is not evidence that the
  send would have failed.
- A run that dies mid-send marks the row failed, never sent, and never retries
  it. A duplicate birthday email is a worse outcome than a late one, and
  claiming to have sent something it cannot confirm is worse than both.
- It reports counts. No address, subject or body reaches a log or the response , 
  the response is written into a `pg_net` table, which is not a place for who a
  student is emailing.

**If you extend it,** the thing to preserve is that the key does one narrowly
defined job with no caller-supplied input. A second endpoint on the same
function, or a body parameter that selects rows, gives up most of the argument
above. `scripts/security-check/offline.ts` asserts each bound listed here.

## Accepted residual risk: two npm advisories

`npm audit` reports 31 entries. That is 2 real advisories, counted once per
package in each dependency chain. Both are build-time only, neither is
reachable from the shipped app, and **both were investigated and deliberately
not forced** because the only available fix breaks the build:

### `brace-expansion`, DoS via unbounded expansion (HIGH, GHSA range `<=5.0.7`)

Reached via `minimatch@3` (under `glob@7`, `test-exclude`) and `@expo/cli`'s
bundled `minimatch`. Not fixable:

- `1.1.17` and `2.1.3` are the **latest** releases in their major lines, so
  there is no same-major patch to move to. Only `5.0.8` carries the fix.
- `brace-expansion@5` exports a named `expand` and no callable default:
  ```
  require('brace-expansion')  →  { EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }
  ```
  `minimatch@3` calls `require('brace-expansion')(pattern)` and `@expo/cli`'s
  copy calls `.default(pattern)`. Both throw `TypeError` against v5, breaking
  globbing across Metro and the Expo CLI.
- The consumers that *can* take v5 (`minimatch@10`, which calls `.expand()`)
  already resolve `5.0.8`. Everything still flagged is precisely what cannot.

Exposure: expanding a hostile glob pattern. Patterns here come from Expo config
and the local file tree, never from user input, and never at runtime.

### `uuid`, missing buffer bounds check in v3/v5/v6 (MODERATE, `<11.1.1`)

Reached only via `expo` → `@expo/config-plugins` → `xcode@3.0.1`. Not worth
forcing:

- The advisory requires calling `v3`, `v5` or `v6` **with a `buf` argument**.
  `xcode` calls `uuid.v4()` and nothing else (`node_modules/xcode/lib/pbxProject.js:90`),
  so the vulnerable code path is never entered.
- `uuid@7 → 11` is four majors and would likely break `pbxproj` generation
  during `expo prebuild`.

**Re-check both when upgrading the Expo SDK**, the fix belongs upstream. What
was fixed rather than accepted: three `postcss` advisories (two HIGH path
traversals plus an XSS), pinned forward via the `overrides` block in
`package.json`.

## Not verifiable from code, check these in the Supabase dashboard

- **OTP expiry** kept short for the password reset flow.

### Email confirmation, deliberately OFF

Signup does not require a confirmed address. That is a product decision, and it
has one security consequence worth stating plainly: **creating an account costs
nothing**, so the per-user ceilings in `lib/rate-limit.ts` scale with however
many addresses someone is willing to cycle through. What actually bounds abuse
of the Anthropic key and the Resend domain is the **process-wide ceiling**
(`ARIA_AI_GLOBAL_HOURLY`, `ARIA_MAIL_GLOBAL_HOURLY`), not the per-user one. Size
those with that in mind, and watch for `auth.users` growth that outpaces real
users.

The code gate is opt-in rather than deleted, so it is one line to get back:

1. Supabase → Authentication → Sign In / Providers → Email → **Confirm email** on.
2. Set `ARIA_REQUIRE_CONFIRMED_EMAIL=1`.

Both, or neither. Turning on the dashboard setting without the env var leaves
free accounts spending; setting the env var without the dashboard setting is
inert at best. The gate is env-driven rather than always-on for a reason: it
tests `email_confirmed_at`, a field this app does not control, so an always-on
check would 401 every real user if a future GoTrue stopped stamping it under
autoconfirm, and the failure would look like Aria quietly serving scripted text.

Check the dashboard setting without opening it:
```bash
curl -s "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/settings" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" | grep -o '"mailer_autoconfirm":[a-z]*'
# true  = confirmation OFF (current, intended)
# false = confirmation ON  → also set ARIA_REQUIRE_CONFIRMED_EMAIL=1
```

### CAPTCHA, deliberately OFF, do not enable without client work

Enabling Bot and Abuse Protection **breaks sign-in, sign-up and password reset
immediately**. Supabase enforces it inside GoTrue, so once it is on every auth
call must carry a `captchaToken` that this app has no way to produce:

```ts
supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
```

It is also a poor fit here. hCaptcha and Turnstile are web widgets, so a React
Native integration means adding a WebView, and this app deliberately has none,
which is why there is no HTML parser anywhere in the render path and no
embedded browser context to attack. That is worth more than the increment
CAPTCHA would add, because the threat it targets is already priced in three
ways: email confirmation makes each account cost a mailbox, Supabase's built-in
per-IP auth rate limits throttle attempts, and the global ceiling in
`lib/rate-limit.ts` bounds aggregate spend even if accounts are minted.

Revisit only on evidence of real abuse (unexplained `auth.users` growth, or
Anthropic/Resend usage outpacing real users), or if a genuine browser sign-in
surface is added, there a captcha is native rather than a WebView bolt-on. For
native apps the stronger equivalent is App Attest / Play Integrity, which prove
the request came from your unmodified app rather than that a human clicked a box;
Supabase Auth does not consume either today.

## Known limitations and deliberate trade-offs

**Rate limiting is in-process.** Ceilings in `src/lib/rate-limit.ts` are per
instance and reset on deploy. This is the one checklist item left deliberately
open, because the obvious fix makes it worse: the current code is synchronous,
which means `peek` and `record` cannot interleave and the ceiling is exact.
Awaiting a Redis call between them lets N concurrent requests all observe
"under the limit" and all record a hit, overshooting by up to N, exactly under
the load an attacker generates. If you move it, make it atomic (one Lua `EVAL`
round trip that tests and increments together) and fail back onto the in-process
store when Redis is unreachable. There is a worked sketch in the file header.

**Deployment invariant for the web output.** `expo export -p web` produces
`client/` and `server/`. Serve `client/` statically and run `server/` as
functions, never serve `server/` as static assets. The client bundle is clean
(verified: zero source maps, zero secrets, no server-only env names), but
`server/_expo/functions/api/*.js.map` contains the full API route source.

**The global ceiling trades cost risk for availability risk.** A shared budget
means one caller's spending can refuse another's request. That is the right way
round, a bill cannot be undone, an hour of 429s can, but it is a real
consequence. The per-user ceiling is ~6% of the global one, so no single account
can starve the rest; it takes ~17 confirmed accounts. Tune with
`ARIA_AI_GLOBAL_HOURLY` / `ARIA_MAIL_GLOBAL_HOURLY` as traffic grows: a ceiling
tight enough to turn a busy afternoon into an outage will just get deleted.

**Web sign-in does not survive a page refresh.** Sessions are held in memory on
web (see above), so a browser user re-authenticates each load. Acceptable while
web exists to host the API routes. If browser sign-in becomes a real feature,
move to server-set httpOnly cookies via `@supabase/ssr` rather than restoring a
client-side store.

**Body size cap vs. character caps.** `MAX_BODY_BYTES` (256KB) must stay above
the largest body the zod schemas permit *in bytes*, which is not what the
character caps suggest: `.max()` counts UTF-16 units, the wire carries UTF-8, and
one CJK character is 1 unit but 3 bytes. `AssistantSchema`'s maximum is ~128KB
for a chat in Japanese. A 64KB cap looks generous and silently breaks those
users. `scripts/security-check/offline.ts` asserts the invariant, if you raise a
field cap, that test tells you.

## Running the checks

```bash
npm run security-check        # 40 offline assertions, no network
npm run security-check:live   # 11 checks against a running dev server
```

The live suite needs `npx expo start --port 8099` first. It exists mainly to
prove Expo Router honours `export const POST = protectedRoute(...)`, if it only
recognised `export async function POST`, all four routes would 404 and the app
would be broken rather than protected.
