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

import {
  BRIEF_SLOTS,
  briefGaps,
  briefSummary,
  priorityFromWeighting,
  type BriefFacts,
  type BriefSlot,
  type Confidence,
} from '@/lib/brief';
import { REPEAT_LABEL, type Repeat } from '@/lib/dates';
import { NARROWING, type GuideDirection, type GuideMode } from '@/lib/guide';
import { liveSteps, type PlanStep } from '@/lib/plan';
import type { Priority, TaskKind, TaskMethod } from '@/store/aria-store';

/**
 * The Guide, held on the draft rather than in the screen.
 *
 * It is reachable from the plan preview, the definition-of-done gate, a pinned
 * step and an offer after two rollovers, and it has to come back to whichever
 * of those opened it. Keeping `from` here is what makes that a property of the
 * flow — testable in `check:flow` — rather than four screens each remembering
 * where the user was.
 */
export interface GuideState {
  open: boolean;
  /** The step to return to when it closes. */
  from: FlowStep;
  /** Which half of the narrowing question they picked. */
  focus?: string;
  directions?: GuideDirection[];
  /** Set when there was nothing worth generating from: the one thing to add. */
  needs?: string;
  /** The direction they took, kept so it can flow back into the plan. */
  chosen?: GuideDirection;
  /** True when the directions came from the offline set. */
  fallback?: boolean;
}

/** What Aria is waiting for right now. */
export type FlowStep =
  | 'what' // the title, for anything that isn't about a person
  | 'approach' // how you want Aria to handle it, in your own words
  | 'plan' // the list of things to do, and drilling into any of them
  // ── Work: an assignment with a brief, or a project you scope yourself ──────
  | 'brief' // upload the brief, paste it, or fill it in yourself
  | 'extraction' // what the brief says, each fact with its confidence
  | 'commitments' // what the calendar already holds, and any fixed hours
  | 'definition' // the definition-of-done gate. Nothing renders until it's stated
  | 'reflect' // Aria says the intent back, and how sure it is
  | 'scope' // what's in, and the out-list they'll come back to
  | 'milestones' // each with a forcing function
  | 'planPreview' // the plan, backwards from the deadline. Accept lives here
  // ── The Guide, reachable from several of the above ────────────────────────
  | 'guideAsk' // the one narrowing question
  | 'guideDirections' // three or four ways forward
  | 'who' // whose birthday / who the message is for
  | 'contact' // the person, and whichever details the chosen method needs
  | 'date'
  | 'time'
  | 'repeat' // does it come back, and how often
  | 'priority'
  | 'alarm'
  | 'method' // how Aria should handle it: text, email, call, picture, card, remind
  | 'cardStyle' // which card, shown as cards rather than named in a list
  | 'photo' // the picture that goes out with it
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
  /** How often it comes back. Undefined once answered means "just the once". */
  repeat?: Repeat;
  priority?: Priority;
  /** Aria's explanation of the topic, when the Guide was asked for one. */
  explanation?: string;
  /** How you asked Aria to handle it: "work with me on a design system". */
  approach?: string;
  /** The things to do, as Aria broke them down from the title and approach. */
  checklist?: string[];

  // ── Work ───────────────────────────────────────────────────────────────────
  /** Where the brief came from, and what it said. */
  brief?: { source: 'upload' | 'paste' | 'manual'; name?: string; text?: string };
  /** What the brief actually asks for, each fact with its own confidence. */
  facts?: BriefFacts;
  /** True once an extraction has run, so an empty result reads as "nothing
   *  found" rather than as "not asked yet". */
  extracted?: boolean;
  /**
   * The gap they said they could answer themselves.
   *
   * Set by "I know this" on the extraction card, and the composer's next
   * message fills that one slot. Held on the draft rather than in the screen
   * because it changes what typing means, and that is a property of the flow.
   */
  pendingGap?: BriefSlot;
  /** Days between now and the deadline that are already spoken for. */
  busyDates?: string[];
  /** Weekdays that are always spoken for: lectures, a shift. 0 = Sunday. */
  fixedDays?: number[];
  /** The plan, laid out backwards from the deadline. */
  plan?: PlanStep[];
  /** What finished looks like. The project gate: nothing renders until it's set. */
  definition?: string;
  /**
   * They could not say what done looks like.
   *
   * Not a skip. Working it out becomes the first thing on the list, because a
   * project nobody can describe the end of is one that runs forever — and that
   * is the actual work, not a prerequisite to be waved past.
   */
  definitionDeferred?: boolean;
  /** Aria's reading of the intent, said back, with how sure it is. */
  reflect?: { text: string; confidence: Confidence };
  scopeIn?: string[];
  /** The list they will come back to. Kept, and kept visible. */
  scopeOut?: string[];
  milestones?: { title: string; due?: string; forcing?: string }[];
  /** The Guide, when it is open. See `nextStep` — it is a detour, not a step. */
  guide?: GuideState;
  /** Answers to anything drilled into, kept so they reach the saved task. */
  notes?: { title: string; content: string }[];
  alarm?: boolean;
  /**
   * How Aria handles it, in the words the question uses.
   *
   * This was a three-way `delivery` — card, message, or neither — which asked
   * the student to say "a message" and then guessed the channel from whichever
   * detail their contact happened to carry. An event that was always going to
   * be a phone call had no way to say so, and a text to someone whose card only
   * held an address silently became an email.
   *
   * Six answers now, because they are six different tasks: each one needs
   * something different from the contact (`METHOD_NEEDS`) and ends somewhere
   * different on the phone.
   */
  handling?: EventMethod;
  cardTemplateId?: string;
  /** The picture that goes out, for the Picture method. */
  photoUri?: string;
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
 * The three occasions that live under Event.
 *
 * They are one flow asking one sequence of questions, and differ only in how
 * they open: an event is described, a birthday and an anniversary belong to
 * someone. Everything after that — date, time, repeat, priority, how Aria
 * handles it — is the same for all three.
 *
 * Restated here rather than imported from `lib/aria-actions`, for the reason
 * given at `KIND_METHOD` below: that module reaches the store, and this one is
 * deliberately importable without a React Native runtime so `check:flow` can
 * walk it. `scripts/checks/task-flow.ts` asserts the two lists agree.
 */
const EVENT_KINDS: TaskKind[] = ['event', 'birthday', 'anniversary'];

export function isEventKind(kind: TaskKind): boolean {
  return EVENT_KINDS.includes(kind);
}

/** The six ways an event can be handled. */
export type EventMethod = 'sms' | 'email' | 'call' | 'photo' | 'card' | 'remind';

/**
 * The answers to "How should Aria handle it?", in the order they are offered.
 *
 * Reaching someone first, the plain reminder last — the list reads as "and if
 * none of those, just tell me", which is the one answer that needs nothing else
 * collected after it.
 */
export const EVENT_HANDLING: { value: EventMethod; label: string }[] = [
  { value: 'sms', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'photo', label: 'Picture' },
  { value: 'card', label: 'Card' },
  { value: 'remind', label: 'Just remind me' },
];

/** Whether a detail is needed, worth having, or not part of this method. */
export type Need = 'required' | 'optional' | 'none';

/**
 * What each way of handling it actually needs from the contact.
 *
 * Required means Aria cannot do the thing without it: there is no texting a
 * person with no number and no emailing one with no address. Optional means it
 * is worth keeping if the contact carries it and is never worth asking for —
 * the contact step only ever prompts for a detail that is `required` and
 * genuinely missing, which is what stops a card for your mother demanding her
 * email address.
 *
 * A call is the one that collapses: no name to type, no message to write, just
 * the number to ring.
 */
export const METHOD_NEEDS: Record<
  EventMethod,
  { name: Need; email: Need; phone: Need; message: boolean; picture: boolean; card: boolean }
> = {
  sms: { name: 'required', email: 'optional', phone: 'required', message: true, picture: false, card: false },
  email: { name: 'required', email: 'required', phone: 'optional', message: true, picture: false, card: false },
  call: { name: 'none', email: 'none', phone: 'required', message: false, picture: false, card: false },
  photo: { name: 'required', email: 'optional', phone: 'optional', message: true, picture: true, card: false },
  card: { name: 'required', email: 'optional', phone: 'optional', message: true, picture: false, card: true },
  remind: { name: 'none', email: 'none', phone: 'none', message: false, picture: false, card: false },
};

/** Does this method involve anyone at all? A bare reminder does not. */
export function needsContact(method: EventMethod): boolean {
  const n = METHOD_NEEDS[method];
  return n.name !== 'none' || n.phone !== 'none' || n.email !== 'none';
}

/**
 * Whether the contact step has enough to move on.
 *
 * Only the required details block. Everything else is kept if it came with the
 * person and never asked for, which is the whole point of picking someone from
 * the list rather than filling in a form about them.
 */
export function contactSatisfied(d: FlowDraft): boolean {
  if (!d.handling) return true;
  const needs = METHOD_NEEDS[d.handling];
  if (needs.name === 'required' && !d.who?.trim()) return false;
  if (needs.phone === 'required' && !d.contactPhone?.trim()) return false;
  if (needs.email === 'required' && !d.contactEmail?.trim()) return false;
  return true;
}

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
  // An event is described, not named: "Dinner at Sam's, his parents are over"
  // is what makes the rest of the flow worth asking, and a bare "What's the
  // event?" gets back one word.
  event: "What's this event? Tell me a bit about it.",
  assignment: "What's the assignment called?",
  project: "What's the project?",
  birthday: "Who's this birthday for?",
  anniversary: 'Whose anniversary is it?',
};

/**
 * Work with a deadline, which reads differently from an occasion.
 *
 * These two are the only kinds that run for days and end in a document, and
 * that is what makes them their own flow rather than a longer version of the
 * others: an occasion is one moment you prepare for, and a piece of work is a
 * plan you execute, fall behind on, and hand in.
 */
const WORK_KINDS: TaskKind[] = ['assignment', 'project'];

export function isWorkKind(kind: TaskKind): boolean {
  return WORK_KINDS.includes(kind);
}

/** Which Guide applies. An assignment is marked; a project is not. */
export function guideModeFor(kind: TaskKind): GuideMode {
  return kind === 'assignment' ? 'assignment' : 'project';
}

/**
 * Kinds worth planning out rather than just scheduling.
 *
 * Assignment and project used to be here. They have their own flows now —
 * a brief to read and a definition of done to state, neither of which is a
 * checklist question — and "Task" is what is left: something with no brief, no
 * marker and no deadline structure, where "how do you want me to handle it,
 * then let me break it down" is still exactly right.
 */
const PLANNING_KINDS: TaskKind[] = ['general'];

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
   * The Guide is a detour, and it is checked before anything else.
   *
   * It opens from the plan preview, from the definition-of-done gate, from a
   * pinned step and from the offer made after two rollovers — four places, one
   * behaviour, and it has to come back to whichever one opened it. Modelling it
   * as a step in the sequence would mean four different sequences; modelling it
   * as a flag with a return address means one.
   */
  if (d.guide?.open) {
    return d.guide.directions?.length || d.guide.needs ? 'guideDirections' : 'guideAsk';
  }
  if (isWorkKind(d.kind)) return nextWorkStep(d);
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
  if (!d.answered.date) return 'date';
  if (!d.answered.time) return 'time';
  /*
   * ── The Event flow ────────────────────────────────────────────────────────
   *
   * date → time → repeat → priority → how Aria handles it → whatever that
   * method needs. Stated by the product owner and written down in HANDOFF §4,
   * and the reason it is asserted in `check:flow` rather than left to be
   * rediscovered by tapping through a phone.
   *
   * Two things this order gets right that the old one did not.
   *
   * The recipient is asked for *after* the method, because the method is what
   * decides which of their details matter. Asking first meant collecting a name
   * and a number for something that turned out to be an email, and then asking
   * again for the address.
   *
   * And there is no alarm question. The occasion questions are the five above
   * and nothing else; "does it repeat" is the one people actually answer for a
   * birthday, and it earns its place where an alarm toggle did not.
   */
  if (isEventKind(d.kind)) {
    if (!d.answered.repeat) return 'repeat';
    if (!d.answered.priority) return 'priority';
    if (!d.answered.method) return 'method';
    const needs = d.handling ? METHOD_NEEDS[d.handling] : null;
    if (d.handling && needsContact(d.handling) && !d.answered.contact) return 'contact';
    // Which card, only once a card is what they picked.
    if (needs?.card && !d.answered.cardStyle) return 'cardStyle';
    if (needs?.picture && !d.answered.photo) return 'photo';
    // A card, a text, an email and a picture all need words. A call is made in
    // person and a bare reminder has nobody to say anything to.
    if (needs?.message && !d.answered.cardMessage) return 'cardMessage';
    if (!d.answered.preview) return 'preview';
    return 'done';
  }
  if (!d.answered.priority) return 'priority';
  if (!d.answered.alarm) return 'alarm';
  if (!d.answered.preview) return 'preview';
  return 'done';
}

/**
 * ── Assignment and Project ──────────────────────────────────────────────────
 *
 * Two orders, one shape: establish what the work actually is, then plan it,
 * then accept. What differs is where the truth comes from. An assignment has a
 * brief — somebody else has already written down the deliverable, the deadline
 * and the criteria, so Aria reads it and shows what it found. A project has
 * nobody's brief, so the equivalent step is stating what done looks like, and
 * that is a gate rather than a question: everything after it depends on the
 * answer, and a project with no end state cannot be planned, only worked on
 * forever.
 *
 *   assignment  brief → extraction → commitments → [date] → plan preview
 *   project     brief → definition → reflect → scope → milestones → plan preview
 *
 * The date question in brackets is asked only when the brief did not give a
 * deadline: with one, asking would be asking the student to repeat what they
 * just uploaded.
 *
 * Both end at the plan preview, which is where Accept lives — see
 * `WORK_ACCEPTS_AT`. There is no separate confirmation screen because the plan
 * *is* the confirmation: everything decided is visible in it, and a preview of
 * a preview is a tap that teaches nothing.
 */
export const WORK_ACCEPTS_AT: FlowStep = 'planPreview';

function nextWorkStep(d: FlowDraft): FlowStep {
  if (!d.answered.brief) return 'brief';
  // Uploading usually names the work. Only ask when it didn't, or when they
  // chose to fill it in themselves.
  if (!d.title?.trim() && !d.answered.what) return 'what';

  if (d.kind === 'assignment') {
    if (!d.answered.extraction) return 'extraction';
    if (!d.answered.commitments) return 'commitments';
    // No deadline in the brief and none given: there is nothing to plan
    // backwards from, so this is the one question that has to be asked.
    if (!workDeadline(d) && !d.answered.date) return 'date';
    if (!d.answered.planPreview) return 'planPreview';
    return 'done';
  }

  /*
   * The gate.
   *
   * `definition` is not answered by skipping it. The panel offers two ways
   * through — state it, or say you can't yet — and the second sets
   * `definitionDeferred`, which turns "work out what done looks like" into the
   * first thing on the plan. Either way something real was decided, which is
   * the difference between a gate and a required field.
   */
  if (!d.answered.definition) return 'definition';
  if (!d.answered.reflect) return 'reflect';
  if (!d.answered.scope) return 'scope';
  if (!d.answered.milestones) return 'milestones';
  // Milestones carry the dates for a project. With none, the task still needs
  // a day to sit on, so it gets the one question an assignment gets for free.
  if (!workDeadline(d) && !d.answered.date) return 'date';
  if (!d.answered.planPreview) return 'planPreview';
  return 'done';
}

/**
 * The date everything is working towards.
 *
 * An assignment's comes from the brief, and only counts when it resolved to an
 * actual day — "end of week 9" is a real thing for the card to show and a
 * useless thing to plan backwards from, so it is deliberately not accepted
 * here. A project's is its last milestone, which is the same idea arrived at
 * from the other end.
 */
export function workDeadline(d: FlowDraft): string | undefined {
  if (d.date) return d.date;
  const fromBrief = d.facts?.deadline?.value?.trim();
  if (fromBrief && /^\d{4}-\d{2}-\d{2}$/.test(fromBrief)) return fromBrief;
  const dated = (d.milestones ?? []).map((m) => m.due).filter(Boolean) as string[];
  if (dated.length) return dated.sort()[dated.length - 1];
  return undefined;
}

/**
 * Where the Guide can be opened from.
 *
 * Written down rather than left to each screen, because the whole point of the
 * Guide is that it is one thing. It appears in these places, wearing the same
 * icon and the same word every time; if it were a different control in each,
 * nobody would learn that it is the same door.
 *
 * The fifth place is not a step at all — anything rolled over twice offers it
 * automatically. That lives in `lib/plan.ts` with the rollover rules.
 */
export const GUIDE_STEPS: FlowStep[] = ['planPreview', 'definition', 'milestones', 'scope'];

export function guideAvailableAt(step: FlowStep): boolean {
  return GUIDE_STEPS.includes(step);
}

/** Open the Guide, remembering where to come back to. */
export function openGuide(d: FlowDraft, from: FlowStep): FlowDraft {
  return { ...d, guide: { open: true, from } };
}

/**
 * Close it, keeping what it produced.
 *
 * The chosen direction stays on the draft after the Guide closes: it is the
 * answer to "what am I actually doing", and the plan is rebuilt from it. A
 * Guide whose output vanished when you dismissed it would be a diversion rather
 * than part of the flow.
 */
export function closeGuide(d: FlowDraft): FlowDraft {
  if (!d.guide) return d;
  return { ...d, guide: { ...d.guide, open: false } };
}

/**
 * Questions that only exist because of an earlier answer.
 *
 * The handling method decides what gets asked after it, so changing it has to
 * take its dependents with it. Without this, answering "text" and then changing
 * to "email" at the preview kept `contact` marked answered — the flow skipped
 * straight past it holding a phone number, and `flowMethod` quietly downgraded
 * the whole thing to a reminder because there was no address to send to.
 */
const DEPENDENTS: Partial<Record<FlowStep, FlowStep[]>> = {
  method: ['contact', 'cardStyle', 'photo', 'cardMessage'],
};

/**
 * Re-open one answered step, and anything that hung off it.
 *
 * What was collected is deliberately kept — a message written for a card is a
 * reasonable starting point for the text it just became, and clearing it would
 * throw away work over a change of mind. Only the *answered* marks go, so the
 * questions get asked again.
 */
export function reopen(d: FlowDraft, step: FlowStep): FlowDraft {
  const answered: FlowDraft['answered'] = { ...d.answered };
  delete answered[step];
  delete answered.preview;
  for (const dependent of DEPENDENTS[step] ?? []) delete answered[dependent];
  return { ...d, answered };
}

/** What Aria says when it reaches a step. */
export function promptFor(step: FlowStep, d: FlowDraft): string {
  const who = d.who ?? 'them';
  switch (step) {
    case 'what':
      return KIND_OPENER[d.kind];
    case 'brief':
      return d.kind === 'assignment'
        ? 'Send me the brief and I\'ll read it. Or fill it in yourself if you\'d rather.'
        : "Tell me what this project is. Upload a brief if there is one.";
    case 'extraction':
      if (!d.extracted) return "Let me read it.";
      // Named honestly. "Here's what I found" over a card of five gaps reads as
      // a claim to have found something, which is the moment trust goes.
      return briefGaps(d.facts).length === BRIEF_SLOTS.length
        ? "I couldn't get anything definite out of that. Here's what's still missing."
        : "Here's what the brief says. Check anything I've marked as unsure.";
    case 'commitments':
      return 'What does your week already look like? I plan around it rather than over it.';
    case 'definition':
      /*
       * The one question worth blocking on.
       *
       * A project without a stated end is the thing people actually stall on —
       * not the tasks, the not-knowing-when-to-stop — so this is asked before
       * anything is scoped or scheduled, and "I can't say yet" is an honest
       * answer that becomes the first piece of work.
       */
      return "What does done look like? Nothing else works until that's decided.";
    case 'reflect':
      return "Here's what I think you're doing. Tell me where I've got it wrong.";
    case 'scope':
      return "What's in, and what are you deliberately not doing?";
    case 'milestones':
      return 'What are the checkpoints? Each one needs something that forces it to happen.';
    case 'planPreview':
      return d.kind === 'assignment'
        ? 'Here it is, working back from the deadline. Change anything, then accept.'
        : 'Here it is. Change anything, then accept.';
    case 'guideAsk':
      return NARROWING[guideModeFor(d.kind)].question;
    case 'guideDirections':
      if (d.guide?.needs) return d.guide.needs;
      return 'Four ways you could take this. Each one costs something different.';
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
      /*
       * Asked as "who am I texting", not "do you have their contact".
       *
       * By this point the method is chosen, so the question is about the person
       * rather than about the data — and naming the thing Aria is about to do
       * is what makes the required detail underneath it make sense. A number is
       * a strange thing to insist on until you know it is a text.
       */
      if (d.who?.trim()) {
        return `Have I got ${who}'s details? Pick them from your contacts and I'll fill in the rest.`;
      }
      switch (d.handling) {
        case 'sms':
          return "Who am I texting? Pick them and I'll keep their number with the task.";
        case 'email':
          return "Who am I emailing? Pick them and I'll keep their address with the task.";
        case 'call':
          return 'Who am I calling? The number is all I need.';
        case 'photo':
          return "Who's the picture for?";
        default:
          return "Who's the card for?";
      }
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
    case 'repeat':
      // A birthday comes back every year by definition, so the question is
      // really "every year, yes?" rather than an open one about intervals.
      return isPersonKind(d.kind)
        ? 'Should I bring this back every year?'
        : 'Does this repeat?';
    case 'priority':
      return 'How much does this one matter?';
    case 'alarm':
      return WORK_KINDS.includes(d.kind)
        ? 'Want an alarm so it does not creep up on you?'
        : 'Do you want an alarm on the day?';
    case 'method':
      return 'How should Aria handle it?';
    case 'cardStyle':
      return 'Which card?';
    case 'photo':
      return 'Which picture should go with it?';
    case 'cardMessage':
      if (d.handling === 'card') return `What should the card say? I can draft it if you'd rather.`;
      if (d.handling === 'email') return `What should the email say? I can draft it if you'd rather.`;
      if (d.handling === 'photo') return `What should go with the picture? I can draft it if you'd rather.`;
      return `What should the message say? I can draft it if you'd rather.`;
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
    case 'approach':
      return d.approach?.trim() ? 'Got it.' : null;
    case 'brief':
      if (d.brief?.source === 'upload') return `Got "${d.brief.name ?? 'the brief'}".`;
      if (d.brief?.source === 'paste') return 'Got it.';
      return null; // filling it in themselves: the next question says everything
    case 'extraction': {
      const missing = briefGaps(d.facts).length;
      if (!missing) return "That's the whole brief accounted for.";
      // Counted out loud, because the number is the point: one gap is a
      // question for the tutor, five means the brief was never really read.
      return missing === 1 ? "One thing still missing." : `${missing} things still missing.`;
    }
    case 'commitments':
      return d.busyDates?.length
        ? `I'll plan around the ${d.busyDates.length} days you've already got something on.`
        : null;
    case 'definition':
      return d.definitionDeferred
        ? "Then that's the first job: working out what done looks like."
        : null; // the reflect-back card is the acknowledgement
    case 'scope':
      return d.scopeOut?.length
        ? `Out: ${d.scopeOut.join(', ')}. I'll keep that where you can see it.`
        : null;
    case 'milestones': {
      const nulls = (d.milestones ?? []).filter((m) => !m.forcing?.trim()).length;
      if (!d.milestones?.length) return null;
      return nulls
        ? `${nulls} of those have nothing forcing them. Worth fixing before they slip.`
        : null;
    }
    case 'plan':
      return d.checklist?.length ? `That's ${d.checklist.length} things to work through.` : null;
    case 'who':
      return d.who ? `${d.who}, got it.` : null;
    case 'contact':
      return d.contactPhone || d.contactEmail
        ? `Saved ${d.who ?? 'their'} details.`
        : "No contact then. I'll still remind you.";
    case 'repeat':
      return d.repeat ? `${REPEAT_LABEL[d.repeat]}.` : 'Just the once.';
    case 'priority':
      return null; // the chosen pill stays lit; saying it back adds nothing
    case 'alarm':
      return d.alarm ? "I'll chime on the day." : 'No alarm.';
    case 'method':
      // The card and the picture both open a picker next, which says it better
      // than a sentence would. The rest are worth confirming out loud.
      switch (d.handling) {
        case 'sms':
          return "A text, then. I'll get it ready to send.";
        case 'email':
          return "An email, then. I'll get it ready to send.";
        case 'call':
          return "I'll line the call up for you.";
        case 'remind':
          return "Nothing to send — I'll just remind you.";
        default:
          return null;
      }
    case 'photo':
      return d.photoUri ? "Got the picture." : null;
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

/**
 * How Aria will handle it, from what was actually asked for.
 *
 * An answered event is taken at its word: `defaultMethodFor` assumes a card for
 * every birthday, which is right when nobody was asked and wrong here, because
 * the flow just asked. Overriding a stated answer with a default is worse than
 * never asking.
 */
export function flowMethod(d: FlowDraft): TaskMethod {
  if (d.handling) {
    /*
     * Except when we cannot address it.
     *
     * The contact step won't let a text through without a number, but a draft
     * can still arrive here short of one — an answer reopened from the preview
     * and cleared, or a flow saved from somewhere that skipped ahead. Saving it
     * as a text anyway promises a message Aria has nowhere to send, and the
     * offer card on Today would carry that promise all the way to the student.
     */
    if (!contactSatisfied(d)) return 'remind';
    return d.handling;
  }
  /*
   * No handling question was asked, which is every kind that isn't an event.
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
  repeat?: Repeat;
  cardTemplateId?: string;
  photoUri?: string;
  description?: string;
} {
  const method = flowMethod(d);
  return {
    title: flowTitle(d),
    /*
     * Work sits on its deadline, and the deadline was never a question.
     *
     * `d.date` is the answer to "when is it due", which an assignment only gets
     * asked when the brief did not say. Taking the deadline from the brief (or
     * from the last milestone, for a project) is what makes the upload worth
     * doing — see `workDeadline`.
     */
    date: (isWorkKind(d.kind) ? workDeadline(d) : d.date) ?? d.date!,
    // Asked for now, rather than assumed. It used to be hardcoded to medium,
    // so every task Aria set up came out the same weight regardless.
    // Work is the exception: the brief already said what it is worth, and a
    // 40% assignment is not the same job as a 5% problem sheet.
    priority: d.priority ?? (d.kind === 'assignment' ? priorityFromWeighting(d.facts) : 'medium'),
    kind: d.kind,
    contactName: d.who?.trim() || undefined,
    contactPhone: d.contactPhone || undefined,
    contactEmail: d.contactEmail || undefined,
    method,
    time: d.time ?? undefined,
    alarm: Boolean(d.alarm),
    repeat: d.repeat,
    // Both keyed off the method that is actually being saved, not off the one
    // that was picked at the time: change your mind from a card to a text and
    // the template id is stale, and a stale id draws the wrong card on Today.
    cardTemplateId: method === 'card' ? d.cardTemplateId : undefined,
    photoUri: method === 'photo' ? d.photoUri : undefined,
    description: d.message?.trim() || undefined,
  };
}

/**
 * The plan as the task's own checklist, dates and all.
 *
 * Struck rows and the submission buffer do not become steps: one was declined
 * and the other is reserved time rather than work. Everything else carries its
 * date, so a step knows when it was meant to happen — which is the whole
 * requirement for noticing that it didn't, and the reason `rollovers` starts
 * counting from zero here rather than being added later.
 *
 * A project's milestones come through the same door, with the forcing function
 * attached: "each needs a forcing function" is only enforceable if the thing
 * that forces it travels with it to the task.
 */
export function flowSteps(d: FlowDraft): { title: string; due?: string; forcing?: string }[] {
  if (d.kind === 'project') {
    const first = d.definitionDeferred
      ? [{ title: 'Work out what done looks like' }]
      : [];
    return [
      ...first,
      ...(d.milestones ?? [])
        .filter((m) => m.title.trim())
        .map((m) => ({ title: m.title.trim(), due: m.due, forcing: m.forcing?.trim() || undefined })),
    ];
  }
  return liveSteps(d.plan ?? []).map((s) => ({ title: s.title, due: s.due }));
}

/**
 * The step that gets pinned: the first one still to do.
 *
 * Pinned rather than merely first, because an assignment created and then left
 * alone looks identical to one finished — the task row shows a title and a date
 * either way. One live step on the front of it is the difference between a list
 * entry and something in progress.
 */
export function pinnedStep(d: FlowDraft): string | undefined {
  return flowSteps(d)[0]?.title;
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
  const brief = briefSummary(d.facts);
  if (brief) parts.push(`The brief\n${brief}`);
  if (d.definition?.trim()) parts.push(`Done means\n${d.definition.trim()}`);
  if (d.scopeIn?.length) parts.push(`In scope\n${d.scopeIn.map((i) => `- ${i}`).join('\n')}`);
  /*
   * The out-list is in the document, not just on the screen.
   *
   * It is the one people come back to — three weeks in, when the thing they
   * decided not to do starts looking necessary again, the useful artefact is
   * the sentence saying they already decided. That only helps if it survives
   * the setup conversation.
   */
  if (d.scopeOut?.length) parts.push(`Deliberately not doing\n${d.scopeOut.map((i) => `- ${i}`).join('\n')}`);
  if (d.guide?.chosen) {
    const g = d.guide.chosen;
    parts.push(
      [
        `The direction I'm taking`,
        g.title,
        `Needs: ${g.needs}`,
        `Costs: ${g.costs}`,
        g.rewardedBy ? `Marks under: ${g.rewardedBy}` : '',
        g.questions?.length ? `Has to answer:\n${g.questions.map((q) => `- ${q}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  if (d.explanation?.trim()) parts.push(`The topic\n${d.explanation.trim()}`);
  if (d.checklist?.length) {
    parts.push(`What this involves\n${d.checklist.map((i) => `- ${i}`).join('\n')}`);
  }
  const milestones = (d.milestones ?? []).filter((m) => m.title.trim());
  if (milestones.length) {
    parts.push(
      `Milestones\n${milestones
        .map((m) => `- ${m.title}${m.due ? ` (${m.due})` : ''}${m.forcing ? ` — forced by: ${m.forcing}` : ''}`)
        .join('\n')}`,
    );
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
export const TYPED_STEPS: FlowStep[] = ['what', 'approach', 'who', 'definition', 'brief'];

export function isTypedStep(step: FlowStep): boolean {
  return TYPED_STEPS.includes(step);
}

/** Fold a typed answer into the draft for whichever step asked for it. */
export function applyTypedAnswer(step: FlowStep, text: string): Partial<FlowDraft> {
  const value = text.trim();
  if (step === 'what') return { title: value };
  if (step === 'approach') return { approach: value };
  if (step === 'who') return { who: value };
  // Typed rather than tapped, because it is prose and nobody else can write it.
  // The gate is what makes it worth a keyboard.
  if (step === 'definition') return { definition: value, definitionDeferred: false };
  /*
   * Pasting the brief is the same answer as uploading it.
   *
   * Half the briefs that exist are a paragraph in a group chat rather than a
   * PDF on a VLE, so the composer accepts one — and a project describing itself
   * in a sentence arrives through exactly the same door.
   */
  if (step === 'brief') return { brief: { source: 'paste', text: value } };
  return {};
}

/**
 * A title from the first thing they wrote.
 *
 * A project described in a paragraph should not then be asked what to call it —
 * the first clause is what they would have typed anyway. Cut at a sentence
 * ending or a comfortable length, whichever comes first.
 */
export function titleFromText(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? '';
  if (!first) return '';
  if (first.length <= 60) return first;
  const cut = first.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * How sure Aria is that it understood the project.
 *
 * Computed from what it actually had to work with, not claimed by the model
 * about itself. A definition of done, a scope and a brief is a reading worth
 * trusting; a one-line description is a guess, and the card says so — which is
 * the point of showing a confidence at all on a card whose whole job is to be
 * corrected.
 */
export function reflectConfidence(d: FlowDraft): Confidence {
  let signal = 0;
  if ((d.definition?.trim().length ?? 0) > 40) signal += 2;
  else if (d.definition?.trim()) signal += 1;
  if (d.scopeIn?.length) signal += 1;
  if (d.scopeOut?.length) signal += 1;
  if (d.brief?.text?.trim() || d.brief?.name) signal += 1;
  if ((d.title?.trim().length ?? 0) > 12) signal += 1;
  if (signal >= 4) return 'high';
  if (signal >= 2) return 'medium';
  return 'low';
}

/** Tone buttons offered after a draft, mirroring the task screen's rewrites. */
export const TONES: { label: string; instruction: string }[] = [
  { label: 'Warmer', instruction: 'Make it warmer and more personal.' },
  { label: 'Funnier', instruction: 'Make it funnier and more playful.' },
  { label: 'Shorter', instruction: 'Make it shorter, two sentences at most.' },
  { label: 'More formal', instruction: 'Make it more formal and restrained.' },
];
