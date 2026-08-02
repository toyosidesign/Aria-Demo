# Handoff

Where Aria stands, what to do next, and the traps that have already cost time.
Written 2026-08-02. Read this first if you're picking the project up fresh.

---

## Setup on a new machine

```bash
git clone https://github.com/toyosidesign/Aria-Demo.git
cd Aria-Demo
git checkout security/harden-api-and-auth   # the work is NOT on main
npm install                                 # see the npm warnings below
cp .env.example .env.local                  # then fill it in
npx expo start
```

`.env.local` is gitignored and never travels with a clone. Copy the values from
another machine, or regenerate them. Then check them:

```bash
awk -F= '/^[A-Z]/ {print $1, length($2)}' .env.local
```

| Variable | Expected length |
|---|---|
| `ANTHROPIC_API_KEY` | 108 |
| `RESEND_API_KEY` | 36 |
| `ARIA_FROM_EMAIL` | 21 (`onboarding@resend.dev`) |
| `EXPO_PUBLIC_SUPABASE_URL` | 40 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 208 |

The length check is not paranoia. A wrong `ANTHROPIC_API_KEY` cost most of a day
twice: once at 24 characters (the truncated form the Anthropic console shows in
its key *list* — the full key appears only in the dialog at creation) and once at
324 (the same key pasted three times). Both authenticate as far as looking
plausible and then fail, and the app degrades to scripted replies rather than
erroring, so nothing tells you.

Nothing to do for the database — both migrations are already applied to the live
Supabase project, which every machine shares.

---

## Do not run `npm audit fix`

`npm install` reports ~15 vulnerabilities. They are accepted and documented in
`SECURITY.md`: all of them live in build tooling (Expo CLI, bundler, dev server),
none in code that ships to a phone.

`npm audit fix` has already broken this project once — it pulled a second copy of
React Native alongside the pinned `0.81.5` and killed Metro entirely, costing a
full `node_modules` wipe. Expo SDK 54 requires that exact version and `audit fix`
does not respect it.

`npm audit` alone is safe; it only reports.

---

## State

Branch `security/harden-api-and-auth`, HEAD `6216457`, working tree clean.
**`main` is 6 commits behind and has none of this** — worth merging at some point,
since a clone that needs a branch checkout to be useful is easy to get wrong.

```
npm run security-check     45 checks
npm run check:themes       33 checks
npm run check:recurrence   21 checks
```

All passing. Run them after any change; they are fast and have caught real
regressions.

**Working:** auth with RLS, task capture and recurrence, four themes, chat with
persisted history, onboarding that collects personalisation and feeds it to the
model, assignment breakdown, server-side email sending, rate limiting.

**Configured:** Anthropic (verified generating), Resend (verified authenticating,
sending from `onboarding@resend.dev` — delivers only to the Resend signup address
until a domain is verified), Supabase (both migrations applied).

---

## Next

### 1. Verify the swipe fix — 2 minutes, blocks nothing else

"Drag to complete" on the Home screen was reported broken. The cause found was
the hint nudge: it animates `translateX` on the View *wrapping* the swipeable, so
dragging while it runs pits two transforms against each other and the row springs
back. It now cancels on drag start (`stopHint` in `swipeable-task-card.tsx`).

**Untested.** Hard reload first (shake → Reload, not a refresh) — Reanimated's
gesture worklets go stale across many hot reloads and can fail with entirely
correct code.

If it still fails, the question that decides everything: **any card, or only the
wiggling reminder card?** Only the wiggling one means the fix is incomplete; any
card means a second cause.

### 2. The scheduler — the actual Phase 1 gap

Aria cannot act while the app is closed. `runAutomation` is called from exactly
one place — `app/aria/run.tsx`, a *screen* — so a birthday email scheduled for
Friday sits there until the student opens the app. Which is the moment they did
not need an assistant.

There is no cron, queue or background task anywhere in the project.

The shape: a scheduled job (Supabase `pg_cron` → Edge Function, since Supabase is
already there) that queries due automations and sends without a device involved.

**One real decision first.** A cron has no user session, so sending server-side
needs a `service_role` key — which bypasses RLS entirely and which this app
deliberately has nowhere today (`SECURITY.md` documents the absence as a
property, and `scripts/security-check/offline.ts` asserts it). Adding one is the
right call for this feature and there is no alternative, but it is the single
change that alters the security model. Decide it deliberately: the key lives
server-side only, does one narrowly defined job, and must never reach the bundle.

Everything else that blocked this is now cleared — the server can see tasks, and
email sending works.

### 3. "Explain this to me"

Onboarding collects interests and `lib/learner.ts` turns them into prompt text,
but only `/api/subtasks` consumes it. There is no surface where a student says
"I don't get this" and Aria teaches them through something they already know —
the basketball-explains-projectile-motion idea in the Phase 1 scope. The plumbing
exists; the screen does not.

### 4. Assignment submission

In scope, not started, and the riskiest thing in it. Needs LMS integration
(Canvas / Google Classroom). Recommend building it approval-gated first — an
autonomous submission that fires early or submits the wrong draft costs a student
a grade they cannot recover.

---

## Traps

**Persisted state is per-person or per-device, and confusing them has caused the
same bug three times** — theme, demo offer, onboarding, each time a value set by
one account silently inherited by the next. The rule is written at the persist
config in `store/aria-store.ts` under `PERSISTED STATE`. New per-person keys go in
the `previous !== userId` branch of `hydrate`, **not** in `clearLocal` — signing
out is not an account change, and resetting there drops a returning user's theme
and re-runs their onboarding.

**Theme is deliberately not synced.** The `profiles.theme` column is declared
`default 'system'`, so a fresh row is never null and no "is it set?" test can tell
a real preference from a column default. It overwrote the local choice on every
launch. Appearance is device-local now; do not re-enable it without solving that.

**Shape is the affordance.** `rounded-full` means tappable, `rounded-md` means
informational. Documented at the top of `components/ui/badge.tsx`.

**Gesture callbacks must be `useCallback`.** `ReanimatedSwipeable` keys its pan
gesture on `onSwipeableWillOpen` / `WillClose` / `OpenStartDrag` / `CloseStartDrag`
through a chain of memoised callbacks. An inline arrow gives a new identity every
render, which rebuilds the gesture mid-drag and breaks swiping. This has broken
once already.

**Silent degradation is the default failure mode.** Every AI route falls back to
scripted local logic that reads like a real reply. That is good offline behaviour
and it hides a dead key completely. Two defences now exist: the key is verified
against the API at startup (`lib/server-config.ts`), and fallback replies carry a
dev-only marker in chat. `ARIA_STRICT_CONFIG=1` turns missing config into a boot
failure — worth setting in production, though note it checks *presence*, not
validity, and would not have caught either bad key.

---

## Conventions

Comments explain *why*, especially where the obvious approach was tried and
failed — several carry the measurement that ruled it out. They are worth reading
before changing the code they sit on; most exist because something non-obvious
went wrong.

Verify changes rather than assuming: run the three suites, and check the served
bundle compiles (`curl` the Metro endpoint) rather than trusting that an edit
applied. Find-and-replace scripts that print success without checking the match
have silently done nothing here more than once.
