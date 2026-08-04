/**
 * Setting a task up *in the conversation*, one question at a time.
 *
 * Chat used to parse a sentence, propose a card, and then hand the student to
 * `/task/new` to finish it — which is a form, reached by leaving the assistant
 * you were talking to. Everything the form asks, Aria can ask.
 *
 * ── Why a state machine, and why it lives here ──────────────────────────────
 *
 * The flow is deliberately pure: a draft, a step, and a function from one to
 * the next. No React, no store, no navigation. Two reasons.
 *
 * The order of questions is the product — "who, then do I have their number,
 * then when" is the difference between an assistant and an interrogation — and
 * that ordering is worth asserting in a test rather than discovering on a
 * phone. `scripts/checks/task-flow.ts` walks every kind end to end.
 *
 * And the steps are not the same for every kind. A birthday needs a person and
 * offers a card; an assignment needs neither and would look absurd asking whose
 * birthday it is. `nextStep` is the single place that knows, so the chat screen
 * renders whatever it is told to and holds no opinion of its own.
 */

import type { Priority, TaskKind, TaskMethod } from '@/store/aria-store';

/** What Aria is waiting for right now. */
export type FlowStep =
  | 'what' // the title, for anything that isn't about a person
  | 'explain' // offer to teach the topic before planning the work
  | 'approach' // how you want Aria to handle it, in your own words
  | 'plan' // the list of things to do, and drilling into any of them
  | 'who' // whose birthday / who the message is for
  | 'contact' // their number or email, if we can get it
  | 'date'
  | 'time'
  | 'priority'
  | 'alarm'
  | 'card' // a card, a plain message, or neither
  | 'cardStyle' // which card, shown as cards rather than named in a list
  | 'cardMessage' // what it should say, and whether Aria drafts it
  | 'preview' // read it back before anything is saved
  | 'done';

/** Everything collected so far. Every field optional — that is the point. */
export interface FlowDraft {
  kind: TaskKind;
  title?: string;
  who?: string;
  contactPhone?: string;
  contactEmail?: string;
  date?: string; // yyyy-MM-dd
  time?: string | null; // HH:mm, or null for "no particular time"
  priority?: Priority;
  /** Aria's explanation of the topic, when one was asked for. */
  explanation?: string;
  /** How you asked Aria to handle it: "work with me on a design system". */
  approach?: string;
  /** The things to do, as Aria broke them down from the title and approach. */
  checklist?: string[];
  /** Answers to anything drilled into, kept so they reach the saved task. */
  notes?: { title: string; content: string }[];
  alarm?: boolean;
  /**
   * How it goes out.
   *
   * Three answers, not a yes/no about a card. "No card" was being read as "no
   * message", so someone who wanted to text happy birthday had nowhere to say
   * so and the flow jumped to the preview with nothing to send.
   */
  delivery?: 'card' | 'message' | 'remind';
  cardTemplateId?: string;
  message?: string;
  /** Set once the student has answered, so a skipped step isn't asked again. */
  answered: Partial<Record<FlowStep, true>>;
}

/**
 * Kinds that are about a person.
 *
 * A birthday with no name is not a birthday, it's a date in a calendar — so
 * these ask who first and everything else hangs off the answer. Assignments and
 * projects are about a piece of work and never ask.
 */
const PERSON_KINDS: TaskKind[] = ['birthday', 'anniversary'];

/**
 * The opening question for a kind that isn't about a person.
 *
 * Phrased per kind rather than one generic "What is it?", because the answer
 * Aria wants is different each time: a reminder is a thing to be nudged about,
 * an assignment is a piece of work with a deadline.
 */
const KIND_OPENER: Record<TaskKind, string> = {
  general: 'What would you like me to take care of?',
  reminder: 'What should I remind you about?',
  event: "What's the event?",
  assignment: "What's the assignment called?",
  project: "What's the project?",
  birthday: "Who's this birthday for?",
  anniversary: 'Whose anniversary is it?',
};

/** Work with a deadline, which reads differently from an occasion. */
const WORK_KINDS: TaskKind[] = ['assignment', 'project'];

/**
 * Kinds worth planning out rather than just scheduling.
 *
 * A birthday is a date and a message; there is nothing to break down. A project
 * or a piece of work is the opposite — the breakdown *is* the value, and the
 * reason to bring it to an assistant at all.
 */
const PLANNING_KINDS: TaskKind[] = ['assignment', 'project', 'general'];

/** Kinds where a card is a natural thing to offer. */
const CARD_KINDS: TaskKind[] = ['birthday', 'anniversary'];

export function isPersonKind(kind: TaskKind): boolean {
  return PERSON_KINDS.includes(kind);
}

export function startFlow(kind: TaskKind): FlowDraft {
  return { kind, answered: {} };
}

/**
 * The next thing to ask, or 'preview' when there is nothing left.
 *
 * Driven by `answered` rather than by whether a field holds a value, because
 * "no, I don't want an alarm" and "I haven't been asked about an alarm" are
 * different states that both leave `alarm` falsy. Asking again because someone
 * said no is exactly the behaviour that makes assistants tiring.
 */
export function nextStep(d: FlowDraft): FlowStep {
  /*
   * Every kind is walked now, not just the two about people.
   *
   * The split used to be "birthdays get the guided setup, everything else gets
   * one question and a text box", which meant an assignment or a reminder fell
   * back to typing a sentence and hoping the parser understood it. The steps
   * still differ by kind — an essay has no card and no recipient — but the
   * shape is the same: Aria asks, you tap, nothing is typed that doesn't have
   * to be.
   */
  if (!isPersonKind(d.kind) && !d.answered.what) return 'what';
  /*
   * Offered before the scheduling questions, not after.
   *
   * Onboarding asks how someone wants things explained and what they are into,
   * and until now only subtask generation ever read the answer. An assignment
   * is where a student is most likely to be stuck on the topic rather than on
   * the deadline, so the offer belongs here, before Aria starts asking when it
   * is due.
   */
  if (WORK_KINDS.includes(d.kind) && !d.answered.explain) return 'explain';
  /*
   * Ask how it should be handled before breaking it down.
   *
   * A title alone produces a generic checklist. "Work with me on creating a
   * design system" is the sentence that makes the list worth reading, and it is
   * the one thing the old flow never asked for — it went straight from a name
   * to a date, so the plan Aria could have built never existed.
   */
  if (PLANNING_KINDS.includes(d.kind) && !d.answered.approach) return 'approach';
  if (PLANNING_KINDS.includes(d.kind) && !d.answered.plan) return 'plan';
  if (isPersonKind(d.kind) && !d.answered.who) return 'who';
  if (isPersonKind(d.kind) && !d.answered.contact) return 'contact';
  if (!d.answered.date) return 'date';
  if (!d.answered.time) return 'time';
  if (!d.answered.priority) return 'priority';
  if (!d.answered.alarm) return 'alarm';
  if (CARD_KINDS.includes(d.kind) && !d.answered.card) return 'card';
  // Which card, only once a card is what they picked.
  if (d.delivery === 'card' && !d.answered.cardStyle) return 'cardStyle';
  // Both a card and a plain message need words; a bare reminder does not.
  if (d.delivery && d.delivery !== 'remind' && !d.answered.cardMessage) return 'cardMessage';
  if (!d.answered.preview) return 'preview';
  return 'done';
}

/** What Aria says when it reaches a step. */
export function promptFor(step: FlowStep, d: FlowDraft): string {
  const who = d.who ?? 'them';
  switch (step) {
    case 'what':
      return KIND_OPENER[d.kind];
    case 'explain':
      return 'Want me to explain the topic first, in a way that fits how you learn?';
    case 'approach':
      return 'How would you like me to handle this? Tell me in your own words.';
    case 'plan':
      return d.checklist?.length
        ? 'Here is what I think this involves. Tap anything you want to dig into.'
        : 'Let me break this into the things it actually involves.';
    case 'who':
      return d.kind === 'anniversary'
        ? "Whose anniversary is it? Just the name is fine."
        : "Who's this birthday for?";
    case 'contact':
      return `Do you have ${who}'s contact? Pick them and I'll keep the details with the task.`;
    case 'date':
      if (d.kind === 'birthday') return `What date is ${who}'s birthday?`;
      if (d.kind === 'anniversary') return `What date is the anniversary?`;
      // Work has a deadline, not a date it sits on.
      if (WORK_KINDS.includes(d.kind)) return "When is it due?";
      return 'What date should I put this on?';
    case 'time':
      return WORK_KINDS.includes(d.kind)
        ? 'Any particular time it has to be in by?'
        : 'What time? Skip it if the day is enough.';
    case 'priority':
      return 'How much does this one matter?';
    case 'alarm':
      return WORK_KINDS.includes(d.kind)
        ? 'Want an alarm so it does not creep up on you?'
        : 'Do you want an alarm on the day?';
    case 'card':
      return `How should this reach ${who}? I can make a card, send a message, or just remind you.`;
    case 'cardStyle':
      return 'Which card?';
    case 'cardMessage':
      return d.delivery === 'card'
        ? `What should the card say? I can draft it if you'd rather.`
        : `What should the message say? I can draft it if you'd rather.`;
    case 'preview':
      return "Here's what I've got. Have a look before I save it.";
    case 'done':
      return 'Saved.';
  }
}

/** A short, human summary of an answer, for Aria to echo back. */
export function ackFor(step: FlowStep, d: FlowDraft): string | null {
  switch (step) {
    case 'what':
      return d.title?.trim() ? `"${d.title.trim()}", got it.` : null;
    case 'explain':
      return d.explanation ? null : "No problem, let's get it scheduled.";
    case 'approach':
      return d.approach?.trim() ? 'Got it.' : null;
    case 'plan':
      return d.checklist?.length ? `That's ${d.checklist.length} things to work through.` : null;
    case 'who':
      return d.who ? `${d.who}, got it.` : null;
    case 'contact':
      return d.contactPhone || d.contactEmail
        ? `Saved ${d.who ?? 'their'} details.`
        : "No contact then. I'll still remind you.";
    case 'priority':
      return null; // the chosen pill stays lit; saying it back adds nothing
    case 'alarm':
      return d.alarm ? "I'll chime on the day." : 'No alarm.';
    case 'card':
      if (d.delivery === 'card') return null; // the picker speaks for itself
      if (d.delivery === 'message') return `A message it is.`;
      return `No card then. I'll just remind you.`;
    default:
      return null;
  }
}

/** Title the task the way a person would write it. */
export function flowTitle(d: FlowDraft): string {
  if (d.title?.trim()) return d.title.trim();
  if (!isPersonKind(d.kind)) return 'Untitled task';
  const who = d.who?.trim();
  if (!who) return d.kind === 'anniversary' ? 'Anniversary' : 'Birthday';
  return d.kind === 'anniversary' ? `${who}'s anniversary` : `${who}'s birthday`;
}

/**
 * How Aria will handle it, from what was actually asked for.
 *
 * `card` only when they said yes to one — `defaultMethodFor` assumes a card for
 * every birthday, which would be wrong here: the whole flow just asked, and
 * overriding a stated "no" with a default is worse than never asking.
 */
/**
 * How each kind is handled when nothing else decides it.
 *
 * Mirrors `defaultMethodFor` in the store, restated here rather than imported
 * because that module pulls in AsyncStorage and the alarm layer, and this one
 * is deliberately importable without a React Native runtime — which is the
 * whole reason `npm run check:flow` can walk it. Kept in step by the check that
 * asserts an assignment saves as 'steps'.
 */
const KIND_METHOD: Record<TaskKind, TaskMethod> = {
  assignment: 'steps',
  project: 'steps',
  birthday: 'card',
  anniversary: 'photo',
  reminder: 'remind',
  event: 'remind',
  general: 'remind',
};

export function flowMethod(d: FlowDraft): TaskMethod {
  if (d.delivery === 'card') return 'card';
  if (d.delivery === 'remind') return 'remind';
  // A plain message goes by whichever channel we actually have for them.
  if (d.delivery === 'message') return d.contactPhone ? 'sms' : d.contactEmail ? 'email' : 'remind';
  /*
   * No delivery question was asked, which is every kind that isn't an occasion.
   *
   * This used to fall through to 'remind' for all of them, so an assignment set
   * up in chat was saved as a plain reminder — and the task screen keys its
   * whole breakdown feature off `method === 'steps'`, so the one thing Aria is
   * for on an assignment simply wasn't offered.
   */
  return KIND_METHOD[d.kind];
}

/** Everything `addTask` needs, once the preview is accepted. */
export function toTaskInput(d: FlowDraft): {
  title: string;
  date: string;
  priority: Priority;
  kind: TaskKind;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  method: TaskMethod;
  time?: string;
  alarm: boolean;
  cardTemplateId?: string;
  description?: string;
} {
  return {
    title: flowTitle(d),
    date: d.date!,
    // Asked for now, rather than assumed. It used to be hardcoded to medium,
    // so every task Aria set up came out the same weight regardless.
    priority: d.priority ?? 'medium',
    kind: d.kind,
    contactName: d.who?.trim() || undefined,
    contactPhone: d.contactPhone || undefined,
    contactEmail: d.contactEmail || undefined,
    method: flowMethod(d),
    time: d.time ?? undefined,
    alarm: Boolean(d.alarm),
    cardTemplateId: d.delivery === 'card' ? d.cardTemplateId : undefined,
    description: d.message?.trim() || undefined,
  };
}

/**
 * Everything Aria produced, as one readable document.
 *
 * Used for the copy saved onto the task and for the share sheet, so what leaves
 * the app and what stays in it are the same text. A plan nobody can get out of
 * the app is a plan they will rewrite somewhere else.
 */
export function flowDocument(d: FlowDraft): string {
  const parts: string[] = [];
  if (d.approach?.trim()) parts.push(`How I'm handling this\n${d.approach.trim()}`);
  if (d.explanation?.trim()) parts.push(`The topic\n${d.explanation.trim()}`);
  if (d.checklist?.length) {
    parts.push(`What this involves\n${d.checklist.map((i) => `- ${i}`).join('\n')}`);
  }
  for (const n of d.notes ?? []) parts.push(`${n.title}\n${n.content}`);
  return parts.join('\n\n');
}

/**
 * Steps answered by typing, which means answered in the composer.
 *
 * These used to render their own text box inside the panel, so the screen
 * offered two places to type the same answer, one of them directly above the
 * other. The composer is the one people already use, so the panel shows only
 * the choices that are not typing and the message goes to the flow instead of
 * the model.
 */
export const TYPED_STEPS: FlowStep[] = ['what', 'approach', 'who'];

export function isTypedStep(step: FlowStep): boolean {
  return TYPED_STEPS.includes(step);
}

/** Fold a typed answer into the draft for whichever step asked for it. */
export function applyTypedAnswer(step: FlowStep, text: string): Partial<FlowDraft> {
  const value = text.trim();
  if (step === 'what') return { title: value };
  if (step === 'approach') return { approach: value };
  if (step === 'who') return { who: value };
  return {};
}

/** Tone buttons offered after a draft, mirroring the task screen's rewrites. */
export const TONES: { label: string; instruction: string }[] = [
  { label: 'Warmer', instruction: 'Make it warmer and more personal.' },
  { label: 'Funnier', instruction: 'Make it funnier and more playful.' },
  { label: 'Shorter', instruction: 'Make it shorter, two sentences at most.' },
  { label: 'More formal', instruction: 'Make it more formal and restrained.' },
];
