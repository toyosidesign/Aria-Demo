# Edge Functions

Deno, not React Native. These run on Supabase's infrastructure, not on a phone,
and are deliberately excluded from the app's `tsconfig.json` — they use `Deno.*`
globals that mean nothing to Expo, and including them would break `tsc` for
everyone. Typecheck them with `deno check` if you have Deno installed; the
security suite checks the properties that actually matter regardless.

## `run-automations`

Sends email automations that have come due, without a device involved. This is
the only place in the project that holds a `service_role` key. Read the header
comment in `run-automations/index.ts` before changing it — the reasoning for
that key, and the bounds placed on it, are written there.

### Deploying

```bash
supabase functions deploy run-automations --no-verify-jwt
```

`--no-verify-jwt` is deliberate and is **not** the same as leaving it open. The
built-in check accepts any JWT the project signs, and the anon key is one — it
ships inside the app bundle, so every user of the app already satisfies it. The
function authenticates on `x-aria-cron-secret` instead, which only the cron
holds, and returns 404 to everything else.

### Secrets

```bash
supabase secrets set \
  RESEND_API_KEY=...         \
  ARIA_FROM_EMAIL=onboarding@resend.dev \
  ARIA_CRON_SECRET="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand, and do not put either in `.env.local`. The app never
needs them, and `.env.local` is read by Expo, which is exactly how a
bundle-side leak would start.

Keep the value of `ARIA_CRON_SECRET`: `004_schedule_automations.sql` needs the
same string, and it is not readable back out of `supabase secrets`.
