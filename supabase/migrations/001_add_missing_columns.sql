-- Add the 8 columns the app writes but the database doesn't have.
--
-- Until these exist, every task and profile save fails. The failure is silent:
-- the device keeps its own copy so the app looks fine, but nothing reaches the
-- server, which also means nothing can run server-side, because there is no
-- server-side data to run against.
--
-- Verified missing against the live database on 2026-07-31. Every other column
-- the app writes was confirmed present, so this is the complete set.
--
-- Safe to run more than once: `if not exists` makes each statement a no-op when
-- the column is already there, and no existing data is read or modified.

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists contact_phone    text;     -- recipient for text/call tasks
alter table public.tasks add column if not exists card_template_id text;     -- which card design, for the 'card' method
alter table public.tasks add column if not exists photo_uri        text;     -- the picture to share, for the 'photo' method
alter table public.tasks add column if not exists alarm            boolean default false;  -- chime at the task's date+time
alter table public.tasks add column if not exists repeat           text;     -- daily | weekly | fortnightly | monthly | yearly

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists context        text;    -- "Second year studying law", feeds Aria's prompts
alter table public.profiles add column if not exists avatar_url     text;    -- profile picture
alter table public.profiles add column if not exists biometric_lock boolean default false;

-- ---------------------------------------------------------------------------
-- Tell the API about them.
--
-- PostgREST caches the table shapes at startup. Without this it keeps serving
-- the old schema and the new columns stay invisible to the app, which looks
-- exactly like the migration having failed.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
