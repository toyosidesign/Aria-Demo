import { defaultMethodFor, type Task, type TaskKind, type TaskMethod } from '@/store/aria-store';

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
}

const SENDER = 'Maya';
export const ARIA_SENDER = SENDER;

// ---- Methods ----

export type MessageMethod = 'sms' | 'email' | 'card' | 'call';
const MESSAGE_SET = new Set<TaskMethod>(['sms', 'email', 'card', 'call']);
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
  card: { label: 'Card', short: 'card', app: 'Messages', sentPast: 'Sent a card to' },
  call: { label: 'Call', short: 'call', app: 'Phone', sentPast: 'Ready to call' },
};

/** Human labels for every handling method (used by the Create-task selector). */
export const METHOD_LABELS: Record<TaskMethod, string> = {
  sms: 'Text',
  email: 'Email',
  card: 'Card',
  call: 'Call',
  steps: 'Step by step',
  outline: 'Outline',
  draft: 'Draft it',
  remind: 'Just remind me',
  plan: 'Plan the steps',
};

/** Which handling options to offer for a given kind/contact in the Create screen. */
export const MESSAGE_METHODS: TaskMethod[] = ['sms', 'email', 'card', 'call'];
export const ASSIGNMENT_METHODS: TaskMethod[] = ['steps', 'outline', 'draft', 'remind'];
export const TASK_METHODS: TaskMethod[] = ['remind', 'plan', 'draft'];

/** The full set of task categories, shown in the Create screen and the chat. */
export const TASK_KINDS: { value: TaskKind; label: string }[] = [
  { value: 'general', label: 'Task' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'event', label: 'Event' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
];

const ASSIGNMENT_KINDS: TaskKind[] = ['assignment', 'project'];
const TASKLIKE_KINDS: TaskKind[] = ['general', 'event', 'reminder'];

export function methodOptionsFor(kind: TaskKind, hasContact: boolean): TaskMethod[] {
  if (ASSIGNMENT_KINDS.includes(kind)) return ASSIGNMENT_METHODS;
  if (TASKLIKE_KINDS.includes(kind) && !hasContact) return TASK_METHODS;
  return MESSAGE_METHODS; // birthday, anniversary, or task-like with a contact
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

  if (method === 'call') {
    return {
      type: 'message',
      method,
      offer: who
        ? `Want me to jot down a few talking points so you can call ${who}?`
        : 'Want me to jot down a few talking points for your call?',
      cta: 'Draft talking points',
      needsSend: true,
      drafting: who ? `a few talking points for your call with ${who}` : 'a few talking points',
    };
  }

  const noun = `${occasion} ${meta.short}`.trim();
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
  if (method === 'steps' && pending.length > 0) {
    return {
      type: 'assignment',
      method,
      walkthrough: true,
      offer: `Want me to work through this with you, part by part? First up: “${pending[0].title}.”`,
      cta: 'Work through it',
      needsSend: false,
      drafting: `the “${pending[0].title}” section`,
    };
  }
  if (method === 'draft') {
    return {
      type: 'assignment',
      method,
      offer: 'Want me to write a full first draft?',
      cta: 'Write a draft',
      needsSend: false,
      drafting: 'a full first draft',
    };
  }
  // outline, or "steps" with no subtasks yet
  return {
    type: 'assignment',
    method,
    offer: 'Want me to draft a starting outline for this?',
    cta: 'Draft an outline',
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
  senderName?: string;
  /** Rewrite instruction, e.g. "make it warmer and shorter". */
  instruction?: string;
  previousDraft?: string;
}

export interface DraftResponse {
  message: string;
  /** True when the server returned a scripted fallback (no API key / error). */
  fallback?: boolean;
}

/** Client helper: call the server route, with a local fallback if it fails. */
export async function requestDraft(req: DraftRequest): Promise<DraftResponse> {
  try {
    const res = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`draft failed: ${res.status}`);
    const data = (await res.json()) as DraftResponse;
    if (!data?.message) throw new Error('empty draft');
    return data;
  } catch {
    return { message: localFallbackDraft(req), fallback: true };
  }
}

/** Offline/no-key scripted draft so the UI always demos. */
export function localFallbackDraft(req: DraftRequest): string {
  const who = req.contactName ?? 'there';
  const me = req.senderName ?? SENDER;

  if (req.kind === 'assignment' || req.kind === 'project') {
    if (req.subtaskTitle && req.research) {
      return [
        `Research notes — ${req.subtaskTitle}`,
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
        `Open by making the point of this section clear in a sentence. Develop it with two or three specific ideas — use evidence or an example where you can — then connect it back to your overall argument for “${req.title}.” Tighten the wording on a second pass.`,
      ].join('\n');
    }
    if (req.method === 'draft') {
      return [
        `${req.title} — first draft`,
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
      `Outline — ${req.title}`,
      '',
      '1. Introduction — frame the question and your thesis.',
      '2. Background — the key context a reader needs.',
      '3. Main argument — 2–3 points, each with evidence.',
      '4. Counterpoint — address the strongest objection.',
      '5. Conclusion — restate the thesis and its significance.',
    ].join('\n');
  }

  if (TASKLIKE_KINDS.includes(req.kind) && !req.contactName) {
    if (req.method === 'plan') {
      return [
        `Plan — ${req.title}`,
        '',
        '1. Note down exactly what “done” looks like.',
        '2. List what you need first — info, people, or things.',
        '3. Do the smallest first step today.',
        '4. Block time for the main task.',
        '5. Check it off when it’s finished.',
      ].join('\n');
    }
    return `${req.title} — quick note:\n\nHere’s a starting point you can shape however you like. Capture the key details, who’s involved, and the deadline so nothing slips.`;
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
    return [`Talking points — call with ${who}`, '', `• ${opener}`, '• Ask how they’ve been', '• Suggest catching up soon'].join('\n');
  }

  const body =
    req.kind === 'anniversary'
      ? `Happy anniversary, ${who}! Wishing you another year full of love and happy memories.`
      : req.kind === 'birthday'
        ? `Happy birthday, ${who}! 🎉 Hope your day is as wonderful as you are — let’s celebrate soon.`
        : `Hi ${who}, just wanted to reach out — ${req.title.toLowerCase()}.`;

  if (method === 'email') {
    return [`Hi ${who},`, '', body, '', 'Talk soon,', me].join('\n');
  }

  return `${body} — ${me}`;
}
