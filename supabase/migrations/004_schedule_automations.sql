-- The scheduler itself: what makes Aria able to act while the app is closed.
--
-- Runs the `run-automations` Edge Function once a minute. Everything the send
-- actually depends on lives in that function; this file only decides when it is
-- poked, and how it proves it is the cron rather than a stranger.
--
-- ── Unlike 001-003, this one is NOT copy-paste-and-run ────────────────────
--
-- It needs two values that are specific to your project and must not be
-- committed, so they are read from Vault rather than written here. Do these
-- three things first, in order:
--
--   1. Deploy the function:
--        supabase functions deploy run-automations --no-verify-jwt
--
--   2. Set its secrets (see supabase/functions/README.md), keeping the value
--      of ARIA_CRON_SECRET — you cannot read it back out afterwards.
--
--   3. Store the same two values in Vault, from the SQL editor:
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<the ARIA_CRON_SECRET you generated>', 'aria_cron_secret');
--
-- Then run this file. Safe to re-run.

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

-- Unschedule first so re-running this replaces the job rather than stacking a
-- second copy of it. Two jobs would not double-send — the claim in 003 prevents
-- that — but they would double the request volume for nothing.
select cron.unschedule('aria-run-automations')
 where exists (select 1 from cron.job where jobname = 'aria-run-automations');

/*
 * Once a minute.
 *
 * The finest granularity pg_cron offers, and the right one: this is the delay
 * between "9:00, send the email" and the email being sent, and a student who
 * scheduled something for 9:00 sharp should not watch it leave at 9:05. A tick
 * with nothing due costs one indexed lookup against a partial index that covers
 * only pending email automations — see automations_due_idx in 003.
 *
 * The request is fire-and-forget. pg_net queues it and returns immediately, so
 * a slow provider cannot hold a database worker open, and the next tick starts
 * on time regardless. Overlapping ticks are safe for the same reason a phone
 * and the cron are: the claim decides, not the schedule.
 */
select cron.schedule(
  'aria-run-automations',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/run-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Not the anon key, and not the service_role key. The anon key ships in
      -- the app bundle, so it proves nothing; the service_role key would be
      -- travelling over the wire on every tick for no reason. This is a secret
      -- whose only job is to say "the cron sent this".
      'x-aria-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'aria_cron_secret')
    ),
    body := '{}'::jsonb,
    -- Comfortably longer than a batch of provider calls, and short enough that
    -- a wedged request is abandoned rather than left in flight across ticks.
    timeout_milliseconds := 30000
  );
  $$
);

-- ── Checking on it ────────────────────────────────────────────────────────
--
-- Is it scheduled?
--   select jobname, schedule, active from cron.job where jobname = 'aria-run-automations';
--
-- Did the last few ticks run?
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'aria-run-automations')
--    order by start_time desc limit 10;
--
-- What did the function say? `status_code` 200 with a body of counts is a
-- healthy tick; 404 means the secret in Vault does not match the one in the
-- function's environment, which is the most likely thing to be wrong.
--   select status_code, content, created
--     from net._http_response order by created desc limit 10;
--
-- Turn it off without dropping anything:
--   update cron.job set active = false where jobname = 'aria-run-automations';
