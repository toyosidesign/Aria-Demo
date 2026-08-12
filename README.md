# Aria, a proactive assistant for students

Aria watches a student's calendar and deadlines, plans ahead, and **offers to do the work, always asking first, and always taking "no" for an answer.** Tell it what's on your plate (by typing or voice); on the day, Aria surfaces the task and offers to help: draft and send a birthday message, work through an essay part‑by‑part, plan a task, and more.

Built with **Expo + React Native**. Real message/assignment drafting is powered by the **Claude API** through server‑only API routes, with offline heuristic fallbacks so the whole app demos without a key.

> Demo build. The persona is **Maya**, a university student. Voice input is simulated (it feeds a real transcript into the same pipeline). The "simulated date" control lets you jump to a task's day to trigger Aria's proactive flows.

## Features

- **Natural‑language capture**, "remind me to email Prof. Lee Friday at 5pm." Aria parses date, time, category, priority, and how to handle it, then lets Maya **review and confirm** before saving.
- **Categories**, Task · Reminder · Event · Birthday · Anniversary · Assignment · Project, each with its own "how should Aria handle it?" options.
- **Proactive, consent‑first flows**, on the assigned day a task appears on **Today** with an offer. Example: _"Want me to draft a birthday card for Jane and send it?"_ → draft → review/rewrite → **approve** → send → auto‑checked off.
- **Handling methods**, Text · Email · Card · Call for people (contact picker + required email for email); Outline · Full draft · Step‑by‑step · Reminder for assignments; Plan · Draft · Reminder for tasks.
- **Assignment walkthrough**, generates a checklist of parts, drafts each one, offers per‑subtask **research help**, compiles a draft, and **saves it to your Notes app** via the share sheet.
- **Contacts**, Maya's own saved contacts (a new account starts empty); add people manually and Aria remembers them.
- **Calendar**, month / week / day views with an agenda; **rebalance a packed week** by moving events to another day or time.
- **Onboarding**, new sign‑ups get a welcome, a "how it works" intro, and a clean, empty slate.
- **Aria chat**, a floating assistant; type or tap the mic. Understands small talk (yes / no / thanks / hold on).
- Light & dark themes, priority, subtasks, Upcoming / Done / Late views, haptics.

## Tech stack

- [Expo](https://expo.dev) SDK 54 · [Expo Router](https://docs.expo.dev/router/introduction/) (file‑based routing + server API routes)
- React Native 0.81 · React 19
- [NativeWind](https://www.nativewind.dev/) v4 (Tailwind for RN) + a small design‑token system
- [Zustand](https://github.com/pmndrs/zustand) (persisted via AsyncStorage)
- [Anthropic Claude API](https://docs.anthropic.com/) (`@anthropic-ai/sdk`) via `/api/*` routes
- `date-fns`, `lucide-react-native`, Reanimated

## Getting started

**Prerequisites:** Node 18+ and the [Expo Go](https://expo.dev/go) app on your phone.

```bash
git clone https://github.com/toyosidesign/Aria-Demo.git
cd Aria-Demo
npm install
npx expo start        # then scan the QR with Expo Go (Camera app on iOS)
```

### Enabling real Claude drafting (optional)

The app works fully without a key (drafts come from built‑in fallbacks). For smarter, tailored drafting, add a **server‑only** key:

```bash
# .env.local  (gitignored, never bundled into the app)
ANTHROPIC_API_KEY=sk-ant-...
```

Restart the dev server after adding it. The key is read only inside the server routes (`src/app/api/draft+api.ts`, `src/app/api/assistant+api.ts`) and is **not** exposed to the client. Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).

## Project structure

```
src/
  app/                 # routes (expo-router)
    (tabs)/            # Today · Calendar · Tasks · Settings · Profile
    api/               # server-only Claude routes (draft, assistant)
    aria/[taskId].tsx  # the proactive draft -> review -> send flow
    task/              # create + task detail
    chat.tsx           # Aria assistant chat
    rebalance.tsx      # interactive week rebalancing
    welcome.tsx        # new-user onboarding
  components/          # UI kit + feature components
  lib/                 # aria-actions, assistant parsing, dates, contacts, colors
  store/               # zustand store (tasks, contacts, profile, settings)
```

## Notes

- **Sign in vs. Create account:** signing in loads the seeded Maya demo (sample tasks + contacts); creating an account starts fresh (empty) with the welcome flow.
- Sending messages, saving to Notes, etc. use the OS **share sheet**, Apple doesn't allow apps to write to Messages/Mail/Notes silently, so this is the genuine, sanctioned path.
- Reset the demo data anytime from **Settings → Reset demo data**.
