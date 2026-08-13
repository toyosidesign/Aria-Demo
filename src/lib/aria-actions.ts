import type { Source } from '@/lib/source';
import { defaultMethodFor, type Task, type TaskKind, type TaskMethod } from '@/store/aria-store';
import { postJson } from '@/lib/api-client';
import type { Learner } from '@/lib/learner';

export type AriaActionType = 'message' | 'assignment';

export interface AriaAction {
  type: AriaActionType;
  /** One-line offer Aria makes ("Want me to draft…?"). */
  offer: string;
  /** Button label to accept. */
  cta: string;
  /** Whether the flow includes the "approve opening your contacts" gate + send. */
  needsSend: boolean;
  /** Verb used in the chat ("draft a birthday message"). */
  drafting: string;
  /** Selected handling method. */
  method?: TaskMethod;
  /** Assignment with subtasks Aria should walk through one at a time. */
  walkthrough?: boolean;
  /** Nothing left to write, go straight to choosing how it goes out. */
  readyToSend?: boolean;
}

const SENDER = 'Maya';
export const ARIA_SENDER = SENDER;

// ---- Methods ----

export type MessageMethod = 'sms' | 'email' | 'card' | 'photo' | 'call';
const MESSAGE_SET = new Set<TaskMethod>(['sms', 'email', 'card', 'photo', 'call']);
export function isMessageMethod(m?: TaskMethod): m is MessageMethod {
  return !!m && MESSAGE_SET.has(m);
}

export interface MethodMeta {
  label: string; // 'Text'
  short: string; // 'text'
  app: string; // 'Messages'
  sentPast: string; // 'Texted'
}

export const METHOD_META: Record<MessageMethod, MethodMeta> = {
  sms: { label: 'Text', short: 'text', app: 'Messages', sentPast: 'Texted' },
  email: { label: 'Email', short: 'email', app: 'Mail', sentPast: 'Emailed' },
  card: { label: 'Card', short: 'card', app: 'Mail or WhatsApp', sentPast: 'Sent a card to' },
  photo: { label: 'Picture', short: 'picture', app: 'your apps', sentPast: 'Shared a picture with' },
  call: { label: 'Call', short: 'call', app: 'Phone', sentPast: 'Ready to call' },
};

/** Human labels for every handling method (used by the Create-task selector). */
export const METHOD_LABELS: Record<TaskMethod, string> = {
  sms: 'Text',
  email: 'Email',
  card: 'Card',
  photo: 'Picture',
  call: 'Call',
  steps: 'Step by step',
  outline: 'Outline',
  draft: 'Draft it',
  remind: 'Just remind me',
  plan: 'Plan the steps',
};

/** Which handling options to offer for a given kind/contact in the Create screen.
 *  Text and Email are on every list: any task can end in a message Aria drafts
 *  and hands off to Messages or Mail. */
export const MESSAGE_METHODS: TaskMethod[] = ['sms', 'email', 'card', 'photo', 'call'];

/**
 * What an event can end in, general, birthday or anniversary alike.
 *
 * Narrower than a plain task's list on purpose: an occasion is marked by
 * reaching someone, so drafting notes and planning steps have no place here.
 */
export const EVENT_METHODS: TaskMethod[] = ['sms', 'email', 'call', 'photo', 'card', 'remind'];
/**
 * What a piece of work can be handled as, and the three that are gone.
 *
 * `remind`, `email` and `sms` were on this list, and none of them describe
 * handling an assignment. "Just remind me" is a reminder, and picking it turned
 * an essay into a nudge with the breakdown switched off, which is the one thing
 * Aria is useful for here. Email and text are ways of reaching a person, and the
 * person an assignment goes to is a submission portal, not a contact.
 *
 * What is left is three genuinely different amounts of help: work through it
 * with me, give me the shape of it, or write a first pass I will rework.
 */
export const ASSIGNMENT_METHODS: TaskMethod[] = ['steps', 'outline', 'draft'];
export const TASK_METHODS: TaskMethod[] = [
  'remind',
  'plan',
  'draft',
  'sms',
  'email',
  'card',
  'photo',
  'call',
];

/**
 * Top-level categories in the Create screen.
 *
 * Birthday and anniversary aren't peers of "Event", they're occasions *of* an
 * event, so they sit underneath it rather than crowding the top row. The kinds
 * themselves stay distinct in the model, because each one changes how Aria
 * handles it: a birthday defaults to a card, an anniversary to a message.
 */
export const CATEGORY_KINDS: { value: TaskKind; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
];

/**
 * One line under each category, because two of them are indistinguishable
 * without it.
 *
 * "Assignment" and "Project" are the same word to anyone who has not used the
 * app: both are big, both take weeks, and the tile gives no way to tell which
 * one you want. The distinction that actually decides it is where the
 * requirements come from, somebody else wrote them down, or you are writing
 * them yourself, so that is what the line says.
 *
 * The other two are here for symmetry: a row where only half the tiles are
 * explained reads as though the explained ones are the complicated ones.
 */
export const CATEGORY_BLURB: Record<TaskKind, string> = {
  event: 'A date with someone at the other end',
  reminder: 'A nudge at the right moment',
  assignment: 'Coursework with a brief and a deadline',
  project: "Work you're scoping yourself",
  birthday: 'Someone’s birthday, with a card or a message',
  anniversary: 'An anniversary worth marking',
  general: 'Anything else you want handled',
};

/*
 * 'general' is deliberately absent from the list above, and deliberately still
 * a `TaskKind`.
 *
 * "Task" as a category next to Event and Assignment was a catch-all that said
 * nothing about how Aria should handle the thing, which is the only reason the
 * category exists. Removing it from the picker stops new ones being made.
 *
 * The kind itself stays in the model because tasks already carry it, the demo
 * seed included. Dropping it from the type would leave those rows referring to
 * a category the app no longer understands, which breaks the icon, the method
 * list and the Aria action for every one of them.
 */

/**
 * What the title field asks for, and an example of an answer.
 *
 * Both were fixed strings: "What needs doing?" over "e.g. Wish Jane a happy
 * birthday", shown unchanged when the category was Assignment. A worked example
 * is the most useful thing on a blank form and the least useful when it belongs
 * to a different kind of thing entirely.
 *
 * Phrased for a form, not for the chat. `KIND_OPENER` in lib/task-flow.ts asks
 * the same questions conversationally, and the two registers are deliberately
 * separate: a label is not a sentence Aria says.
 */
export const TITLE_FIELD: Record<TaskKind, { label: string; example: string }> = {
  event: { label: "What's the event?", example: 'e.g. Dinner with Sam' },
  reminder: { label: 'What should I remind you about?', example: 'e.g. Take the bins out' },
  assignment: { label: "What's the assignment?", example: 'e.g. History essay on the Cold War' },
  project: { label: "What's the project?", example: 'e.g. Group presentation on rent controls' },
  birthday: { label: 'Whose birthday is it?', example: 'e.g. Wish Jane a happy birthday' },
  anniversary: { label: 'Whose anniversary is it?', example: "e.g. Mum and Dad's anniversary" },
  general: { label: 'What needs doing?', example: 'e.g. Book the dentist' },
};

/** Everything that lives under the Event category. */
export const EVENT_KINDS: TaskKind[] = ['event', 'birthday', 'anniversary'];

export const EVENT_OCCASIONS: { value: TaskKind; label: string }[] = [
  { value: 'event', label: 'General' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
];

export function isEventKind(kind: TaskKind): boolean {
  return EVENT_KINDS.includes(kind);
}

/** The full set of task categories, shown in the chat's focus chips. */
export const TASK_KINDS: { value: TaskKind; label: string }[] = [
  { value: 'general', label: 'Task' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'event', label: 'Event' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
];

/**
 * What Aria says the moment a category is chosen.
 *
 * Picking a chip used to do nothing visible, it set a parse hint and changed
 * the placeholder, so the burden of knowing what to say next stayed with the
 * student, in a chat where Aria had just gone quiet. Each of these names the
 * one thing that category needs, so the reply can be a fragment ("Sam, next
 * Tuesday") rather than a whole sentence.
 *
 * Phrased as a question Aria asks, not an instruction to the user: this is a
 * conversation, and "What shall I remind you about?" invites an answer in a way
 * that "Enter reminder details" does not.
 */
export const KIND_PROMPT: Record<TaskKind, string> = {
  general: 'What would you like me to take care of?',
  reminder: 'What shall I remind you about, and when?',
  event: "What's the event, and when is it?",
  birthday: 'Whose birthday is it, and what date?',
  anniversary: 'Whose anniversary, and what date?',
  assignment: "What's the assignment, and when is it due?",
  project: "What's the project, and when is it due?",
};

const ASSIGNMENT_KINDS: TaskKind[] = ['assignment', 'project'];
const TASKLIKE_KINDS: TaskKind[] = ['general', 'event', 'reminder'];

/**
 * Handling options for a category.
 *
 * Deliberately independent of whether a contact has been filled in: it's the
 * chosen method that decides whether there's anyone to contact, not the other
 * way round. Deriving this from the contact meant typing a name silently
 * removed "Just remind me" from the list.
 */
export function methodOptionsFor(kind: TaskKind): TaskMethod[] {
  if (ASSIGNMENT_KINDS.includes(kind)) return ASSIGNMENT_METHODS;
  if (isEventKind(kind)) return EVENT_METHODS; // event, birthday, anniversary
  // A reminder is the one category with nothing to decide: there's nothing to
  // draft, plan or send, only a nudge at the right moment.
  if (kind === 'reminder') return ['remind'];
  return TASK_METHODS; // general task
}

function aOrAn(noun: string) {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

// ---- Action engine ----

function messageAction(task: Task, who: string | undefined): AriaAction {
  const method: MessageMethod = isMessageMethod(task.method)
    ? task.method
    : task.kind === 'birthday'
      ? 'card'
      : 'sms';
  const meta = METHOD_META[method];
  const occasion = task.kind === 'birthday' ? 'birthday' : task.kind === 'anniversary' ? 'anniversary' : '';
  const forWho = who ? ` for ${who}` : '';

  const noun = `${occasion} ${meta.short}`.trim();

  /*
   * A card is always a reminder to send, never an offer to write.
   *
   * The message is authored when the task is created now, the create screen
   * gives cards, pictures, texts and emails the same drafting field, so by the
   * time this card reaches Today there is nothing left to write. It used to
   * check whether anything had been written and fall back to "Draft the text"
   * if not, which was right when drafting happened afterwards and is now just a
   * second chance to do a job already done.
   *
   * The send sheet still shows the message and still lets it be edited there,
   * so an empty one is not a dead end.
   */
  if (method === 'card') {
    return {
      type: 'message',
      method,
      offer: who
        ? `Your card for ${who} is written and ready. Want to send it?`
        : 'Your card is written and ready. Want to send it?',
      cta: 'Send it',
      needsSend: true,
      readyToSend: true,
      drafting: `the card${forWho}`,
    };
  }
  if (method === 'photo' && !!task.photoUri) {
    return {
      type: 'message',
      method,
      offer: who
        ? `Your picture and message for ${who} are ready. Want to share them?`
        : 'Your picture and message are ready. Want to share them?',
      cta: 'Share it',
      needsSend: true,
      readyToSend: true,
      drafting: `the message${forWho}`,
    };
  }

  /*
   * Written already? Then this is a send, not a draft.
   *
   * The same rule the card branch above follows, and it belongs here too: the
   * create screen now gives texts and emails the same drafting field, so by the
   * time one of these reaches Today the message usually exists. Offering to
   * write it again suggests Aria is about to replace what was already decided,
   * and hides the only thing actually left to do.
   */
  if (task.description?.trim()) {
    return {
      type: 'message',
      method,
      offer: who
        ? `Your ${meta.short} for ${who} is written and ready. Want to send it?`
        : `Your ${meta.short} is written and ready. Want to send it?`,
      cta: 'Send it',
      needsSend: true,
      readyToSend: true,
      drafting: `the ${meta.short}${forWho}`,
    };
  }

  return {
    type: 'message',
    method,
    offer: who
      ? `Want me to draft ${aOrAn(noun)}${forWho} and send it?`
      : `Want me to draft ${aOrAn(noun)}?`,
    cta: `Draft the ${meta.short}`,
    needsSend: true,
    drafting: `${aOrAn(noun)}${forWho}`,
  };
}

function assignmentAction(task: Task): AriaAction | null {
  const method = task.method ?? 'steps';
  if (method === 'remind') return null;

  const pending = task.subtasks.filter((s) => !s.done);
  const done = task.subtasks.length - pending.length;

  /*
   * Whether this is a beginning or a return.
   *
   * Coming back to a piece of work you are already halfway through and being
   * asked "want me to work through this with you?" is Aria failing to remember
   * the last two hours. The offer has to know the difference, and it can: parts
   * are ticked off, or something has been written, or neither has happened yet.
   */
  const started = done > 0 || (task.draftSections?.length ?? 0) > 0;

  if (method === 'steps' && pending.length > 0) {
    return {
      type: 'assignment',
      method,
      walkthrough: true,
      offer: started
        ? `${done} of ${task.subtasks.length} parts done. Next up: “${pending[0].title}.”`
        : `Want me to work through this with you, part by part? First up: “${pending[0].title}.”`,
      cta: started ? 'Continue' : 'Work through it',
      needsSend: false,
      drafting: `the “${pending[0].title}” section`,
    };
  }
  if (method === 'draft') {
    return {
      type: 'assignment',
      method,
      offer: started
        ? 'We have a draft going. Want to pick it back up?'
        : 'Want me to write a full first draft?',
      cta: started ? 'Continue' : 'Write a draft',
      needsSend: false,
      drafting: 'a full first draft',
    };
  }
  // outline, or "steps" with no subtasks yet
  return {
    type: 'assignment',
    method,
    offer: started
      ? 'We made a start on this. Want to pick it back up?'
      : 'Want me to draft a starting outline for this?',
    cta: started ? 'Continue' : 'Draft an outline',
    needsSend: false,
    drafting: 'a starting outline',
  };
}

function taskAction(task: Task): AriaAction | null {
  const method = task.method ?? 'remind';
  if (method === 'remind') return null;

  if (method === 'plan') {
    return {
      type: 'assignment',
      method,
      offer: 'Want me to break this into a few clear steps?',
      cta: 'Plan the steps',
      needsSend: false,
      drafting: 'a short step-by-step plan',
    };
  }
  // draft a note
  return {
    type: 'assignment',
    method,
    offer: 'Want me to draft a note to get this started?',
    cta: 'Draft a note',
    needsSend: false,
    drafting: 'a quick note',
  };
}

/**
 * Decide what Aria proactively offers for a task. Returns null when there's
 * nothing to do beyond a plain reminder.
 */
export function ariaActionFor(task: Task): AriaAction | null {
  const who = task.contactName;
  // A call needs no drafting: there's nothing to write and Aria can't place it.
  // The task detail shows a reminder and a shortcut to the dialer instead.
  if (task.method === 'call') return null;
  // Text / email / card is a message flow whatever the category is, an
  // assignment can just as easily end in an email to a professor.
  if (isMessageMethod(task.method)) return messageAction(task, who);
  switch (task.kind) {
    case 'birthday':
    case 'anniversary':
      return messageAction(task, who);
    case 'assignment':
    case 'project':
      return assignmentAction(task);
    case 'event':
    case 'reminder':
    case 'general':
      return who ? messageAction(task, who) : taskAction(task);
  }
}

/** Title for the saved draft block, based on how Aria handled it. */
export function draftSectionTitle(method?: TaskMethod): string {
  if (method === 'draft') return 'Draft';
  if (method === 'plan') return 'Plan';
  return 'Outline';
}

// ---- Shared contract with the /api/draft server route ----

export interface DraftRequest {
  kind: TaskKind;
  title: string;
  description?: string;
  contactName?: string;
  method?: TaskMethod;
  /** When set, draft just this section/subtask of an assignment. */
  subtaskTitle?: string;
  /** Research help: return notes/key points for the subtask rather than prose. */
  research?: boolean;
  /** Explain the topic, using how this student said they learn best. */
  explain?: boolean;
  /**
   * Say the intent back rather than write anything new.
   *
   * The project flow's reflect-back card. Mechanically it is a draft, short
   * text from the model about this piece of work, so it reuses this route
   * rather than adding a third one, and prompts, fallbacks and the key check
   * stay in one place. What it must never do is add: a reflection that quietly
   * invents a goal is worse than none, because the card exists to be agreed
   * with, and agreeing with an invention is how a project ends up scoped
   * around something nobody asked for.
   */
  reflect?: boolean;
  learner?: Learner;
  senderName?: string;
  /** One line on who the sender is, so drafts match how they'd write. */
  senderContext?: string;
  /** Rewrite instruction, e.g. "make it warmer and shorter". */
  instruction?: string;
  previousDraft?: string;
}

export interface DraftResponse {
  message: string;
  /** True when the server returned a scripted fallback (no API key / error). */
  fallback?: boolean;
  /** Set when the notes were researched: the pages behind them. */
  sources?: Source[];
  /**
   * Whether a search actually ran.
   *
   * Distinct from having sources: a model can search and cite nothing, and it
   * can decline to search at all. The Research screen says different things in
   * those two cases, because "I looked this up" has to be true when it is said.
   */
  searched?: boolean;
}

/** Client helper: call the server route, with a local fallback if it fails. */
export async function requestDraft(req: DraftRequest): Promise<DraftResponse> {
  try {
    const res = await postJson('/api/draft', req);
    if (!res.ok) throw new Error(`draft failed: ${res.status}`);
    const data = (await res.json()) as DraftResponse;
    if (!data?.message) throw new Error('empty draft');
    return data;
  } catch {
    return { message: localFallbackDraft(req), fallback: true };
  }
}

/**
 * Scripted guidance for each of the suggested research questions.
 *
 * Every line is about *how* to answer the question for a given topic, never a
 * claimed fact about it. That distinction is the whole point: a student may
 * hand these notes in, so scaffolding they can work from is useful where
 * invented dates and names would be a liability.
 *
 * Returns null for anything unrecognised, so the caller keeps its own default.
 */
function researchGuidance(instruction: string, topic: string): string | null {
  const q = instruction.toLowerCase();

  if (/facts?|dates?|timeline|when/.test(q)) {
    return [
      `Key facts and dates: ${topic}`,
      '',
      '• Pin down the start and end of the period, then the two or three turning points between them.',
      '• For each, note what changed and who it affected. A date on its own earns no marks.',
      '• Check your reading list first: the dates your lecturer stressed are the ones being examined.',
      '• Cross-check anything you find against a second source before you rely on it.',
    ].join('\n');
  }

  if (/who|people|figures?|person|involved/.test(q)) {
    return [
      `Main people: ${topic}`,
      '',
      '• Sort them into decision-makers, those who carried it out, and those it was done to.',
      '• For each, note what they wanted and what they actually achieved. The gap is usually the argument.',
      '• Include at least one figure whose account complicates the standard telling.',
      '• Name checking is not analysis: tie every person back to your central point.',
    ].join('\n');
  }

  if (/viewpoints?|perspectives?|arguments?|debate|interpretation|angles?/.test(q)) {
    return [
      `Main viewpoints: ${topic}`,
      '',
      '• Identify the conventional reading, then the strongest challenge to it.',
      '• Ask what evidence each side leans on, and what each one has to explain away.',
      '• Note where they actually agree. Overstated disagreement is a common trap.',
      '• Say which you find more convincing and why. Marks come from taking a position.',
    ].join('\n');
  }

  if (/read|look up|sources?|references?|bibliograph/.test(q)) {
    return [
      `Where to look: ${topic}`,
      '',
      '• Start with your module reading list, then follow the footnotes of anything useful.',
      '• Aim for one primary source, one scholarly overview, and one recent journal article.',
      '• Your library’s database beats a general web search for anything you plan to cite.',
      '• Record the full reference as you go. Rebuilding a bibliography afterwards costs hours.',
    ].join('\n');
  }

  return null;
}

/** Offline/no-key scripted draft so the UI always demos. */
export function localFallbackDraft(req: DraftRequest): string {
  const who = req.contactName ?? 'there';
  const me = req.senderName ?? SENDER;

  const messaging = isMessageMethod(req.method);

  if (!messaging && (req.kind === 'assignment' || req.kind === 'project')) {
    if (req.reflect) {
      /*
       * Offline, the honest reflection is their own words back.
       *
       * Every other fallback in this file writes something plausible. This one
       * must not: the card asks "have I understood you", and a scripted
       * paraphrase would be Aria agreeing with itself. Quoting what was given
       * and naming what is missing is the same job done truthfully, and the
       * confidence chip beside it is computed from exactly this poverty of
       * input, so the two agree.
       */
      const stated = req.description?.trim();
      if (!stated) {
        return `Here's what I've got: "${req.title}". That's all I know so far, so tell me what done looks like and I'll say it back properly.`;
      }
      return [`Here's what I've got, in your words:`, '', stated].join('\n');
    }
    if (req.subtaskTitle && req.research) {
      // A follow-up gets guidance shaped to what was asked. Deliberately about
      // how to find the answer rather than the answer itself: without a model
      // there are no real facts to give, and inventing dates or names for a
      // topic a student might hand in is far worse than admitting the gap.
      if (req.instruction) {
        const guide = researchGuidance(req.instruction, req.subtaskTitle);
        if (guide) return guide;
      }
      return [
        `Research notes: ${req.subtaskTitle}`,
        '',
        '• Key points to cover: the who/what/when, why it matters, and its impact.',
        '• Angles to explore: causes, consequences, and differing viewpoints.',
        '• Look for: a primary source, a scholarly overview, and one or two specific facts or dates.',
        '• Tie it back to your overall argument.',
      ].join('\n');
    }
    if (req.subtaskTitle) {
      return [
        `${req.subtaskTitle}`,
        '',
        `Open by making the point of this section clear in a sentence. Develop it with two or three specific ideas, using evidence or an example where you can, then connect it back to your overall argument for “${req.title}.” Tighten the wording on a second pass.`,
      ].join('\n');
    }
    if (req.method === 'draft') {
      return [
        `${req.title}: first draft`,
        '',
        'Introduction. State the question and your thesis in a few sentences so the reader knows where this is going.',
        '',
        'Body. Develop two or three main points. For each: make a claim, back it with evidence, and explain why it matters.',
        '',
        'Counterpoint. Acknowledge the strongest objection and respond to it briefly.',
        '',
        'Conclusion. Restate the thesis in light of the argument and end on its wider significance.',
      ].join('\n');
    }
    return [
      `Outline: ${req.title}`,
      '',
      '1. Introduction: frame the question and your thesis.',
      '2. Background: the key context a reader needs.',
      '3. Main argument: 2–3 points, each with evidence.',
      '4. Counterpoint: address the strongest objection.',
      '5. Conclusion: restate the thesis and its significance.',
    ].join('\n');
  }

  if (!messaging && TASKLIKE_KINDS.includes(req.kind) && !req.contactName) {
    if (req.method === 'plan') {
      return [
        `Plan: ${req.title}`,
        '',
        '1. Note down exactly what “done” looks like.',
        '2. List what you need first: info, people, or things.',
        '3. Do the smallest first step today.',
        '4. Block time for the main task.',
        '5. Check it off when it’s finished.',
      ].join('\n');
    }
    return `Quick note for ${req.title}:\n\nHere’s a starting point you can shape however you like. Capture the key details, who’s involved, and the deadline so nothing slips.`;
  }

  // Message tasks
  const method: MessageMethod = isMessageMethod(req.method) ? req.method : 'sms';

  if (method === 'call') {
    const opener =
      req.kind === 'birthday'
        ? `Wish ${who} a happy birthday`
        : req.kind === 'anniversary'
          ? `Congratulate ${who} on the anniversary`
          : `Reason for the call: ${req.title.toLowerCase()}`;
    return [`Talking points for a call with ${who}`, '', `• ${opener}`, '• Ask how they’ve been', '• Suggest catching up soon'].join('\n');
  }

  const body =
    req.kind === 'anniversary'
      ? `Happy anniversary, ${who}! Wishing you another year full of love and happy memories.`
      : req.kind === 'birthday'
        ? `Happy birthday, ${who}! 🎉 Hope your day is as wonderful as you are. Let’s celebrate soon.`
        : `Hi ${who}, just wanted to reach out about ${req.title.toLowerCase()}.`;

  if (method === 'email') {
    return [`Hi ${who},`, '', body, '', 'Talk soon,', me].join('\n');
  }

  return `${body}\n${me}`;
}
