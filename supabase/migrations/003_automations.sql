-- Scheduled work Aria runs, moved off the device.
--
-- Automations lived only in the Zustand store, which meant a birthday email
-- scheduled for Friday existed nowhere but one phone. Nothing server-side could
-- see it, so nothing server-side could send it — the app had to be open at the
-- appointed moment, which is the one moment the student did not need an
-- assistant. This table is the prerequisite for the cron in 004.
--
-- Safe to run more than once.

create table if not exists public.automations (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  -- Not a foreign key to tasks. A row here is the record of something Aria was
  -- asked to do; deleting the task should not silently erase the evidence that
  -- an email went out, and cascading the delete would do exactly that.
  task_id    uuid not null,
  task_title text not null,
  channel    text not null,
  run_at     timestamptz not null,
  to_name    text,
  to_email   text,
  to_phone   text,
  subject    text,
  body       text not null default '',
  status     text not null default 'scheduled',
  created_at timestamptz not null default now(),
  ran_at     timestamptz,
  error      text,
  updated_at timestamptz not null default now()
);

-- These two columns decide whether a background job sends a real email to a
-- real person, so they are constrained rather than trusted. Everywhere else in
-- this schema a bad enum value degrades to a display bug; here it would be an
-- unintended send.
alter table public.automations drop constraint if exists automations_channel_check;
alter table public.automations add  constraint automations_channel_check
  check (channel in ('email', 'sms', 'whatsapp'));

-- 'sending' exists only in the database. It is the claim marker that makes the
-- runner idempotent (see "how double-sends are prevented" below) and is never a
-- state the student is shown as such.
alter table public.automations drop constraint if exists automations_status_check;
alter table public.automations add  constraint automations_status_check
  check (status in ('scheduled', 'sending', 'sent', 'ready', 'done', 'failed', 'cancelled'));

create index if not exists automations_user_id_idx on public.automations (user_id);

-- The exact query the cron runs, and nothing else. Partial so it stays small:
-- finished automations accumulate forever and none of them are ever due.
create index if not exists automations_due_idx
  on public.automations (run_at)
  where status = 'scheduled' and channel = 'email';

-- Stuck-claim sweep (see 004). Also partial — in a healthy system this index
-- covers zero rows.
create index if not exists automations_sending_idx
  on public.automations (ran_at)
  where status = 'sending';

-- ========================= Row-Level Security =========================
alter table public.automations enable row level security;

drop policy if exists "automations are self" on public.automations;
create policy "automations are self" on public.automations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================= how double-sends are prevented =========================
--
-- Two things can decide an automation is due: the cron, and the device, if the
-- app happens to be open at the time. Both must be able to try, and exactly one
-- must win — a birthday email sent twice is a worse failure than one sent late.
--
-- So neither of them ever reads a row and then sends it. Both issue the same
-- conditional update first:
--
--   update automations set status = 'sending'
--    where id = $1 and status = 'scheduled'
--   returning *
--
-- and send only if a row comes back. Under READ COMMITTED the second writer
-- blocks on the row lock, re-evaluates the predicate when it is released, sees
-- 'sending', matches nothing and returns zero rows. The update *is* the lock;
-- there is no separate claim to get wrong, and no window between checking and
-- sending for the other party to slip through.
--
-- Deliberately not a `security definer` function. One shared claim path looks
-- tidier, but it has to accept "I am the cron, RLS does not apply to me" as an
-- argument, and any signed-in user could pass that and claim somebody else's
-- automation. Plain updates keep RLS doing the ownership check for the device
-- and the service_role key doing it for the cron, with no third path to audit.

-- PostgREST caches table shapes at startup; without this the table exists but
-- the API keeps serving the old schema, which looks exactly like the migration
-- having failed.
notify pgrst, 'reload schema';
