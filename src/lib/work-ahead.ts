/**
 * Deciding what Aria should have ready before you get there.
 *
 * This is the first half of Pro. Free waits for you to tap "draft it" and then
 * shows you a spinner; Pro finds the same work and does it in advance, so the
 * task you open at nine already has its draft, its breakdown and its notes.
 *
 * ── What makes something worth preparing ────────────────────────────────────
 *
 * Three tests, and all of them have to pass.
 *
 * It has to be *missing*: a task that already has a draft is finished work, and
 * regenerating it would quietly replace something the person may have edited by
 * hand. Nothing here ever overwrites.
 *
 * It has to be *close*: preparing a birthday three months out spends money on
 * words that will be rewritten, and fills the task with a draft nobody asked
 * for yet. The horizon is days, not weeks.
 *
 * And it has to be *possible*: a card needs a recipient, a breakdown needs a
 * title, research needs a step to research. Anything short of that is left
 * alone rather than half-done.
 *
 * ── Why it is capped ────────────────────────────────────────────────────────
 *
 * Every item is a model call somebody is paying for. A student who adds
 * twenty tasks on a Sunday night should not wake up to twenty calls' worth of
 * bill, so the queue is bounded and ordered by what is due soonest. The rest
 * waits for tomorrow, by which time it is closer and worth more.
 *
 * Pure, so `check:review` can walk it.
 */

import { addDays, parseISO } from 'date-fns';

import { toISODate } from '@/lib/dates';
import type { Task } from '@/store/aria-store';

/** What kind of preparation a task needs. */
export type WorkKind =
  /** Words to send: a card, a message, an email. */
  | 'draft'
  /** The steps a piece of work breaks into. */
  | 'breakdown';

export interface WorkItem {
  taskId: string;
  title: string;
  kind: WorkKind;
  /** The day it is for, so the queue can put the soonest first. */
  date: string;
}

/**
 * How far ahead to work.
 *
 * Three days is the window where preparing is useful and not presumptuous: far
 * enough that Friday's essay has its breakdown by Tuesday, near enough that
 * what Aria writes is about the thing as it stands now.
 */
export const WORK_AHEAD_DAYS = 3;

/**
 * How many items one pass may prepare.
 *
 * Each is a model call. Bounded so a busy week costs a predictable amount and
 * a corrupted task list cannot spend without limit.
 */
export const WORK_AHEAD_LIMIT = 4;

/** Methods whose whole point is words Aria can write in advance. */
const WRITES_SOMETHING = new Set(['sms', 'email', 'card', 'photo']);
/** Kinds whose value is the breakdown. */
const BREAKS_DOWN = new Set(['assignment', 'project']);

/**
 * Calendar days, through date-fns, never through `toISOString`.
 *
 * The first version added days to a local midnight and sliced the UTC string,
 * which is a day short anywhere east of Greenwich: 18 September at midnight in
 * London is the 17th in UTC, so the horizon quietly lost a day and Friday's
 * essay stopped being prepared. `toISODate` formats in local time, which is
 * what a calendar date means.
 */
function addDaysISO(date: string, days: number): string {
  return toISODate(addDays(parseISO(date), days));
}

/**
 * What is worth preparing right now, soonest first.
 *
 * `today` is the app's idea of today, so the simulated date drives this exactly
 * as it drives everything else.
 */
export function workAhead(tasks: Task[], today: string, limit = WORK_AHEAD_LIMIT): WorkItem[] {
  const horizon = addDaysISO(today, WORK_AHEAD_DAYS);
  const items: WorkItem[] = [];

  for (const task of tasks) {
    if (task.status !== 'todo') continue;
    if (task.date < today || task.date > horizon) continue;

    /*
     * A message that has no words yet, and somebody to send them to.
     *
     * The recipient check is what stops Aria writing a birthday card addressed
     * to nobody: without a name there is nothing to make it personal, and a
     * generic card is worse than an empty one, because it looks finished.
     */
    if (
      task.method &&
      WRITES_SOMETHING.has(task.method) &&
      !task.description?.trim() &&
      task.contactName?.trim()
    ) {
      items.push({ taskId: task.id, title: task.title, kind: 'draft', date: task.date });
      continue;
    }

    // Work with no steps yet. The breakdown is the thing Aria is for here, and
    // it is the slowest thing to sit down and do yourself.
    if (BREAKS_DOWN.has(task.kind) && task.subtasks.length === 0 && task.title.trim()) {
      items.push({ taskId: task.id, title: task.title, kind: 'breakdown', date: task.date });
    }
  }

  return items.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1)).slice(0, limit);
}

/**
 * What Aria says it did, once a pass is done.
 *
 * Reported rather than silent: work that appears with no explanation reads as
 * the app having changed something behind your back, which is the opposite of
 * what Pro is meant to feel like. Nothing prepared means nothing said.
 */
export function workAheadReport(done: WorkItem[]): string | null {
  if (!done.length) return null;
  const drafts = done.filter((d) => d.kind === 'draft').length;
  const breakdowns = done.length - drafts;
  const parts: string[] = [];
  if (drafts) parts.push(`${drafts} ${drafts === 1 ? 'message' : 'messages'} written`);
  if (breakdowns) parts.push(`${breakdowns} ${breakdowns === 1 ? 'plan' : 'plans'} broken down`);
  /*
   * Short enough to read at a glance, because that is all a toast gets.
   *
   * This used to end "Have a look when you get a minute", which is a sentence
   * that tells somebody nothing they did not already know and pushed the part
   * that matters, what was actually done, off the end of the pill. A toast is
   * read in about a second on the way to something else.
   */
  return `While you were away: ${parts.join(', ')}.`;
}
