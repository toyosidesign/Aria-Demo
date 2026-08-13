/**
 * How much writing a free account gets in a day.
 *
 * Pure, so `check:review` can hold the numbers and the wording. See
 * lib/entitlements.ts for where the tier line falls and why.
 *
 * ── Why there is a limit at all ─────────────────────────────────────────────
 *
 * Until now Free and Pro differed only in autonomy: Pro worked ahead and ran
 * the daily review, and Free pressed the buttons itself. That is a real
 * difference and an invisible one, because a free account pressing buttons all
 * day costs exactly what a paid one costs, and the tier line was a story the
 * app told rather than a thing it did.
 *
 * ── Why writing, and why this number ────────────────────────────────────────
 *
 * Writing is the expensive act: a section of an essay, a research pass, a
 * breakdown, a card. Everything else, capture, reminders, the calendar, the
 * checklist, editing, sending, is free forever, because none of it costs
 * anything to run and a planner that stops planning is not a free tier, it is a
 * trial.
 *
 * Twelve is a day of real use. Setting up an assignment and working three parts
 * with a bit of research is roughly six; a card and a couple of drafts is
 * three. It is meant to be a limit somebody meets on a heavy day and never
 * notices on an ordinary one, which is the only kind of limit that reads as
 * fair rather than as a toll.
 */

export const FREE_DAILY_WRITES = 12;

export interface WriteQuota {
  /** The day these were spent on, as yyyy-MM-dd. */
  date: string;
  count: number;
}

/** A fresh day resets it. Nothing carries over: unused writing is not credit. */
export function spentToday(quota: WriteQuota | undefined, today: string): number {
  return quota && quota.date === today ? quota.count : 0;
}

export function remainingWrites(quota: WriteQuota | undefined, today: string): number {
  return Math.max(0, FREE_DAILY_WRITES - spentToday(quota, today));
}

/**
 * Said when the day's writing is used up.
 *
 * Names the number, says when it comes back, and offers the upgrade once
 * without leaning on it. Somebody who has just been stopped mid-task is owed a
 * fact and a time, not a pitch.
 */
export function limitReachedNote(): string {
  return `That is ${FREE_DAILY_WRITES} pieces of writing today, which is where Free stops. It resets tomorrow, and everything else keeps working: your plans, reminders, checklist and sending are all still yours. Pro removes the cap and does the writing before you ask.`;
}

/**
 * The nudge shown while there is still room, or nothing.
 *
 * Only near the end. Counting down from twelve turns an app into a meter, and
 * the point is a limit people rarely meet, so it stays quiet until it is about
 * to matter.
 */
export function writesLeftNote(quota: WriteQuota | undefined, today: string): string | null {
  const left = remainingWrites(quota, today);
  if (left > 3) return null;
  if (left === 0) return 'No writing left today. It resets tomorrow.';
  return `${left} ${left === 1 ? 'piece' : 'pieces'} of writing left today.`;
}
