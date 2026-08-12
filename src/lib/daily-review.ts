/**
 * The daily review: the one thing Pro actually changes.
 *
 * Free is a planner that reminds you. You open it, you read the offer, you tap
 * the buttons, you do the work. Pro is an assistant: once a day it shows you
 * everything today needs, you approve it in one go, and it carries out what it
 * can while you are somewhere else.
 *
 * ── The honesty this module exists to keep ──────────────────────────────────
 *
 * "Aria handles your day" is only true of some of it, and the parts it is false
 * about are the ones that would cost somebody something. So every item on the
 * review says which of three things approval means, and the wording is not
 * interchangeable:
 *
 *   send     Aria sends it, with nobody watching. Email only, because that is
 *            the only channel a server can complete on your behalf.
 *   prepare  Aria writes it, addresses it and has it waiting. You still tap
 *            send, because iOS and WhatsApp do not let an app send for you.
 *            Saying "handled" here would be a lie discovered at the worst
 *            moment: when the message never arrived.
 *   yours    Aria cannot do this one at all. Writing an essay, making a call,
 *            going to the gym. It is on the list so the day is complete, and
 *            it is never counted as something approval will take care of.
 *
 * ── Why nothing goes out immediately ────────────────────────────────────────
 *
 * Approval schedules; it does not send. Every item gets at least `HOLD_MINUTES`
 * before it runs, which is the promise onboarding makes in as many words, and
 * the only thing standing between a mis-tap and an email somebody cannot recall.
 *
 * Pure, and importable without a React Native runtime, so `check:review` can
 * walk every shape of it.
 */

import { toISODate } from '@/lib/dates';
import type { AutoChannel } from '@/lib/automations';
import type { Task, TaskMethod } from '@/store/aria-store';

/** What approving this item actually does. */
export type ReviewOutcome = 'send' | 'prepare' | 'yours';

export interface ReviewItem {
  taskId: string;
  title: string;
  outcome: ReviewOutcome;
  /** How it goes out. Absent on `yours`. */
  channel?: AutoChannel;
  /** ISO datetime Aria should act. Absent on `yours`. */
  runAt?: string;
  /** Who it is going to, as a person would say it. */
  to?: string;
  /** The message itself, when there is one. */
  body?: string;
  subject?: string;
  /**
   * Why this cannot be sent, when it cannot.
   *
   * A sendable task with no recipient or nothing written is not approved and
   * quietly dropped: it is shown, with the one thing missing, because that is
   * the difference between "Aria will handle it" and "Aria could not, and said
   * nothing".
   */
  blocked?: string;
  /** One line: what approval means for this item, in plain words. */
  line: string;
}

export interface DailyReview {
  date: string;
  items: ReviewItem[];
  /** Everything approval would actually act on. */
  actionable: ReviewItem[];
  /** Items Aria will complete outright. */
  sending: ReviewItem[];
  /** Items Aria will have ready for one tap. */
  preparing: ReviewItem[];
  /** Items that are the person's own to do. */
  yours: ReviewItem[];
  /** Shown but not approvable, each with what it is missing. */
  blocked: ReviewItem[];
}

/**
 * The window between approving and acting.
 *
 * Ten minutes, and it is a product promise rather than an implementation
 * detail: onboarding and the Pro sheet both say "ten minutes to stop it".
 * Changing it here changes what the app told somebody when they paid.
 */
export const HOLD_MINUTES = 10;

/** When no time was set, the hour Aria treats as "some point today". */
export const DEFAULT_ACTION_TIME = '09:00';

/**
 * Which channel a method goes out on.
 *
 * A card is the interesting one: it is an image plus words, and it reaches
 * people by mail or by WhatsApp. Email when there is an address, because that
 * is the only one Aria can finish alone.
 */
function channelFor(task: Task): AutoChannel | undefined {
  const method: TaskMethod | undefined = task.method;
  if (method === 'email') return 'email';
  if (method === 'sms') return 'sms';
  if (method === 'card' || method === 'photo') {
    return task.contactEmail?.trim() ? 'email' : 'whatsapp';
  }
  return undefined;
}

/** Only email can be completed with nobody watching. */
export function isAutonomous(channel: AutoChannel): boolean {
  return channel === 'email';
}

function recipient(task: Task, channel: AutoChannel): string | undefined {
  if (channel === 'email') return task.contactEmail?.trim() || undefined;
  return task.contactPhone?.trim() || undefined;
}

/**
 * The moment Aria should act on this task.
 *
 * The task's own time when it has one, otherwise mid-morning, and never sooner
 * than the hold. A task whose time has already passed is not skipped: it is
 * pushed to the end of the hold, because the point of approving at 8am is that
 * the 7am ones still go.
 */
export function runAtFor(task: Task, now: Date): string {
  const holdUntil = new Date(now.getTime() + HOLD_MINUTES * 60_000);
  const at = new Date(`${task.date}T${task.time ?? DEFAULT_ACTION_TIME}:00`);
  const when = at.getTime() > holdUntil.getTime() ? at : holdUntil;
  return when.toISOString();
}

/**
 * Build today's review.
 *
 * Only today, and only what is still open. A review that reached into tomorrow
 * would be approving things the person has not thought about yet, which is
 * exactly the trust this feature runs on.
 */
export function buildReview(tasks: Task[], today: string, now: Date = new Date()): DailyReview {
  const items: ReviewItem[] = tasks
    .filter((t) => t.status === 'todo' && t.date === today)
    .map((task) => toItem(task, now));

  const blocked = items.filter((i) => i.blocked);
  const yours = items.filter((i) => !i.blocked && i.outcome === 'yours');
  const sending = items.filter((i) => !i.blocked && i.outcome === 'send');
  const preparing = items.filter((i) => !i.blocked && i.outcome === 'prepare');

  return {
    date: today,
    items,
    actionable: [...sending, ...preparing],
    sending,
    preparing,
    yours,
    blocked,
  };
}

function toItem(task: Task, now: Date): ReviewItem {
  const channel = channelFor(task);

  // Nothing to send: an essay, a call, a reminder. Aria can plan it, break it
  // down and nag about it, but it cannot do it, and the review says so.
  if (!channel) {
    return {
      taskId: task.id,
      title: task.title,
      outcome: 'yours',
      line: task.method === 'call' ? 'Yours to make, I will remind you' : 'Yours to do, I will keep it in front of you',
    };
  }

  const to = recipient(task, channel);
  const body = task.description?.trim();
  const runAt = runAtFor(task, now);
  const who = task.contactName?.trim();

  /*
   * The two ways an item cannot be approved, both named rather than hidden.
   *
   * Dropping them silently is what turns "I approved my day" into an afternoon
   * discovering nothing was sent. Each one says the single missing thing, so
   * the fix is one tap away on the task itself.
   */
  if (!to) {
    return {
      taskId: task.id,
      title: task.title,
      outcome: channel === 'email' ? 'send' : 'prepare',
      channel,
      to,
      body,
      blocked: channel === 'email' ? 'No email address yet' : 'No number yet',
      line: 'I need somewhere to send it',
    };
  }
  if (!body) {
    return {
      taskId: task.id,
      title: task.title,
      outcome: channel === 'email' ? 'send' : 'prepare',
      channel,
      to,
      blocked: 'Nothing written yet',
      line: 'I need the words before I can send it',
    };
  }

  if (isAutonomous(channel)) {
    return {
      taskId: task.id,
      title: task.title,
      outcome: 'send',
      channel,
      runAt,
      to,
      body,
      subject: task.title,
      line: who ? `I will email ${who}` : 'I will send it',
    };
  }

  return {
    taskId: task.id,
    title: task.title,
    outcome: 'prepare',
    channel,
    runAt,
    to,
    body,
    line: who
      ? `Ready to send to ${who}, one tap from you`
      : 'Ready to send, one tap from you',
  };
}

/**
 * What the review says before anything is approved.
 *
 * Counts rather than adjectives: "four things, I can finish two" is a sentence
 * somebody can act on, and "your day is under control" is not.
 */
export function reviewSummary(review: DailyReview): string {
  const total = review.items.length;
  if (!total) return 'Nothing due today. I will come back tomorrow.';

  const parts: string[] = [];
  if (review.sending.length) parts.push(`send ${review.sending.length}`);
  if (review.preparing.length) {
    parts.push(`have ${review.preparing.length} ready for you to tap`);
  }
  if (!parts.length) {
    return total === 1
      ? "One thing today, and it is yours to do. I will keep it in front of you."
      : `${total} things today, all yours to do. I will keep them in front of you.`;
  }
  const list = parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;
  return `${total} ${total === 1 ? 'thing' : 'things'} today. Approve and I will ${list}.`;
}

/** The daily prompt itself, at whatever hour they picked. */
export function reviewNotification(review: DailyReview): { title: string; body: string } {
  return {
    title: 'Your day is ready to review',
    body: reviewSummary(review),
  };
}

/** Today, in the app's terms. Kept here so callers do not re-derive it. */
export function reviewDate(demoDate: string): string {
  return demoDate || toISODate(new Date());
}
