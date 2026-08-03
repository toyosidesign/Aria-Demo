-- Whether Aria may send without asking first. Aria Pro only.
--
-- A column rather than a device setting, and that distinction is the whole
-- point. The cron in 004 sends with no device involved and no session, so a
-- preference living in AsyncStorage on someone's phone is invisible to the one
-- process that acts on it. It has to be here or it cannot govern anything.
--
-- Compare `theme`, which is deliberately NOT synced (see rowToProfile in
-- src/lib/sync.ts): appearance is a property of a handset, and nothing
-- server-side ever needs to know it. This is the opposite case.
--
-- Default false. Sending on someone's behalf unasked is a thing to opt into —
-- defaulting it true would mean the first a student hears of the feature is an
-- email their contact already received.
--
-- Safe to run more than once.

alter table public.profiles add column if not exists auto_send boolean default false;

-- Pro state, for the same reason: the runner has to know whether this account
-- is actually entitled to autonomous sending. A lapsed subscription with
-- auto_send still true must not keep sending, and the device cannot be trusted
-- to police that on the server's behalf.
alter table public.profiles add column if not exists pro boolean default false;

-- PostgREST caches table shapes at startup; without this the columns exist but
-- the API keeps serving the old schema, which looks exactly like the migration
-- having failed.
notify pgrst, 'reload schema';
