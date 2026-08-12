/**
 * The Guide: what to do when the answer is "I don't know where to start".
 *
 * ── The rules it exists to keep ─────────────────────────────────────────────
 *
 * **Context first.** A guide that ignores the rubric is worse than none, so the
 * brief, the criteria and the scope go in before anything is generated. This is
 * why `GuideRequest` carries them and why the route refuses to invent around a
 * missing one, see `needsMore` below.
 *
 * **One narrowing question.** "I'm stuck" covers two different problems and the
 * answers to them look nothing alike: picking an angle is a choice, working out
 * what an angle has to prove is a rubric question. Asking once costs a tap and
 * changes what comes back; not asking produces four directions that half fit.
 *
 * **Directions and questions, never prose.** For an assignment, writing the
 * argument is the student's job, the Guide gives angles, the questions each
 * one has to answer, and where the rubric rewards it. A project has no such
 * constraint: a PM asking how to scope something should get a straight
 * recommendation, and hedging at them would be a worse product for no reason.
 *
 * **Nothing to go on is said out loud.** With no brief, no criteria and no
 * scope, four generic directions that fit any essay ever written are worse than
 * an admission, so Aria says it has nothing and asks for the single thing that
 * would help most.
 */

import type { BriefFacts } from '@/lib/brief';
import type { Learner } from '@/lib/learner';

export type GuideMode = 'assignment' | 'project';

/**
 * The one question asked before generating, and its two answers.
 *
 * Deliberately two, not a text box. The point is to split the request in half,
 * and someone who could describe precisely what they are stuck on would not
 * have needed the Guide.
 */
export const NARROWING: Record<GuideMode, { question: string; options: { value: string; label: string }[] }> = {
  assignment: {
    question: 'Stuck on picking an angle, or on what the angle needs to prove?',
    options: [
      { value: 'angle', label: 'Picking an angle' },
      { value: 'proof', label: 'What it needs to prove' },
    ],
  },
  project: {
    question: 'Stuck on what this should cover, or on what finished looks like?',
    options: [
      { value: 'scope', label: 'What it should cover' },
      { value: 'done', label: 'What finished looks like' },
    ],
  },
};

/**
 * One way forward, with its price attached.
 *
 * `needs` and `costs` are not decoration. A direction offered without them is a
 * suggestion; with them it is a decision the student can actually make, the
 * interesting angle that needs three sources they cannot get hold of is the
 * wrong one, and only the cost line says so.
 */
export interface GuideDirection {
  title: string;
  /** What taking it would require: sources, access, a decision, a tool. */
  needs: string;
  /** What it would cost: time, risk, what it rules out. */
  costs: string;
  /** Assignment only: which criterion this earns marks under. */
  rewardedBy?: string;
  /** The questions this direction has to answer to work. */
  questions?: string[];
}

export interface GuideRequest {
  mode: GuideMode;
  title: string;
  /** Which half of the narrowing question they picked. */
  focus: string;
  /** Assignment: everything the brief said, including the criteria. */
  facts?: BriefFacts;
  /** Project: what it is meant to achieve, and what is in and out. */
  definition?: string;
  scopeIn?: string[];
  scopeOut?: string[];
  /** Free text they added, "my tutor said the last one was too descriptive". */
  note?: string;
  learner?: Learner;
  /**
   * False for a Guide that may simply recommend.
   *
   * Set from who is asking rather than from the mode alone: the integrity rule
   * protects a student being marked, and a PM scoping their own project is not
   * being marked by anyone.
   */
  student?: boolean;
}

export type GuideResult =
  | { kind: 'directions'; directions: GuideDirection[]; fallback?: boolean }
  /** Nothing worth generating from. `ask` is the one thing that would help. */
  | { kind: 'needs'; ask: string; fallback?: boolean };

/**
 * Is there enough here to be worth generating from?
 *
 * A title alone is not. Every essay has a title and none of the directions you
 * could write from one would be about this essay, which is the failure this
 * whole module is built to avoid, so it is checked before the call rather than
 * hoped for after it.
 */
export function needsMore(req: GuideRequest): string | null {
  const hasBrief =
    Boolean(req.facts?.deliverable?.value?.trim()) ||
    Boolean(req.facts?.criteria?.items.length) ||
    Boolean(req.facts?.format?.value?.trim());
  const hasProject =
    Boolean(req.definition?.trim()) || Boolean(req.scopeIn?.length) || Boolean(req.scopeOut?.length);
  const hasNote = (req.note?.trim().length ?? 0) > 12;
  if (hasBrief || hasProject || hasNote) return null;
  return req.mode === 'assignment'
    ? "I've got the title and nothing else. Paste the assignment question, one line is enough, and I'll give you angles that actually fit it."
    : "I've got the name and nothing else. Tell me what it's for, or who it's for, and I'll come back with real options.";
}

/**
 * The offline guide.
 *
 * Structural rather than subject-specific, and honest about being so: these are
 * the four shapes an angle can take, phrased against whatever context we do
 * have. Better than nothing on a train, and it never pretends to have read the
 * brief, `fallback` is set so the screen can say where it came from.
 */
export function localGuide(req: GuideRequest): GuideDirection[] {
  const subject = req.title.trim() || 'this';
  const criterion = req.facts?.criteria?.items[0]?.label;
  if (req.mode === 'project') {
    return [
      {
        title: 'Cut it to the one outcome that matters',
        needs: 'A decision about which single result makes this worth doing',
        costs: 'Everything else moves to the out-list, and some of it was fun',
      },
      {
        title: 'Ship the thinnest version end to end',
        needs: 'The shortest path that touches every stage of it',
        costs: 'The first version will be visibly rough',
      },
      {
        title: 'Prove the risky part first',
        needs: 'Naming the part most likely to sink it',
        costs: 'Slower start; nothing to show for a while',
      },
      {
        title: 'Timebox it and take what you get',
        needs: 'A fixed date you will not move',
        costs: 'Scope becomes whatever fits, decided late',
      },
    ];
  }
  return [
    {
      title: `Take a position on ${subject} and defend it`,
      needs: 'Two or three sources that disagree with each other',
      costs: 'You have to commit early and stay consistent',
      rewardedBy: criterion ?? 'Argument',
      questions: ['What is the strongest case against you?', 'What evidence settles it?'],
    },
    {
      title: 'Compare two cases and explain the difference',
      needs: 'Two examples close enough to be comparable',
      costs: 'Half the words go on setting the comparison up',
      rewardedBy: criterion ?? 'Analysis',
      questions: ['What makes them comparable?', 'What does the difference prove?'],
    },
    {
      title: 'Test the standard explanation and find where it breaks',
      needs: 'The accepted account, and one case it does not fit',
      costs: 'Risky if the exception turns out to be minor',
      rewardedBy: criterion ?? 'Critical thinking',
      questions: ['Where exactly does it fail?', 'Does anything replace it?'],
    },
    {
      title: 'Trace how the question itself changed',
      needs: 'Sources from more than one period',
      costs: 'Descriptive unless you say why the change matters',
      rewardedBy: criterion ?? 'Context',
      questions: ['What caused the shift?', 'Who disagreed at the time?'],
    },
  ];
}
