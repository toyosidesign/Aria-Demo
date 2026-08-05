/**
 * A plan that ends before the deadline, not on it.
 *
 * ── Why the plan is built backwards ─────────────────────────────────────────
 *
 * Forwards planning answers "what shall I do first", which is not the question
 * a deadline asks. It produces a list that starts today, runs at a comfortable
 * pace and arrives late, and nothing in it ever says so. Working back from the
 * deadline answers the question that matters, *when does this have to start* , 
 * and the answer is sometimes "yesterday", which is worth knowing on the day
 * the work is set rather than the night before it is due.
 *
 * Three things fall out of that and are the whole of this module:
 *
 *   · the submission buffer is reserved first, before any work is placed, so
 *     it cannot be eaten by a plan that overruns. It is a visible row, because
 *     a buffer nobody can see is one they will schedule over;
 *   · time is shared out by what the work is marked on. A step serving a 40%
 *     criterion gets more days than one serving 10%, which is the difference
 *     between a plan and a list;
 *   · days already spoken for are stepped over rather than booked. A plan that
 *     puts three hours of reading on a day with two lectures is a plan that
 *     gets abandoned in week one.
 *
 * Pure, and importable without a React Native runtime, so `check:plan` can walk
 * every shape of it, including the ones nobody wants to reproduce by hand, a
 * deadline tomorrow and a deadline already gone.
 */

import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';

import { toISODate } from '@/lib/dates';

/** One row of the plan. A buffer is a row too, that is the point of it. */
export interface PlanStep {
  title: string;
  /** yyyy-MM-dd, the day this should be finished by. */
  due: string;
  /** Which criterion it serves, and what that is worth. Drives the share. */
  weight?: number;
  /** The reserved run-up to the deadline, rather than a piece of work. */
  buffer?: boolean;
  /** Struck through by the student. Kept, not deleted, see `strike`. */
  struck?: boolean;
}

export interface Plan {
  steps: PlanStep[];
  /** The day work has to start for this to fit. */
  startsOn: string;
  /** Days held back between the last step and the deadline. */
  bufferDays: number;
  /**
   * More steps than days. The plan is still returned, a compressed plan is
   * more useful than a refusal, but the screen says so, because the student
   * needs to decide what to cut rather than discover it in week three.
   */
  tight: boolean;
  /** The deadline is today or gone. Everything is due now; say so plainly. */
  late: boolean;
}

/**
 * How much run-up to reserve.
 *
 * A day for anything short, two once there is a fortnight to play with. Not
 * proportional: the buffer covers printing, uploading, a portal that rejects
 * the file type and a submission page that will not load, none of which get
 * worse because the essay was long.
 */
export function bufferFor(days: number): number {
  if (days <= 2) return 0; // there is nothing to reserve; say so honestly
  if (days <= 14) return 1;
  return 2;
}

export interface PlanRequest {
  /** yyyy-MM-dd. The moment everything must be finished before. */
  deadline: string;
  today: string;
  /** The work, in the order it has to happen. */
  steps: { title: string; weight?: number }[];
  /** Days already spoken for: lectures, shifts, other deadlines. */
  busy?: string[];
}

/**
 * Lay the steps out backwards from the deadline.
 *
 * Every step gets at least one day. Beyond that, days are shared by weight,
 * which is why the criteria matter: an extraction that found "Argument 40%,
 * Structure 10%" produces a different plan from one that found nothing, using
 * the same list of steps.
 */
export function planBackwards(req: PlanRequest): Plan {
  const steps = req.steps.filter((s) => s.title.trim());
  const totalDays = differenceInCalendarDays(parseISO(req.deadline), parseISO(req.today));

  // Nothing left to plan inside. Everything is due immediately, and the screen
  // says that rather than drawing a tidy schedule that has already expired.
  if (!steps.length || totalDays <= 0) {
    return {
      steps: steps.map((s) => ({ ...s, due: req.deadline })),
      startsOn: req.today,
      bufferDays: 0,
      tight: steps.length > 1,
      late: totalDays <= 0,
    };
  }

  const bufferDays = bufferFor(totalDays);
  // The last day work may land on. Reserved first, so an overrunning plan eats
  // into its own steps rather than into the run-up to submission.
  const lastWorkingDay = toISODate(addDays(parseISO(req.deadline), -bufferDays));
  const workingDays = differenceInCalendarDays(parseISO(lastWorkingDay), parseISO(req.today));

  const busy = new Set(req.busy ?? []);
  const tight = workingDays < steps.length;

  /*
   * Share the days out by weight, with a floor of one.
   *
   * The floor is what stops a 5% criterion being allocated nought days and
   * silently vanishing from a plan the student is relying on being complete.
   */
  const weights = steps.map((s) => (s.weight && s.weight > 0 ? s.weight : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, workingDays - steps.length);
  const spans = weights.map((w) => 1 + Math.floor((spare * w) / totalWeight));

  /*
   * Walk backwards, placing each step's end date and stepping over days that
   * are already spoken for.
   *
   * Backwards is not cosmetic: it makes the *first* step's date fall out of the
   * arithmetic rather than be chosen, and that date is the answer to the only
   * question a deadline actually asks.
   */
  const placed: PlanStep[] = [];
  let cursor = lastWorkingDay;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    let due = cursor;
    // Only worth avoiding a busy day while there is still room to move; on a
    // tight plan every day is needed and dodging would push work past today.
    let guard = 0;
    while (busy.has(due) && !tight && guard < 30 && due > req.today) {
      due = toISODate(addDays(parseISO(due), -1));
      guard += 1;
    }
    placed.unshift({ ...steps[i], due });
    cursor = toISODate(addDays(parseISO(due), -spans[i]));
    // Never plan into the past. Anything that would land there stacks on the
    // first available day, which is what makes an overloaded plan visibly
    // overloaded instead of quietly impossible.
    if (cursor < req.today) cursor = req.today;
  }

  if (bufferDays > 0) {
    placed.push({
      title: bufferDays === 1 ? 'Submission buffer: 1 day' : `Submission buffer: ${bufferDays} days`,
      due: req.deadline,
      buffer: true,
    });
  }

  return {
    steps: placed,
    startsOn: placed[0]?.due ?? req.today,
    bufferDays,
    tight,
    late: false,
  };
}

/**
 * Strike a step out, or put it back.
 *
 * Struck rather than deleted, because "I'm not doing that" is a decision worth
 * being able to see and reverse, and because a plan that quietly loses rows
 * when tapped is a plan nobody trusts to tap.
 */
export function strike(steps: PlanStep[], title: string): PlanStep[] {
  return steps.map((s) => (s.title === title ? { ...s, struck: !s.struck } : s));
}

/** What actually becomes the task's checklist: everything still standing. */
export function liveSteps(steps: PlanStep[]): PlanStep[] {
  return steps.filter((s) => !s.struck && !s.buffer);
}

// ── Catching up ──────────────────────────────────────────────────────────────

/** A step of a saved plan, as the task actually holds it. */
export interface DatedStep {
  id: string;
  title: string;
  done: boolean;
  due?: string;
  rollovers?: number;
}

export interface CatchUp {
  steps: DatedStep[];
  /** How many were behind and have been moved. */
  moved: number;
  /** True when the remaining work no longer fits before the deadline. */
  tight: boolean;
}

/**
 * Re-date a plan that has fallen behind.
 *
 * The second half of Pro, and the one people feel every week. A plan is correct
 * on the day it is made and wrong by Thursday, because life happened on
 * Tuesday: three steps sit in the past, the deadline has not moved, and the
 * dates on screen are now fiction. Left alone it stops being a plan and becomes
 * a list of reproaches.
 *
 * So the steps still to do are spread across the days that are actually left,
 * in the same order, with the submission buffer reserved exactly as it was when
 * the plan was built. Finished steps are never touched: they happened, and
 * their dates are a record rather than an intention.
 *
 * Every step that moves has its rollover counter incremented, which is what
 * feeds the Guide offer after two and the "is this still part of it?" question
 * after three. A plan that quietly re-dated itself forever would hide exactly
 * the signal those rules exist to catch.
 */
export function catchUp(steps: DatedStep[], today: string, deadline: string): CatchUp {
  const remaining = steps.filter((s) => !s.done);
  const behind = remaining.filter((s) => s.due && s.due < today);
  if (!behind.length) return { steps, moved: 0, tight: false };

  const plan = planBackwards({
    deadline,
    today,
    steps: remaining.map((s) => ({ title: s.title })),
  });
  // The buffer is reserved time, not a step, so it never lands on one.
  const dates = plan.steps.filter((s) => !s.buffer).map((s) => s.due);

  let i = 0;
  const next = steps.map((step) => {
    if (step.done) return step;
    const due = dates[i] ?? deadline;
    i += 1;
    if (step.due === due) return step;
    return {
      ...step,
      due,
      // Only the ones that were actually late count as rolled over. A step
      // shifted a day because an earlier one moved has not been avoided.
      rollovers: step.due && step.due < today ? (step.rollovers ?? 0) + 1 : step.rollovers,
    };
  });

  return { steps: next, moved: behind.length, tight: plan.tight || plan.late };
}

/** What Aria says after re-dating a plan. Counts, and the honest bad news. */
export function catchUpReport(result: CatchUp, title: string): string {
  if (!result.moved) return `"${title}" is on track.`;
  const n = result.moved;
  const moved = `${n} ${n === 1 ? 'step' : 'steps'} moved`;
  return result.tight
    ? `${moved} on "${title}", and it no longer fits before the deadline. Worth cutting something.`
    : `${moved} on "${title}" so it still lands before the deadline.`;
}

// ── Rollovers ────────────────────────────────────────────────────────────────

/**
 * A step that keeps moving is a message, not a scheduling problem.
 *
 * Rescheduling the same step for the third time and saying nothing is the
 * behaviour that makes a planner into a nag. Twice is where Aria offers to
 * help; three times is where it asks one question and then lets the step go.
 */
export const GUIDE_AFTER_ROLLOVERS = 2;
export const DROP_AFTER_ROLLOVERS = 3;

export interface RolloverVerdict {
  /** Offer the Guide, this is where people are actually stuck. */
  offerGuide: boolean;
  /** Ask the one question, then drop it. */
  askToDrop: boolean;
}

export function rolloverVerdict(rollovers: number): RolloverVerdict {
  return {
    offerGuide: rollovers >= GUIDE_AFTER_ROLLOVERS,
    askToDrop: rollovers >= DROP_AFTER_ROLLOVERS,
  };
}

/**
 * The question asked before a step is dropped.
 *
 * One question, and a real one, "is this still part of it?" can be answered
 * by someone avoiding the work, which is the state this exists to interrupt.
 * The two answers are both honest outcomes: it gets kept and guided, or it
 * goes and stops appearing.
 */
export function dropQuestion(title: string): string {
  return `"${title}" has moved three times. Is it still part of this, or should it go?`;
}
