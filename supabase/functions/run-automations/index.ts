/**
 * The thing Aria could not do before: act while the app is closed.
 *
 * `runAutomation` in the app is called from exactly one place, a screen, so a
 * birthday email scheduled for Friday sat on the device until the student
 * opened it, which is precisely the moment they did not need an assistant. This
 * runs on a schedule instead (see 004_schedule_automations.sql) and sends
 * without a device involved.
 *
 * Deno, not React Native. Nothing here can import from `src/`, different
 * runtime, no bundler, no path aliases, so the couple of rules it shares with
 * the app are restated below with a pointer to the original. The security suite
 * asserts they have not drifted apart.
 *
 * ── Why this file is allowed to hold a service_role key ────────────────────
 *
 * A cron has no user session, so RLS has no `auth.uid()` to work with and every
 * policy in the schema denies it. Sending on a student's behalf therefore needs
 * the key that bypasses RLS. That is a real change to the security model and it
 * is confined here on purpose:
 *
 *   · the key is read from the Edge Function's own environment, never from a
 *     file, and never from anything Expo bundles;
 *   · it is never sent to a client, echoed in a response, or logged;
 *   · this function does exactly one job with it, send email automations that
 *     are due, and has no other entry point;
 *   · `EXPO_PUBLIC_*` is the prefix that reaches the app bundle, and nothing
 *     here uses it. The security suite fails if a service_role key ever appears
 *     under `src/`, and now also if one is given a public prefix anywhere.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ARIA_FROM_EMAIL = Deno.env.get('ARIA_FROM_EMAIL');
const CRON_SECRET = Deno.env.get('ARIA_CRON_SECRET');

/**
 * How many automations one tick will send.
 *
 * A bound rather than a performance tweak: a bug that made everything look due
 * at once, a clock skew, a bad backfill, should cost a bounded number of
 * emails and show up in the next tick, not empty the table into somebody's
 * inbox in one go. Anything left over is still due a minute later.
 */
const BATCH = 25;

/**
 * A claim older than this was made by a run that died mid-send.
 *
 * Long enough that a slow provider call is never mistaken for a crash.
 */
const STUCK_MINUTES = 15;

const EMAIL = /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]+$/;

/**
 * Same rule as `normaliseSubject` in src/lib/email-subject.ts, restated because
 * Deno cannot import it. A subject is a header: a newline in one is how an extra
 * Bcc gets smuggled into a message, so it collapses whitespace rather than
 * trimming the ends.
 *
 * Character-for-character identical to the app's on purpose. The security suite
 * pulls this function body out of this file, runs it against the real one, and
 * fails if the two ever disagree, a copy that quietly drifts is worse than no
 * copy, because the app-side test would still be green.
 */
function normaliseSubject(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface AutomationRow {
  id: string;
  user_id: string;
  task_id: string;
  task_title: string;
  to_email: string | null;
  subject: string | null;
  body: string;
}

/**
 * The columns the send needs, and deliberately no others, see the claim.
 *
 * `user_id` earns its place: the entitlement check below is per-account, and
 * without it this function cannot tell whose automation it is holding.
 */
const SEND_COLUMNS = 'id,user_id,task_id,task_title,to_email,subject,body';

/**
 * May this account be sent for without being asked?
 *
 * Both columns, never just `auto_send`. Pro can lapse while the stored
 * preference stays true, and reading the preference alone would keep sending
 * for an account that stopped paying for it, the same rule `autoSendEnabled`
 * enforces in the app, restated here because this process cannot import it.
 *
 * Fails closed. A profile row that cannot be read, or a request that errors,
 * returns false: the automation waits for a human rather than going out on an
 * assumption. Silent degradation is this project's standing failure mode, and
 * the degraded direction has to be the one that sends nothing.
 */
async function mayAutoSend(userId: string): Promise<boolean> {
  try {
    const res = await db(`profiles?select=auto_send,pro&id=eq.${userId}`);
    if (!res.ok) return false;
    const rows = (await res.json()) as { auto_send: boolean | null; pro: boolean | null }[];
    const profile = rows[0];
    return Boolean(profile?.pro) && Boolean(profile?.auto_send);
  } catch {
    return false;
  }
}

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Record how one automation went. Terminal, nothing moves out of these.
 *
 * Filtered on `status=eq.sending` even though this run holds the claim, so that
 * the only rows this function can ever write a verdict onto are the ones it
 * actually claimed. Without it a stray call could overwrite a row somebody else
 * settled.
 */
async function settle(id: string, status: 'sent' | 'failed', error?: string) {
  await db(`automations?id=eq.${id}&status=eq.sending`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      error: error ?? null,
      ran_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

/**
 * Sending was the whole task, so tick it off.
 *
 * The app does this in `settleAutomation` and the two have to agree, or a
 * student opens Aria to find Friday's email marked sent and the task that asked
 * for it still sitting on the list. `status=eq.todo` keeps it from disturbing a
 * task they already completed themselves.
 */
async function completeTask(taskId: string) {
  await db(`tasks?id=eq.${taskId}&status=eq.todo`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'done',
      handled_by_aria: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function sendOne(row: AutomationRow): Promise<{ ok: boolean; error?: string }> {
  const to = (row.to_email ?? '').trim();
  if (!EMAIL.test(to)) {
    return { ok: false, error: 'No valid recipient address' };
  }

  const subject = normaliseSubject(row.subject ?? '') || normaliseSubject(row.task_title);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: ARIA_FROM_EMAIL,
      to: [to],
      subject: subject || '(no subject)',
      text: row.body,
    }),
  });

  if (!res.ok) {
    // The provider's own words name the sending domain, quota state and account
    // restrictions. That belongs in the log, not in a row the client reads back.
    const detail = await res.text().catch(() => '');
    console.error('[aria] run-automations: provider rejected', res.status, detail);
    return {
      ok: false,
      error:
        res.status === 429
          ? 'Too many emails just now, not sent'
          : 'The mail provider rejected it',
    };
  }
  return { ok: true };
}

/**
 * Rows claimed by a run that never finished.
 *
 * Marked failed rather than retried. A retry would resend anything that was
 * accepted by Resend a moment before the crash, and a duplicate birthday email
 * is worse than a late one, the student can see this in the report and send it
 * themselves. What it must never do is claim to have sent something it cannot
 * confirm.
 */
async function sweepStuck(): Promise<number> {
  // Encoded because a timestamp carries colons and a '+' offset, and a raw '+'
  // in a query string is a space.
  const cutoff = encodeURIComponent(new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString());
  const res = await db(`automations?status=eq.sending&ran_at=lt.${cutoff}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'failed',
      error: 'Interrupted while sending, not confirmed, so not marked as sent',
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) return 0;
  return ((await res.json()) as unknown[]).length;
}

Deno.serve(async (req: Request) => {
  /*
   * Not `verify_jwt`. That accepts any JWT the project signs, and the anon key
   * is one, it ships inside the app bundle, so "has a valid JWT" is a property
   * every user of the app already has. This function spends money and emails
   * strangers; it takes a secret only the cron holds.
   *
   * A plain `!==`, not a constant-time compare, and that is a judgement rather
   * than an oversight: the secret is 32 random bytes, so a timing oracle would
   * have to resolve byte-by-byte differences across the public internet against
   * a keyspace nothing can walk. Swap in `crypto.subtle.timingSafeEqual` if this
   * ever guards something a local caller can hammer.
   *
   * 404, not 401, an unauthenticated caller learns nothing about whether the
   * route is there.
   */
  const offered = req.headers.get('x-aria-cron-secret') ?? '';
  if (!CRON_SECRET || offered !== CRON_SECRET) {
    return new Response('Not found', { status: 404 });
  }

  // POST only, matching the rule the app's own routes follow: nothing that acts
  // on the world should be reachable by a method a browser issues on its own.
  // The cron posts; anything else has the wrong idea about what this is.
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[aria] run-automations: no database credentials in the environment');
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }
  if (!RESEND_API_KEY || !ARIA_FROM_EMAIL) {
    // Refuse rather than claim a quiet success. Silent degradation is this
    // project's standing failure mode and it hides a dead key completely.
    console.error('[aria] run-automations: no mail provider configured');
    return new Response(JSON.stringify({ error: 'No mail provider' }), { status: 500 });
  }

  const swept = await sweepStuck();

  /*
   * Only `channel=eq.email`. SMS and WhatsApp are filtered in the query rather
   * than skipped in the loop, because neither iOS nor Android lets an app send
   * a message as the user, there is no server-side equivalent to fall back to,
   * and a row of either kind reaching the send path could only ever produce a
   * "sent" that did not send. See the note at the top of src/lib/automations.ts.
   */
  const dueRes = await db(
    `automations?select=id&status=eq.scheduled&channel=eq.email` +
      `&run_at=lte.${encodeURIComponent(new Date().toISOString())}` +
      `&order=run_at.asc&limit=${BATCH}`,
  );
  if (!dueRes.ok) {
    console.error('[aria] run-automations: could not read the queue', dueRes.status);
    return new Response(JSON.stringify({ error: 'Query failed' }), { status: 500 });
  }
  const due = (await dueRes.json()) as { id: string }[];
  if (!due.length) {
    return Response.json({ swept, claimed: 0, sent: 0, failed: 0 });
  }

  /*
   * Claim before sending, never after reading.
   *
   * `status=eq.scheduled` in the filter is what makes this safe: it is a
   * conditional update, so a row the device grabbed a moment ago is no longer
   * scheduled and does not come back. Only rows this statement actually moved
   * are returned, and only those are sent. Two ticks overlapping, or a phone
   * running the same queue from the run screen, cannot both win a row.
   */
  const ids = due.map((d) => d.id).join(',');
  // `select` narrows what comes back to the columns the send needs, keeping the
  // rest, user_id, phone numbers, the recipient's name, out of a payload this
  // function has no use for.
  const claimRes = await db(
    `automations?id=in.(${ids})&status=eq.scheduled&select=${SEND_COLUMNS}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'sending',
        ran_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!claimRes.ok) {
    console.error('[aria] run-automations: claim failed', claimRes.status);
    return new Response(JSON.stringify({ error: 'Claim failed' }), { status: 500 });
  }
  const claimed = (await claimRes.json()) as AutomationRow[];

  let sent = 0;
  let failed = 0;
  let held = 0;
  // One lookup per account, not per row: a morning's automations usually belong
  // to the same person, and the entitlement cannot change mid-run.
  const entitlement = new Map<string, boolean>();

  for (const row of claimed) {
    try {
      if (!entitlement.has(row.user_id)) {
        entitlement.set(row.user_id, await mayAutoSend(row.user_id));
      }
      if (!entitlement.get(row.user_id)) {
        /*
         * Not entitled, or the account asked to be consulted first.
         *
         * Back to 'scheduled' rather than 'failed'. Nothing went wrong and
         * nothing was attempted, the automation is still due and the device
         * picks it up the next time the app is open, which is exactly the
         * behaviour before the cron existed. Marking it failed would tell a
         * student their birthday email had bounced when it had simply been
         * left for them to approve.
         */
        await db(`automations?id=eq.${row.id}&status=eq.sending`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'scheduled', ran_at: null, updated_at: new Date().toISOString() }),
        });
        held += 1;
        continue;
      }

      const result = await sendOne(row);
      if (result.ok) {
        await settle(row.id, 'sent');
        await completeTask(row.task_id);
        sent += 1;
      } else {
        await settle(row.id, 'failed', result.error);
        failed += 1;
      }
    } catch (err) {
      console.error('[aria] run-automations: send threw', err);
      await settle(row.id, 'failed', 'Could not reach the mail provider');
      failed += 1;
    }
  }

  // Counts only. The response goes back to pg_net, which logs it, no
  // addresses, subjects or bodies belong in a database log table.
  return Response.json({ swept, claimed: claimed.length, sent, failed, held });
});
