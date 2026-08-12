/**
 * Whether a piece of work is actually finished enough to hand in.
 *
 * Pure, and importing only types, so the check suites can hold the rule without
 * a React Native runtime. Same reason as `lib/offline-answer.ts`.
 *
 * ── The assumption this exists to stop ──────────────────────────────────────
 *
 * Aria writes one section of a six-part project and then offers to schedule the
 * hand-in. Scheduling is the ending, and offering an ending to somebody who is
 * one sixth of the way through tells them, wrongly, that Aria thinks they are
 * done. At best it is noise. At worst they take the offer, set a date, and stop.
 *
 * Being finished is not a judgement call: the steps are either ticked off or
 * they are not, and something is either written or it is not. So the app can
 * simply know, and stop guessing.
 */

export interface Readiness {
  ready: boolean;
  /**
   * What is standing in the way, in words a person can act on.
   *
   * Counted rather than described. "Some steps are open" is the kind of thing
   * an app says when it does not really know; "2 of 6 steps are still open"
   * tells somebody how far off they are, which is the actual question.
   */
  blocker?: string;
}

export function handInReadiness(work: {
  subtasks?: { done: boolean }[];
  draftSections?: unknown[];
}): Readiness {
  const steps = work.subtasks ?? [];
  const open = steps.filter((s) => !s.done).length;

  if (steps.length && open) {
    return {
      ready: false,
      blocker: `${open} of ${steps.length} step${steps.length === 1 ? '' : 's'} still open`,
    };
  }

  /*
   * Nothing written counts as not ready even when every box is ticked.
   *
   * A plan can be checked off by somebody working outside the app, and the
   * document that goes out would then be empty. Ticked steps say the work
   * happened; sections say Aria has something to hand over.
   */
  if (!(work.draftSections?.length ?? 0)) {
    return { ready: false, blocker: 'nothing written yet' };
  }

  return { ready: true };
}
