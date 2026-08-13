-- A task's own conversation with Aria, moved off the device.
--
-- Everything a piece of work *is* already syncs: its parts, the sections Aria
-- wrote, the instruction somebody typed, the unfinished draft. The conversation
-- about it did not. It lived in device storage, so signing in on another phone
-- resumed the work and opened an empty chat, and the reasoning behind the work,
-- what was asked, what Aria answered, why a paragraph is the way it is, existed
-- on exactly one handset.
--
-- Safe to run more than once.

-- ========================= one row per message =========================
--
-- Rather than one row per task holding the whole thread as JSON. The same
-- account can be open on a phone and a laptop, and both append: with a thread
-- in one column each write rewrites the other's, and messages vanish with no
-- error anywhere. Appends to separate rows merge on their own.
create table if not exists public.work_messages (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  -- Not a foreign key to tasks, deliberately. Deleting a task should take its
  -- conversation with it, and that is done explicitly by the client, which
  -- knows *why* it is deleting. A cascade would also fire when a task is
  -- removed for reasons that have nothing to do with the thread.
  task_id    uuid not null,
  -- 'aria' or 'maya'. Left unconstrained: a new speaker is a display concern,
  -- and a check constraint here would reject rows from an older client rather
  -- than showing them under an unknown name.
  sender     text not null,
  -- 'text' or 'draft'. Same reasoning.
  kind       text not null default 'text',
  body       text not null default '',
  -- True when the scripted stand-in wrote it rather than the model. Kept so a
  -- thread read on another device still says which is which.
  scripted   boolean not null default false,
  -- Client-assigned, because the order that matters is the order they were said
  -- in, on the device that said them, not the order they reached the server.
  said_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- The only query this table serves: one user's messages for one task, in order.
create index if not exists work_messages_user_task_idx
  on public.work_messages (user_id, task_id, said_at);

-- ========================= where the screen was left =========================
--
-- The step and the part being worked on, one row per task. This one *is* a
-- single row per task rewritten in place, and that is right: it is a position,
-- not a history. Two devices disagreeing about it means the last one to look
-- wins, which is what somebody would expect.
create table if not exists public.work_chat_state (
  task_id       uuid not null,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  phase         text,
  active_sub_id text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- ========================= Row-Level Security =========================
--
-- A student's conversation about their coursework is the most personal thing in
-- this schema. Same shape as every other table here: you reach your own rows
-- and nobody else's, enforced by the database rather than by the client
-- remembering to filter.
alter table public.work_messages   enable row level security;
alter table public.work_chat_state enable row level security;

drop policy if exists "work messages are self" on public.work_messages;
create policy "work messages are self" on public.work_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "work chat state is self" on public.work_chat_state;
create policy "work chat state is self" on public.work_chat_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PostgREST caches table shapes at startup; without this the tables exist but
-- the API keeps serving the old schema, which looks exactly like the migration
-- having failed.
notify pgrst, 'reload schema';
