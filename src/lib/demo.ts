/**
 * Choosing the day the demo tour jumps to.
 *
 * Everything Aria does that is worth watching happens *on the day* a task is
 * due, and a new account has no such day in front of it, so the tour moves the
 * app's idea of today onto one that does.
 *
 * ── Why this is a function and not a constant ───────────────────────────────
 *
 * The seeded tasks are built relative to whenever the account was made, so a
 * hardcoded date would drift out of the sample data and eventually land on an
 * empty day, demonstrating nothing.
 *
 * ── Why strictly after today ────────────────────────────────────────────────
 *
 * Three of the seeds fall on the current day. Picking "today or later" therefore
 * returned today, the switch set the date it was already on, nothing changed,
 * and the control flicked straight back off, a toggle that visibly undoes
 * itself, which reads as broken rather than as "already there". A jump to where
 * you are is not a jump, so the candidate has to be a day you are not on.
 *
 * Pure and free of the store, so `check:plan` can hold the rule.
 */

/**
 * The soonest of `candidates` that lies after `today`, or undefined.
 *
 * Undefined is a real answer and the caller is expected to act on it: with
 * nothing waiting, the tour is not offered at all. An offer that goes nowhere is
 * worse than no offer.
 */
export function nextTourDate(candidates: string[], today: string): string | undefined {
  return candidates.filter((d) => d > today).sort()[0];
}

/**
 * Are the samples actually here?
 *
 * Asked of the rows, not of the bookkeeping. The ids of the sample rows are
 * recorded when they are added, and that list can outlive them: "Start fresh"
 * deletes every task and contact, and anything that empties the planner without
 * going through the switch leaves the same stale list behind.
 *
 * Trusting the list alone made the onboarding switch describe a week of
 * examples on an empty planner, and refuse to add them because it believed they
 * were already there. So presence means a recorded id that still matches a row
 * in front of you.
 */
export function sampleDataPresent(rowIds: string[], sampleIds: string[]): boolean {
  if (!sampleIds.length) return false;
  const rows = new Set(rowIds);
  return sampleIds.some((id) => rows.has(id));
}
