-- What Aria needs to know about a student to personalise anything.
--
-- Onboarding asks four questions; these are where the answers live. Without
-- them the answers exist only on the device, which means they're lost on
-- reinstall and — more importantly — invisible to anything running server-side.
--
-- Safe to run more than once, and safe to run before or after 001.

alter table public.profiles add column if not exists studying      text;   -- "Law", "Mechanical Engineering"
alter table public.profiles add column if not exists level         text;   -- "2nd year", "Postgrad"
alter table public.profiles add column if not exists explain_style text;   -- direct | examples | stepwise

-- Interests are a list, and Postgres has a type for that. Storing them as a
-- comma-joined string would work right up until someone's interest contains a
-- comma, and would make "students who like basketball" unqueryable later.
alter table public.profiles add column if not exists interests text[] default '{}';

-- PostgREST caches table shapes at startup; without this the columns exist but
-- the API keeps serving the old schema, which looks exactly like the migration
-- having failed.
notify pgrst, 'reload schema';
