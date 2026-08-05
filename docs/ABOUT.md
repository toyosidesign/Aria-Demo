# About Aria

Written 2026-08-05. A standing description of what this is and what it is built
on, the one page to hand someone who has never seen the repo.

Nothing reads this file: no import, no script, no check. It is safe to edit at
any length. For *what to do next* see [HANDOFF.md](../HANDOFF.md), which is the
working document and is kept current; for how to run it, see
[README.md](../README.md).

---

## What it is

Aria is a demo mobile app: a proactive assistant for students that captures what
is on their plate in conversation rather than in a form. Aria asks one question
at a time, who it is for, when, how it should be handled, reads an uploaded
assignment brief to pull out the deliverable, deadline, weighting and marking
criteria, plans the work backwards from the deadline with a submission buffer
reserved, and then on the day surfaces the task and offers to do it: draft the
message, write the card, break down the essay, or guide a student who is stuck
toward three or four angles with what each one would cost. Nothing is sent
without being asked, and the roadmap splits there, Free means Aria prepares it
and the student taps send; Pro means Aria sends on schedule, against an approval
given earlier at the review.

## What is interesting about it, technically

- **The conversation is a pure state machine.** `src/lib/task-flow.ts` is a
  draft, a step, and a function from one to the next, no React, no store, no
  navigation. The order Aria asks things in *is* the product, so it is asserted
  in `npm run check:flow` rather than rediscovered by tapping through a phone.
- **Everything AI-powered degrades to scripted local logic**, so the whole app
  demos without an API key. That is good offline behaviour and it hides a dead
  key completely, so the key is verified against the API at startup and fallback
  replies carry a dev-only marker, see "Silent degradation" in HANDOFF's Traps.
- **The server can act while the app is closed.** A `pg_cron` job calls a Deno
  Edge Function once a minute, which sends what is due. It holds one
  `service_role` key in one place, with six bounds on it argued through in
  [SECURITY.md](../SECURITY.md) and asserted by nine offline checks.
- **Five bespoke check suites instead of a test framework**, run under Node's
  own type stripping: `security-check`, `check:flow`, `check:plan`,
  `check:themes`, `check:recurrence`. Fast enough to run on every change, and
  each one exists because something real broke.

## Stack

| Layer | What |
|---|---|
| App | Expo SDK 54, Expo Router 6 (file-based routing **and** the server API routes under `src/app/api/*`) |
| Runtime | React Native 0.81.5, React 19, TypeScript 5.9 |
| Styling | NativeWind 4 (Tailwind for RN) over a small design-token system, four themes |
| State | Zustand 5, persisted through AsyncStorage |
| Backend | Supabase, auth, Postgres with RLS, sync; `pg_cron` + a Deno Edge Function for automations |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) behind authenticated, rate-limited, zod-validated routes |
| Email | Resend, server-side only |
| Motion & gesture | Reanimated 4, `react-native-gesture-handler` 2.28 |
| Native | `expo-contacts`, `-document-picker`, `-image-picker`, `-notifications`, `-secure-store`, `-file-system`, `-local-authentication` |
| Utility | `date-fns`, `lucide-react-native`, `zod` |

## The shape of the code

```
src/
  app/          screens (expo-router) + api/*+api.ts server routes
  components/   UI, including the flow panels the chat renders
  lib/          the pure logic: task-flow, plan, brief, guide, dates, cards…
  store/        the Zustand store, sync and persistence
supabase/       migrations and the run-automations Edge Function
scripts/checks/ the check suites
```

The rule worth knowing before editing `src/lib`: several modules are
deliberately importable **without** a React Native runtime, which is what lets
the check suites walk them. Adding an import of `@/lib/api-client` (or anything
that reaches the store) to one of those breaks every suite at once, the network
calls live in `lib/work-client.ts` for exactly that reason.

## Conventions

Comments explain *why*, especially where the obvious approach was tried and
failed; several carry the measurement that ruled it out. They are worth reading
before changing the code they sit on. Verify changes rather than assuming: run
the suites, and check the served bundle compiles rather than trusting that an
edit applied.
