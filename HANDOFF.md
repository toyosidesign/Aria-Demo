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

All five migrations are applied to the live Supabase project, which every
machine shares, and the `run-automations` Edge Function is deployed with its
secrets set. Nothing to do here on a new machine.

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

Branch `security/harden-api-and-auth`. **`main` has none of this** — worth
merging at some point, since a clone that needs a branch checkout to be useful
is easy to get wrong.

```
npm run security-check     57 checks
npm run check:themes       33 checks
npm run check:recurrence   21 checks
npm run check:flow         38 checks   # the conversational task setup
```

All passing. Run them after any change; they are fast and have caught real
regressions. `npx expo lint` does not run — `eslint` is not installed, and has
not been for a while; `npx tsc --noEmit` is the check that works.

**Working:** auth with RLS, task capture and recurrence, four themes, chat with
persisted history, onboarding that collects personalisation and feeds it to the
model, assignment breakdown, server-side email sending, rate limiting, and
automations that run without the app being open — the scheduler is deployed and
the cron is firing, though nothing in the app has yet created an automation for
it to send. See Next §2.

**Configured:** Anthropic (verified generating), Resend (verified authenticating,
sending from `onboarding@resend.dev` — delivers only to the Resend signup address
until a domain is verified), Supabase (both migrations applied).

---

## Next

### 1. The swipe — two separate bugs, both fixed 2026-08-03

Reported as "swipe doesn't work" across three sessions. It was never one fault,
which is why each fix looked like it half-worked.

**Bug one: most Home cards had no gesture at all.** The Today list sent tasks to
`AriaTodayCard`, which carried no swipe handler. `proactiveAria` defaults to true
and `ariaActionFor` returns an action for nearly everything — only
`method: 'call'`, or `method: 'remind'` with no contact, come back null — so that
branch swallowed almost every real task. Fixed with a `renderCard` prop on
`SwipeableTaskCard`, so the offer renders inside the one existing gesture rather
than a second copy of it.

That also explains the apparent intermittency: a fired reminder and anything
under "Coming up" always were `SwipeableTaskCard` and always swiped, sitting
directly beside offer cards that could not.

**Bug two: the drag never committed.** By design, the swipe only *revealed* a
round button you then had to tap. To anyone who has used Mail that is
indistinguishable from broken — you drag, it springs back, nothing happens. The
drag now performs the action, via `onSwipeableWillOpen`.

`WillOpen`, not `Open`, is the detail that made this work where an earlier
attempt was abandoned as "flashed open and slammed shut": `onSwipeableOpen`
fires from the spring's completion callback, so the row visibly opens before the
action runs. `onSwipeableWillOpen` is dispatched synchronously inside
`animateRow`, which only runs from `handleRelease` — so it fires the moment you
let go, and the row never visibly opens. The threshold went from 0.55 to
`COMMIT_RATIO` 0.75 of the revealed width, because a threshold that merely
revealed a panel can be loose and one that performs an action cannot.

Neither action is destructive: completing is undone by swiping the same card
back, rescheduling opens a screen you can leave.

**Also removed the `tasks`/`demoDate` subscriptions from the card.** They were
only needed at commit time and are now read via `useAriaStore.getState()`. Every
card used to re-render whenever any task anywhere changed, which is exactly what
makes the mid-drag gesture rebuild below likely.

**Everything under here is the earlier investigation**, kept because the traps
are real and the cleared suspect is worth not re-running.

---

#### The earlier theory — the hint nudge

"Drag to complete" on the Home screen was reported broken. The cause found was
the hint nudge: it animates `translateX` on the View *wrapping* the swipeable, so
dragging while it runs pits two transforms against each other and the row springs
back. It now cancels on drag start (`stopHint` in `swipeable-task-card.tsx`).

**Exercised on a physical iPhone via Expo Go, 2026-08-03.** It worked, failed
once, then worked again after a reload without anything changing. That is
consistent with the stale-worklet trap below, and equally consistent with a real
intermittent bug — a pass after a reload is not evidence the code is right, for
exactly the reason the trap exists. Treat this as *probably fine, not proven*.

Hard reload before judging it (shake → Reload, not a refresh) — Reanimated's
gesture worklets go stale across many hot reloads and can fail with entirely
correct code.

If it fails again, the question that decides everything: **any card, or only the
wiggling reminder card?** Only the wiggling one means the fix is incomplete; any
card means a second cause. Also note whether it was the first drag after a hot
reload, which is what would implicate the worklets rather than the code.

**One suspect already cleared, so nobody re-runs it.** `renderLeftActions` and
`renderRightActions` are inline arrows with a fresh identity every render, and
this card subscribes to `tasks`, so it looked like the same class of bug as the
`useCallback` trap below. It is not: in gesture-handler 2.28.0 the render props
feed `leftElement`/`rightElement`, which are rendered output and never reach
`panGesture`. That gesture's `useMemo` depends on `handleRelease` and
`updateAnimatedEvent`, whose own dependency arrays are shared values and numbers
only. Wrapping the render props in `useCallback` would change nothing.

### 2. The scheduler — deployed and running, but unreachable from the app

**Deployed 2026-08-04, and verified end to end.** Migrations 003/004/005 are
applied, the Edge Function is live and gated on a cron secret, and the job has
been firing every 60 seconds returning `200` with counts.

**The remaining gap is not the backend. It is that nothing in the app has ever
successfully called `scheduleAutomation`,** so no automation has reached the
`automations` table and the cron has nothing to send. The only caller is
`app/schedule.tsx`, reached from a secondary row inside the "Aria can help"
card on the task screen and from `app/aria/[taskId].tsx`. A whole afternoon was
spent failing to find that row on a device, which is the finding: if it cannot
be found, it does not exist.

Worth considering whether scheduling belongs at the end of the chat flow
instead. The guided setup already collects the recipient, the message and a
time — everything an automation needs — and then only ever creates a task.

Two things that cost hours and are worth knowing:

  · `setPro` only set local state, so `profiles.pro` stayed false and the
    runner held every automation, failing closed exactly as designed. Fixed.
  · The phone can silently keep running old JavaScript across reloads. Four
    rounds of diagnosis went into code the device was not executing. Confirm a
    reload landed before believing anything about behaviour.

The deploy steps below are done. They are kept for a fresh project.

What was built:

| | |
|---|---|
| `supabase/migrations/003_automations.sql` | the `automations` table, RLS, the indexes the cron queries |
| `supabase/migrations/004_schedule_automations.sql` | the `pg_cron` job, once a minute |
| `supabase/functions/run-automations/index.ts` | the Edge Function that actually sends |
| `src/lib/sync.ts` | automations now sync — write-through, claim, `fetchAll` |
| `src/app/aria/run.tsx` | the device claims a row before running it |

**The prerequisite the previous handoff missed:** automations lived *only* in the
Zustand store. There was no table and `sync.ts` never touched them, so "the
server can see tasks" was true and not sufficient — a cron would have queried an
empty table forever. 003 is that gap.

**The `service_role` decision was taken, deliberately.** A cron has no session,
so `auth.uid()` is null and every policy denies it; there is no way to send on a
student's behalf under RLS. The key now exists, in exactly one place — the Edge
Function's environment — and the reasoning plus the six bounds placed on it are
written up under "The one `service_role` key" in `SECURITY.md`. Nine checks in
`scripts/security-check/offline.ts` assert those bounds, including that no
`EXPO_PUBLIC_` name can ever carry it into the bundle. Read that section before
extending the function; the argument depends on it doing one job with no
caller-supplied input.

**To deploy, in this order** (details in `supabase/functions/README.md`):

1. Apply `003_automations.sql` **and `005_auto_send.sql`** in the SQL editor.
   005 adds `profiles.auto_send` and `profiles.pro`; without it the runner's
   entitlement check reads a missing column, fails closed, and every automation
   is held rather than sent — which looks exactly like the cron not working.
2. `supabase functions deploy run-automations --no-verify-jwt`, then
   `supabase secrets set RESEND_API_KEY=… ARIA_FROM_EMAIL=… ARIA_CRON_SECRET=…`.
   Keep the cron secret — it cannot be read back.
3. Store the project URL and that same secret in Vault, then run
   `004_schedule_automations.sql`. It will not work before step 2.

`--no-verify-jwt` is deliberate, and is not "leave it open": Supabase's own check
accepts any JWT the project signs, and the anon key is one — it ships in the app
bundle. The function authenticates on `x-aria-cron-secret` and 404s everything
else.

**How to tell it is working.** Schedule an email automation a few minutes out,
close the app, and watch for it to arrive. If nothing does, the diagnostic
queries are at the foot of `004_schedule_automations.sql`; a `status_code` of 404
in `net._http_response` means the Vault secret and the function's secret differ,
which is the most likely thing to be wrong.

**Untested against a live project.** The logic is covered offline and the app
compiles, but no email has actually been sent by a cron. Double-send is the
failure worth watching for, and the thing that prevents it — the conditional
`update … where status = 'scheduled'`, made by both the cron and the phone — is
argued through at the foot of `003_automations.sql`.

### 3. Chat sets tasks up itself — done for birthdays and anniversaries

Aria now walks the whole setup in the conversation instead of handing the
student to `/task/new`: who it's for → their contact (saved contacts, or the
phone picker) → date → time → alarm → card → what it says, with Aria drafting
and re-toning it → a preview you accept, then "saved and in your queue".

`lib/task-flow.ts` holds it as a pure state machine — no React, no store — so
`npm run check:flow` can walk every kind end to end. The order of questions is
the product, and it is asserted there rather than rediscovered on a phone.

Only `birthday` and `anniversary` start the guided flow (`isPersonKind`). An
assignment is a title and a due date; marching someone through four panels for
that would be worse than the sentence they were about to type. Other kinds still
get the opening question from `KIND_PROMPT`.

**Not done:** the same flow for event/reminder/general, and picking a card
*template* in chat — `cardTemplateId` is collected but nothing sets it yet, so a
card task falls back to `defaultTemplateFor`.

### 4. The Event flow — intended behaviour, written 2026-08-04

Stated by the product owner, and the thing to build against. Recorded here
because it lived only in a chat message otherwise.

**Three occasions**, each opening with its own question:

| Occasion | Asks |
|---|---|
| General | What's this event? (describe it) |
| Birthday | Whose birthday is it? |
| Anniversary | Whose anniversary is it? |

Then, for all three: **date**, **time**, **should it repeat**, **priority**,
and then *"How should Aria handle it?"* — Text, Email, Call, Picture, Card, or
Just remind me.

What each method needs:

| Method | Name | Email | Phone | Also |
|---|---|---|---|---|
| Text | required | optional | **required** | what the message says |
| Email | required | **required** | optional | what the mail says |
| Call | — | — | the contact only | — |
| Picture | required | optional | optional | the picture |
| Card | required | optional | optional | pick a card, write what it says |
| Just remind me | — | — | — | a plain reminder |

**The rule that matters: choosing someone from the contact list hides the
fields it filled.** No name box, no phone box — just the person, with a way to
clear them. `components/contact-field.tsx` already does this, collapsing to a
summary card once `fromPhone` is set, and asking only for a detail the contact
genuinely lacks.

Two ways a field still appears afterwards, both correct but easily mistaken for
the rule not working:

  · the contact has no phone and the method is Text, so Aria cannot send;
  · the pick silently failed. `pickPhoneContact()` returns null for a cancel
    **and** for a denied permission, and the form is left untouched either way.
    A denied Contacts permission makes the button look dead. Worth telling the
    user which happened.

Reminder, Assignment and Project are to be gone through after Event is right.

### 5. "Explain this to me"

Onboarding collects interests and `lib/learner.ts` turns them into prompt text,
but only `/api/subtasks` consumes it. There is no surface where a student says
"I don't get this" and Aria teaches them through something they already know —
the basketball-explains-projectile-motion idea in the Phase 1 scope. The plumbing
exists; the screen does not.

### 6. Assignment submission

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

**A self-recursing chain of callbacks must be passed its position, not read it.**
`perform → advance → perform` in `app/aria/run.tsx` re-entered one stale closure
and looped forever on the second item of a queue. Only email hit it, so the
scheduler would have started firing it. The reason is written at `perform`.

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
