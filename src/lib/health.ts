import { postJson } from '@/lib/api-client';

/**
 * Asking whether Aria can think, from the phone.
 *
 * The whole app is built to degrade quietly: no key, no session, no network,
 * and every screen still produces something that reads like Aria wrote it. That
 * is right for a demo and wrong for debugging, and it has now cost two separate
 * days, once to a rejected API key and once to a signed-out session. Both times
 * the only visible symptom was Aria seeming stupid.
 *
 * This is the one place that says which it is.
 */

export type Brain =
  /** The model answered a real request. Everything you read is Aria's. */
  | 'thinking'
  /** A key is set and the API rejected it. Every reply is scripted. */
  | 'rejected'
  /** No key on the server. Every reply is scripted, by design. */
  | 'no-key'
  /** Could not reach the API to check. Says nothing about the key. */
  | 'unsure'
  /** Not signed in, so the routes answer 401 and the app falls back. */
  | 'signed-out'
  /** The server itself was not reachable from here. */
  | 'offline';

export interface Health {
  brain: Brain;
  /** Whether the server could send an email if a task asked it to. */
  email: boolean;
  /**
   * Whether it can reach anyone, or only the person who owns the account.
   *
   * Resend refuses every recipient but the account holder until a domain has
   * been verified, and a configured key looks exactly like a working one until
   * somebody watches an email to their tutor not arrive. Worth its own line.
   */
  emailAnyone: boolean;
}

/**
 * Never throws, and never leaves the caller guessing.
 *
 * Every failure mode maps to a state the screen can say out loud, including
 * the two that are not really about the key at all. "I could not tell" is a
 * legitimate answer here; silence is not.
 */
export async function checkHealth(): Promise<Health> {
  let res: Response;
  try {
    res = await postJson('/api/health', {});
  } catch {
    // On a device a missing origin throws before the network is touched, which
    // is the same silent-degradation trap this file exists to expose.
    return { brain: 'offline', email: false, emailAnyone: false };
  }

  if (!res.ok) {
    // 401 is its own diagnosis, not a failure to diagnose: a signed-out client
    // gets scripted text from every route, which is one of the two ways this
    // app ends up looking broken.
    if (res.status === 401) return { brain: 'signed-out', email: false, emailAnyone: false };
    return { brain: 'offline', email: false, emailAnyone: false };
  }

  const data = (await res.json().catch(() => null)) as {
    model?: string;
    email?: boolean;
    emailAnyone?: boolean;
  } | null;
  const email = Boolean(data?.email);
  const emailAnyone = Boolean(data?.emailAnyone);
  const of = (brain: Brain): Health => ({ brain, email, emailAnyone });
  switch (data?.model) {
    case 'ok':
      return of('thinking');
    case 'invalid':
      return of('rejected');
    case 'unchecked':
      return of('no-key');
    default:
      return of('unsure');
  }
}

/**
 * What Aria can do with email, said before it matters rather than after.
 *
 * The failure this prevents is specific and embarrassing: a demo where Aria
 * announces it has emailed somebody's tutor, and nothing arrives, because the
 * provider quietly refuses every recipient except the account holder.
 */
export function mailCopy(h: Health): { title: string; detail: string; good: boolean } {
  if (!h.email) {
    return {
      title: 'Aria cannot send email',
      detail: 'No mail provider is configured, so anything scheduled to go out will not.',
      good: false,
    };
  }
  if (!h.emailAnyone) {
    return {
      title: 'Aria can only email you',
      detail:
        'The sender is a sandbox address, so mail reaches the account holder and nobody else. Set SMTP_HOST, SMTP_USER and SMTP_PASS for any provider with a verified sender, or GMAIL_USER and GMAIL_APP_PASSWORD, or verify a domain with Resend.',
      good: false,
    };
  }
  return {
    title: 'Aria can email anyone',
    detail: 'Scheduled mail will reach the address you give it.',
    good: true,
  };
}

/**
 * What to say, in words somebody can act on.
 *
 * Not status codes and not a coloured dot on its own. Each line names what is
 * happening to the replies, because that is the thing being misread, and the
 * fix where there is one.
 */
export function healthCopy(brain: Brain): { title: string; detail: string; good: boolean } {
  switch (brain) {
    case 'thinking':
      return {
        title: 'Aria is thinking for herself',
        detail: 'The model is answering. What you read is written for you, not scripted.',
        good: true,
      };
    case 'rejected':
      return {
        title: 'Aria is answering from scripts',
        detail:
          'The API key is set but was rejected, so every reply is a stand-in. They are written to read like the real thing, which is exactly why this line exists. Replace ANTHROPIC_API_KEY and restart.',
        good: false,
      };
    case 'no-key':
      return {
        title: 'Aria is answering from scripts',
        detail:
          'No API key on the server, so replies are stand-ins. That is fine for a demo, and worth knowing before you judge an answer.',
        good: false,
      };
    case 'signed-out':
      return {
        title: 'Aria is answering from scripts',
        detail:
          'You are not signed in, so the server turns every request away and the app falls back. Signing in restores it.',
        good: false,
      };
    case 'offline':
      return {
        title: "Can't reach the server",
        detail: 'Replies are coming from the phone. They will be stand-ins until it is back.',
        good: false,
      };
    default:
      return {
        title: "Couldn't tell",
        detail:
          'The key could not be checked just now, which says nothing about whether it works. Try again in a moment.',
        good: false,
      };
  }
}
