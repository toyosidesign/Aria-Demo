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
its key *list*, the full key appears only in the dialog at creation) and once at
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

`npm audit fix` has already broken this project once, it pulled a second copy of
React Native alongside the pinned `0.81.5` and killed Metro entirely, costing a
full `node_modules` wipe. Expo SDK 54 requires that exact version and `audit fix`
does not respect it.

`npm audit` alone is safe; it only reports.

---

## State

Branch `security/harden-api-and-auth`. **`main` has none of this**, worth
merging at some point, since a clone that needs a branch checkout to be useful
is easy to get wrong.

```
npm run security-check     59 checks
npm run check:themes       33 checks
npm run check:recurrence   21 checks
npm run check:flow         67 checks   # the conversational task setup
npm run check:plan         25 checks   # backwards planning, rollovers, briefs
npm run check:review       42 checks   # the tier line, the Pro day, work ahead, assembly
```

All passing. Run them after any change; they are fast and have caught real
regressions. `npx expo lint` does not run, `eslint` is not installed, and has
not been for a while; `npx tsc --noEmit` is the check that works.

**Working:** auth with RLS, task capture and recurrence, four themes, chat with
persisted history, onboarding that collects personalisation and feeds it to the
model, assignment breakdown, server-side email sending, rate limiting, and
automations that run without the app being open, the scheduler is deployed and
the cron is firing, though nothing in the app has yet created an automation for
it to send. See Next §2.

**Configured:** Anthropic (verified generating), Resend (verified authenticating,
sending from `onboarding@resend.dev`, delivers only to the Resend signup address
until a domain is verified), Supabase (both migrations applied).

---

## Next

### 1. The swipe, two separate bugs, both fixed 2026-08-03

Reported as "swipe doesn't work" across three sessions. It was never one fault,
which is why each fix looked like it half-worked.

**Bug one: most Home cards had no gesture at all.** The Today list sent tasks to
`AriaTodayCard`, which carried no swipe handler. `proactiveAria` defaults to true
and `ariaActionFor` returns an action for nearly everything, only
`method: 'call'`, or `method: 'remind'` with no contact, come back null, so that
branch swallowed almost every real task. Fixed with a `renderCard` prop on
`SwipeableTaskCard`, so the offer renders inside the one existing gesture rather
than a second copy of it.

That also explains the apparent intermittency: a fired reminder and anything
under "Coming up" always were `SwipeableTaskCard` and always swiped, sitting
directly beside offer cards that could not.

**Bug two: the drag never committed.** By design, the swipe only *revealed* a
round button you then had to tap. To anyone who has used Mail that is
indistinguishable from broken, you drag, it springs back, nothing happens. The
drag now performs the action, via `onSwipeableWillOpen`.

`WillOpen`, not `Open`, is the detail that made this work where an earlier
attempt was abandoned as "flashed open and slammed shut": `onSwipeableOpen`
fires from the spring's completion callback, so the row visibly opens before the
action runs. `onSwipeableWillOpen` is dispatched synchronously inside
`animateRow`, which only runs from `handleRelease`, so it fires the moment you
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

#### The earlier theory, the hint nudge

"Drag to complete" on the Home screen was reported broken. The cause found was
the hint nudge: it animates `translateX` on the View *wrapping* the swipeable, so
dragging while it runs pits two transforms against each other and the row springs
back. It now cancels on drag start (`stopHint` in `swipeable-task-card.tsx`).

**Exercised on a physical iPhone via Expo Go, 2026-08-03.** It worked, failed
once, then worked again after a reload without anything changing. That is
consistent with the stale-worklet trap below, and equally consistent with a real
intermittent bug, a pass after a reload is not evidence the code is right, for
exactly the reason the trap exists. Treat this as *probably fine, not proven*.

Hard reload before judging it (shake → Reload, not a refresh), Reanimated's
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

### 2. The scheduler, deployed and running, but unreachable from the app

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
time, everything an automation needs, and then only ever creates a task.

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
| `src/lib/sync.ts` | automations now sync, write-through, claim, `fetchAll` |
| `src/app/aria/run.tsx` | the device claims a row before running it |

**The prerequisite the previous handoff missed:** automations lived *only* in the
Zustand store. There was no table and `sync.ts` never touched them, so "the
server can see tasks" was true and not sufficient, a cron would have queried an
empty table forever. 003 is that gap.

**The `service_role` decision was taken, deliberately.** A cron has no session,
so `auth.uid()` is null and every policy denies it; there is no way to send on a
student's behalf under RLS. The key now exists, in exactly one place, the Edge
Function's environment, and the reasoning plus the six bounds placed on it are
written up under "The one `service_role` key" in `SECURITY.md`. Nine checks in
`scripts/security-check/offline.ts` assert those bounds, including that no
`EXPO_PUBLIC_` name can ever carry it into the bundle. Read that section before
extending the function; the argument depends on it doing one job with no
caller-supplied input.

**To deploy, in this order** (details in `supabase/functions/README.md`):

1. Apply `003_automations.sql` **and `005_auto_send.sql`** in the SQL editor.
   005 adds `profiles.auto_send` and `profiles.pro`; without it the runner's
   entitlement check reads a missing column, fails closed, and every automation
   is held rather than sent, which looks exactly like the cron not working.
2. `supabase functions deploy run-automations --no-verify-jwt`, then
   `supabase secrets set RESEND_API_KEY=… ARIA_FROM_EMAIL=… ARIA_CRON_SECRET=…`.
   Keep the cron secret, it cannot be read back.
3. Store the project URL and that same secret in Vault, then run
   `004_schedule_automations.sql`. It will not work before step 2.

`--no-verify-jwt` is deliberate, and is not "leave it open": Supabase's own check
accepts any JWT the project signs, and the anon key is one, it ships in the app
bundle. The function authenticates on `x-aria-cron-secret` and 404s everything
else.

**How to tell it is working.** Schedule an email automation a few minutes out,
close the app, and watch for it to arrive. If nothing does, the diagnostic
queries are at the foot of `004_schedule_automations.sql`; a `status_code` of 404
in `net._http_response` means the Vault secret and the function's secret differ,
which is the most likely thing to be wrong.

**Untested against a live project.** The logic is covered offline and the app
compiles, but no email has actually been sent by a cron. Double-send is the
failure worth watching for, and the thing that prevents it, the conditional
`update … where status = 'scheduled'`, made by both the cron and the phone, is
argued through at the foot of `003_automations.sql`.

### 3. Chat sets tasks up itself

Aria walks the whole setup in the conversation instead of handing the student to
`/task/new`: what it is, or who it's for → when → how Aria should handle it →
whatever that needs, with Aria drafting and re-toning the words → a preview you
accept, then "saved and in your queue". Picking the card *template* happens in
chat too, drawn as cards rather than named in a list.

`lib/task-flow.ts` holds it as a pure state machine, no React, no store, so
`npm run check:flow` can walk every kind end to end. The order of questions is
the product, and it is asserted there rather than rediscovered on a phone.

**Every kind is walked now**, not just the two about people; the steps differ by
kind and `nextStep` is the single place that knows which. An occasion follows
§4; an assignment or a project follows §7. "Task" (`general`) is what is left
with no brief and no marker, and it keeps the approach-then-breakdown pair.

### 4. The Event flow, built 2026-08-04

Stated by the product owner, and now the shape of the conversation. The spec is
kept below as written; what follows immediately is what was built from it.

**Where it lives.** `lib/task-flow.ts` holds the order as a pure state machine,
so `npm run check:flow` walks all three occasions and all six methods end to end
,  12 of its checks are this section, including the requirements table verbatim.
`components/task-flow-panel.tsx` renders each step, and the contact step is now
the same `ContactField` the create form uses, which is what makes the hide-the-
fields rule one implementation rather than two.

Four things worth knowing before changing it:

  · **The recipient is asked for after the method, not before.** Which of their
    details matter depends on whether this is a text, an email or a call, and
    asking first meant collecting a number for something that turned out to be
    an email.
  · **The alarm question is gone from Event, deliberately.** The spec lists five
    scheduling questions and an alarm is not among them; "does it repeat" is the
    one people actually answer for a birthday. Reminder, Assignment and Project
    keep theirs, a check asserts both halves. Say so if that was not the intent
    and it is a two-line change.
  · **`delivery` is now `handling`**, holding the six real methods rather than
    card / message / neither. The old three-way made Aria guess the channel from
    whichever detail the contact happened to carry, so a text to someone whose
    card only held an address silently became an email.
  · **Changing the method at the preview re-asks what hung off it** (`reopen` in
    `lib/task-flow.ts`). Without that, a text changed to an email kept `contact`
    answered, skipped the address, and saved as a plain reminder.

The picker now tells a cancel apart from a refused permission
(`pickPhoneContactResult`), and asks for `READ_CONTACTS` on Android, which it
never did, `presentContactPickerAsync` needs it there, so on Android the button
had never worked at all.

**Not done:** the same treatment for Reminder, Assignment and Project, which is
the next thing. And the `explain` step still renders no control in the panel , 
pre-existing, on the assignment path, not touched here.

The spec as stated, which the checks assert:

**Three occasions**, each opening with its own question:

| Occasion | Asks |
|---|---|
| General | What's this event? (describe it) |
| Birthday | Whose birthday is it? |
| Anniversary | Whose anniversary is it? |

Then, for all three: **date**, **time**, **should it repeat**, **priority**,
and then *"How should Aria handle it?"*, Text, Email, Call, Picture, Card, or
Just remind me.

What each method needs:

| Method | Name | Email | Phone | Also |
|---|---|---|---|---|
| Text | required | optional | **required** | what the message says |
| Email | required | **required** | optional | what the mail says |
| Call |, |, | the contact only |, |
| Picture | required | optional | optional | the picture |
| Card | required | optional | optional | pick a card, write what it says |
| Just remind me |, |, |, | a plain reminder |

**The rule that matters: choosing someone from the contact list hides the
fields it filled.** No name box, no phone box, just the person, with a way to
clear them. `components/contact-field.tsx` already does this, collapsing to a
summary card once `fromPhone` is set, and asking only for a detail the contact
genuinely lacks.

Two ways a field still appears afterwards, both correct but easily mistaken for
the rule not working:

  · the contact has no phone and the method is Text, so Aria cannot send;
  · the pick silently failed. `pickPhoneContact()` returned null for a cancel
    **and** for a denied permission, and the form was left untouched either way.
    Fixed: `pickPhoneContactResult()` reports which, and `ContactField` prints
    the reason under the button. A cancel still says nothing, you closed it.

Reminder is still to be gone through. Assignment and Project are §7.

### 7. Assignment and Project, built 2026-08-05

Two flows, one shape: establish what the work actually is, plan it, accept.
What differs is where the truth comes from, an assignment has a brief somebody
else wrote, and a project has nobody's, so the equivalent step is stating what
done looks like.

```
assignment  brief → extraction → commitments → [date] → plan preview
project     brief → definition → reflect → scope → milestones → plan preview
```

`[date]` is asked only when the brief gave no resolvable deadline. Both end at
the plan preview, which is where Accept lives, the plan *is* the confirmation,
so there is no second preview screen.

**Upload is the primary button, and it required a dependency.**
`expo-document-picker` (~14.0.8) was added, nothing else could open a PDF.
`lib/documents.ts` reads the file to base64 on the device and posts it to
`/api/brief`, which hands it to the model as a document or image block. Nothing
is stored server-side; the bytes exist for one request.

**That route is the only one allowed a body over 256KB.** `MAX_UPLOAD_BYTES`
(12MB) is passed explicitly by `/api/brief` and by nothing else, and two checks
in `scripts/security-check/offline.ts` assert exactly that. Read the note at the
constant before using it anywhere else, it is a real loosening of the
allocation bound every other route keeps.

**Confidence travels with every extracted fact**, and a *missing* fact is not a
low-confidence one: it is a gap, and gaps render as `Ask tutor · Upload handbook
· I know this`. "Ask tutor" writes the question and opens Mail; "Upload
handbook" re-extracts with what is already known so a second document fills gaps
without overwriting them; "I know this" makes the next thing typed answer that
one field, at high confidence, because the student is the source.

**The plan is built backwards** (`lib/plan.ts`). The submission buffer is
reserved before any step is placed and is drawn as its own row; days are shared
out by the marking criteria, so the same steps against a different rubric give a
different plan; days already spoken for are stepped over. `check:plan` covers the
cases nobody wants to reproduce on a phone, deadline tomorrow, deadline already
gone, more steps than days, every day busy.

**The Guide is one door in four places**, plan preview, definition gate,
milestones/scope, and a pinned step on the task screen, plus an automatic offer
once a step has rolled over twice. Always one narrowing question before
generating; always directions with what each needs and costs; never prose for an
assignment (the argument is the thing being marked) and a straight recommendation
for a project (`student` decides, sent by the app). With only a title it says so
and asks for the one thing that would help, rather than producing four
directions that fit any essay ever written.

**Rollover rules exist and are tested** (`rolloverVerdict`): two offers the
Guide, three asks one question then drops the step. **Nothing increments the
counter yet**, that belongs to the follow-up loop below.

**Not built, the whole post-creation lifecycle.** Check-ins on a cadence,
reworking a plan that has fallen behind, assembling the document ~24h out, the
review card, the ten-minute hold, the receipt, and ending at a Turnitin/Canvas
submission link. All of it needs the automations subsystem to be reachable from
the app (§2 is the same blocker) and the LMS work in §6. The pieces that were
buildable without it, the rules, the step metadata (`due`, `forcing`,
`rollovers` on every subtask), the pinned step, progress on the task row, are
in, so that work is wiring rather than design.

**Also:** `explain` is gone as a flow step. It rendered no control in the panel,
so an assignment stalled on it; the Guide is the surface for being stuck now.
The category tiles carry one line each (`CATEGORY_BLURB`) because "Assignment"
and "Project" are indistinguishable without it, and the task row shows a
progress bar and the next step for work, because a title and a date is exactly
what a finished assignment looks like too.

### 8. Onboarding, rebuilt 2026-08-05

Five screens: intro → **which fits you** → the follow-up that fits → **who
sends it** → **the essentials**, then the payoff.

**"What are you studying?" is gone**, and it was the wrong first question:
someone employed, or running their own thing, had to lie or skip, and every
prompt afterwards opened "You are helping a student", because that was the only
shape the profile had. `profile.role` is `student | employed | independent`, and
`describeLearner` now writes a different sentence for each: a colleague who
knows their field, someone whose time is the scarce resource, or a student at a
year. The follow-up screen branches on it, year and subject, area, or what you
run.

The subject question survives inside the student branch. Losing it would have
made assignment breakdowns generic again, which is the one thing that most
distinguishes this app for a student.

**The Guide's integrity rule now follows the person, not the screen.** It
withholds prose because someone is being marked; a freelancer working through an
assignment-shaped brief is not, and now gets a straight answer.

**"How should I explain things?" and "What are you into?" are both gone.**
`explainStyle` and `interests` stay on the profile and in `describeLearner` , 
accounts that answered them still carry the values, and throwing away a stated
preference to tidy a type is a bad trade, but nothing collects them any more.

One catch worth knowing: onboarding now writes `interests: []` explicitly. The
seeded demo persona lists basketball and music, and a question that is no longer
asked cannot clear them by being answered, so a new account would otherwise
carry someone else's hobbies into every prompt. Not asked has to mean not known.

**The essentials screen is last**, and its switches write to the store as they
are tapped rather than being saved at the end: they are the real settings, so a
copy that had to be committed later is a copy that can disagree with what the
switch was showing. Notifications asks the OS at the moment it is switched on , 
a toggle reading "on" while iOS has never been asked is a promise the app cannot
keep.

It carries five things: let Aria offer to help, notifications, appearance
(including the theme swatches), the demo tour, and, for anyone who chose Pro , 
send at the scheduled time. Appearance is there because it is the first setting
anyone looks for and the only one whose effect is visible the instant it is
tapped. The demo tour is there because everything worth seeing happens on the
day a task is due, and a new account has no such day.

**The samples are opt-in, and off to begin with.** The store used to seed tasks
and contacts in its initial state, so a new account opened onto a planner it had
never been told about, the onboarding switch described something that had already
happened, and the empty-state card on Today (which renders only when there are no
tasks) could never appear. Both of those are now the two ways in, and both go
through `setSampleData` / `resetDemo`.

**How the samples are identified.** Not by a `seed-` id: `tasks.id` is a `uuid`
column, so a readable id cannot sync, and a fixed uuid per sample would collide
the moment a second account inserted the same row. Each copy gets a fresh uuid
and the ids are recorded in `sampleIds`, which is what makes removing them safe:
anything created afterwards is not in the list and is never touched. A switch on
a setup screen must not be able to delete somebody's own work.

**Presence is asked of the rows, never of that list** (`sampleDataPresent`).
The list outlives the rows: "Start fresh" deletes every task and contact, and
anything else that empties the planner without going through the switch leaves
the same record behind. Trusting it alone made the switch show as on over an
empty planner and then refuse to add the samples back, because it believed they
were already there. `clearAllData` clears the list too, and the guard checks the
rows regardless, so neither half depends on the other being right.

**It has to be a day you are not on.** Three of the seeded tasks fall on the
current day, so the first version, "today or later", resolved to today: the
switch set the date it was already on, `simulating` stayed false, and the control
flicked straight back off. The rule now lives in `nextTourDate` (`lib/demo.ts`)
with three checks in `check:plan`, because a toggle that visibly undoes itself
reads as broken rather than as "already there".

**The biometric lock is gone from the app entirely**, the setting, the lock
screen, `lib/biometrics.ts`, the `expo-local-authentication` dependency and the
`NSFaceIDUsageDescription` string. `profiles.biometric_lock` still exists on the
live database and is now written as a pinned `false`: dropping a column is a
migration against a live project for no benefit, and leaving it carrying
whatever the last build wrote would make it look like a live setting.

**Free/Pro sits second-to-last, and that ordering is load-bearing.** The last
switch on the essentials screen is "send at the scheduled time", which exists
only on Pro; asked the other way round that screen would either hide the switch
or show a control whose availability was undecided. It is also the earliest
point where the question means anything.

### 8a. What Pro is, rebuilt 2026-08-05

**Free plans your work. Pro does it.** The line is drawn around *work* rather
than around *sending*, and that is the whole point: sending cannot be delivered
for most channels, because no mobile OS lets an app send a text or a WhatsApp as
the user. Work has no such limit, takes real time, and costs real money in model
tokens, so it is something that can honestly be charged for.

`lib/entitlements.ts` is the single source: capabilities (`workAhead`,
`planUpkeep`, `dailyReview`, `autonomousEmail`, `assemble`) and the copy for
both tiers, together, so a pitch cannot drift from what the app gates. Every
screen that sells Pro now reads from it, including onboarding. Nothing is listed
there that is not actually enforced.

**Work ahead** (`lib/work-ahead.ts` decides, `lib/work-runner.ts` does it).
Drafts and breakdowns for anything due within three days that is missing them,
capped at four per pass because each one is a model call somebody pays for, and
it never overwrites words that already exist.

**Plan upkeep** (`catchUp` in `lib/plan.ts`). Steps left in the past are spread
across the days that are actually left, in order, with the submission buffer
still reserved. Finished steps are never re-dated. Only steps that were
genuinely late get their rollover counter bumped, because that counter is what
triggers the Guide offer and the drop question.

**Where the work runs, and what the copy may therefore claim.** On the device,
when the app becomes active. Pro says the work is done *before you get there*,
which is true; it does not say *while you sleep*, which would not be. Moving it
server-side is a queue table and an Edge Function with a sibling already in
`run-automations`, and nothing in the rules would change: they are pure, and the
writes go through the same store actions.

**Assemble is built** (`lib/assemble.ts`, `app/assembled/[taskId].tsx`). A day
before the deadline the work runner compiles everything the task produced into
one document: cover sheet, author, weighting, criteria, format rules, then the
written sections in the order they were written, named `Author - Title.txt`.

**Nothing in it is written by a model.** Assembly is arrangement, not
authorship, which is why it costs nothing, runs for every piece of work, and can
be defended: a student can say when each paragraph was written. It never invents
a section to fill a gap and never claims a word count it has not got. What is
missing is reported instead: the gap to the target in words, the steps still
open, and format rules the brief never gave.

**The brief is parsed back out of the task** (`factsFromSections`). There is no
column for it, so setup writes the same readable summary the card showed, and
assembly reads it back. Anything it does not recognise comes back undefined and
the cover sheet omits it, so the failure mode is a missing weighting rather than
an invented deadline.

**Not built:** submission to an LMS. The document ends at the share sheet, which
is the honest end today. A submission that fires early or sends the wrong draft
costs a grade nobody can recover, so it wants building approval-gated first.
Volume limits on Free are still deliberately absent rather than faked.

### 8b. The Pro day, built 2026-08-05

**This is what the two tiers actually differ on.** Free is a planner that
reminds you: every task hands you its own buttons and you press them. Pro is an
assistant: once a day it asks, you approve, and it works while you are somewhere
else.

The prompt (`lib/daily-brief.ts`) is a repeating daily notification at an hour
they pick, booked with `SchedulableTriggerInputTypes.DAILY` so it survives the
app never being opened, which is the whole point: the person Pro is for is the
one who did not open the planner. It is cancelled the moment Pro lapses,
notifications go off, or the switch is turned off, and `syncDailyReview` is the
only thing that decides.

Tapping it opens `app/review.tsx`, which is three lists and the wording between
them **is** the feature:

| List | What approval means |
|---|---|
| I'll send these | Aria completes it, nobody watching. Email only. |
| Ready for your tap | Written and addressed at the right moment; you still tap. |
| Yours today | Aria cannot do it. Listed so the day is the whole day. |

**Only email is ever in the first list**, and that is a platform limit rather
than a product choice: no mobile OS lets an app send a text or a WhatsApp as
you. Counting those as sent would be a lie discovered by the person who never
got the message, so `lib/daily-review.ts` keeps the boundary and `check:review`
holds it in 16 checks.

**Approving schedules; it never sends.** Every item gets `HOLD_MINUTES` (10)
before it runs, which is the promise onboarding makes in as many words, and a
task whose time has already gone is pushed to the end of the hold rather than
skipped, so approving at 8am still covers the 7am ones.

**This is also the caller §2 was missing.** Approval calls `scheduleAutomation`,
so rows finally reach the `automations` table and the cron has something to
send. The gap in §2 is closed by this screen, not by a new backend.

Blocked items (no recipient, nothing written) are shown with the one missing
thing rather than dropped, because dropping them silently is what turns "I
approved my day" into an afternoon discovering nothing went.

### 8c. Pro is open, 2026-08-05

Aria Pro is available, and choosing it turns it on. `lib/pro.ts` was built
entirely around a waiting list; it now has `turnOnPro`, and every gate, the
schedule screen, connections, Settings, offers the upgrade instead of a queue.
The dev-only "Turn Pro on (testing)" row in Settings is gone with it: it existed
because Pro could not be obtained, which is no longer true.

**Pro and autonomous sending are still two different decisions, deliberately.**
`setPro` writes `profiles.pro`, which is the entitlement the Edge Function reads
before sending on somebody's behalf. Whether it sends *without asking* is
`settings.autoSend`, and `autoSendEnabled` requires both. Anything reading only
the tier would mail somebody the moment an account upgraded, so the onboarding
copy, the Pro sheet and the schedule screen all say the same thing out loud:
Aria still asks until you say otherwise.

There is no payment step in this build. When billing arrives it belongs inside
`turnOnPro`, before `setPro`, everything downstream already treats that one
call as the moment entitlement begins.

`proWaitlisted` is still on the store and no screen reads it now. Left in place
rather than removed: it is in the per-person reset list, and dropping a
persisted key is a migration rather than a deletion.

### 8d. What Free and Pro actually say

A sixth question: *when something's ready to go, who sends it?* Free means Aria
prepares it and you tap send; Pro means Aria sends on the schedule using the
approval given at the review. It is asked during onboarding rather than
discovered at the moment something needs to go out, and the closing "here's what
I'll do" screen now says whichever of the two promises is true, the old line
("nothing gets sent without your OK") is false on Pro.

Choosing Pro records a waitlist entry. It deliberately does **not** call
`setPro`: that writes `profiles.pro`, which is what the cron reads before
sending on someone's behalf, and an onboarding tap is not an entitlement.

### 5. "Explain this to me"

Onboarding collects interests and `lib/learner.ts` turns them into prompt text.
`/api/subtasks`, `/api/guide` and the research path all read it now, so a
student's plan and their directions are shaped by what they are into, but there
is still no surface where someone says "I don't get this" and Aria teaches them
through something they already know, the basketball-explains-projectile-motion
idea in the Phase 1 scope. The Guide answers *where do I start*, which is a
different question from *what is this*.

`requestDraft({ explain: true })` still exists and now has no caller, it is the
back half of that screen, waiting for a front.

### 6. Assignment submission

In scope, not started, and the riskiest thing in it. Needs LMS integration
(Canvas / Google Classroom). Recommend building it approval-gated first, an
autonomous submission that fires early or submits the wrong draft costs a student
a grade they cannot recover.

---

## Traps

**A notification has to say what it is about.** Task alarms carried no data, so
tapping one could only launch the app and the app went wherever startup decided:
"Get started" from cold, or whichever tab was last open. The vocabulary now
lives in `lib/notification-routes.ts` (pure, so `check:review` holds the
mapping) and the native half in `lib/launch-route.ts`. Two moments need
handling and they are easy to get out of step: a tap while the app runs, and a
tap that *launches* it. The second is delivered only through
`getLastNotificationResponseAsync`, is consumed once so a relaunch does not
replay it, and waits for the auth gate to finish or the gate's redirect
overwrites it.

**Persisted state is per-person or per-device, and confusing them has caused the
same bug three times**, theme, demo offer, onboarding, each time a value set by
one account silently inherited by the next. The rule is written at the persist
config in `store/aria-store.ts` under `PERSISTED STATE`. New per-person keys go in
the `previous !== userId` branch of `hydrate`, **not** in `clearLocal`, signing
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
failure, worth setting in production, though note it checks *presence*, not
validity, and would not have caught either bad key.

---

## Conventions

**No em dashes.** Not in the app's copy, not in comments, not in these
documents, and the three model prompts say so too. Swept out in one pass on
2026-08-05; a comma, a colon or a full stop does the same work.

Comments explain *why*, especially where the obvious approach was tried and
failed, several carry the measurement that ruled it out. They are worth reading
before changing the code they sit on; most exist because something non-obvious
went wrong.

Verify changes rather than assuming: run the three suites, and check the served
bundle compiles (`curl` the Metro endpoint) rather than trusting that an edit
applied. Find-and-replace scripts that print success without checking the match
have silently done nothing here more than once.
