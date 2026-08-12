import { addDays, parseISO } from 'date-fns';

import { toISODate } from '@/lib/dates';
import { offlineAnswer } from '@/lib/offline-answer';
import type { Source } from '@/lib/source';

// Re-exported so existing callers keep one import site for chat behaviour.
export { offlineAnswer } from '@/lib/offline-answer';

import { defaultMethodFor, type Priority, type TaskKind, type TaskMethod } from '@/store/aria-store';
import { postJson } from '@/lib/api-client';

export interface ParsedTask {
  title: string;
  date: string; // ISO yyyy-MM-dd
  time?: string; // optional "HH:mm" (24h)
  kind: TaskKind;
  priority: Priority;
  contactName?: string;
  contactEmail?: string;
  method?: TaskMethod;
  description?: string;
  subtasks?: string[];
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantResponse {
  reply: string;
  tasks: ParsedTask[];
  /**
   * Where a searched answer came from, when Aria looked it up.
   *
   * Absent on remembered answers, and that absence is meaningful: it is how the
   * chat knows not to imply provenance the answer does not have.
   */
  sources?: Source[];
  /** True when produced by the local parser (no API key / error). */
  fallback?: boolean;
}

/** Call the server route; fall back to a local heuristic parser on any failure. */
export async function requestAssistant(
  message: string,
  today: string,
  history: AssistantTurn[] = [],
  focus?: TaskKind,
  /** Who Aria is talking to, so it addresses them by name. */
  senderName?: string,
  /** One line on who they are, so Aria pitches its replies to fit. */
  senderContext?: string,
): Promise<AssistantResponse> {
  try {
    const res = await postJson('/api/assistant', {
      message,
      today,
      history,
      focus,
      senderName,
      senderContext,
    });
    if (!res.ok) throw new Error(`assistant failed: ${res.status}`);
    const data = (await res.json()) as AssistantResponse;
    if (!data || typeof data.reply !== 'string' || !Array.isArray(data.tasks)) {
      throw new Error('bad shape');
    }
    return data;
  } catch {
    return localParse(message, today, focus);
  }
}

/**
 * Recognise short conversational messages (yes/no/thanks/hold on/hi/bye) and
 * return a warm reply. Whole-message matching so instructions like
 * "no emojis please" aren't mistaken for small talk. Returns null otherwise.
 */
export function detectSmallTalk(message: string): string | null {
  const t = message.trim().toLowerCase().replace(/[.!?…]+$/, '');
  if (/^(thanks|thank you|thank u|thx|ty|cheers|appreciate it|much appreciated|thanks so much)$/.test(t))
    return "You're welcome! 😊 Anything else I can help with?";
  if (/^(hold on|hang on|hold up|wait|one sec|one second|just a sec|gimme a sec|give me a sec|give me a moment|a moment|brb)$/.test(t))
    return 'Of course. Take your time. I’ll be right here.';
  if (/^(no|nope|nah|no thanks|not now|never mind|nevermind|cancel|forget it|that’s all|thats all)$/.test(t))
    return 'No problem at all. I’m here whenever you need me.';
  if (/^(yes|yeah|yep|yup|sure|ok|okay|k|sounds good|go ahead|please do|do it|perfect|great)$/.test(t))
    return 'Great. Tell me the details and I’ll set it up.';
  if (/^(hi|hello|hey|yo|hiya|heya|good morning|good afternoon|good evening|what’s up|whats up|sup)$/.test(t))
    return 'Hey! What would you like me to help you with?';
  if (/^(bye|goodbye|see ya|see you|later|good night|goodnight|gtg)$/.test(t))
    return 'See you! 👋 I’ll keep an eye on your tasks.';
  return null;
}

/**
 * What Aria says when asked to do something it genuinely cannot.
 *
 * This used to also claim Aria couldn't hold a conversation. That was true when
 * no API key was configured, the local parser answered everything, and its
 * conversational replies were thin. With a model behind it the claim became
 * false, and the notice started replacing real answers with an apology for not
 * being able to give one.
 *
 * It now covers only what is still true: Aria can talk, and cannot act out in
 * the world. Narrow it again as each of those becomes possible.
 */
export const TESTING_NOTICE =
  "I can't go and do things out in the world yet: booking, ordering or paying. That part is still being built. I can look things up for you, talk anything through, and set up whatever needs doing: tell me something like \u201cremind me to submit my lab report on Friday at 5pm\u201d and I'll take care of it.";

/**
 * Said when notes came out of memory rather than off the web.
 *
 * Aria can search now, so the old blanket "I cannot research this" was a lie in
 * the ordinary case. What is still true is the exception: no key, a failed
 * search, a model that answered without looking. Those produce notes that look
 * identical to researched ones, which is exactly when somebody hands an
 * unchecked claim to a marker.
 *
 * So this is said *after* the notes and only when no search ran, and its
 * counterpart is the source list under the ones that were researched. Between
 * them, every set of notes on that screen says where it came from.
 */
export const FROM_MEMORY_NOTICE =
  "One thing about those notes: they came from what I already know, not from anything I read just now. No sources to point you at, so treat them as a starting point and check anything you lean on.";

/**
 * Said when a typed question falls outside the preselected set.
 *
 * During the testing phase Aria answers a known list and nothing else, so the
 * boundary has to be stated plainly and point straight at what does work.
 * Anything vaguer leaves someone retyping the same question in new words.
 */
export const OFF_SCRIPT_NOTICE =
  "That one's outside what I can answer while I'm in a testing phase. Tap one of the suggested questions below and I'll take it from there. Open questions are what's being built next.";

/**
 * Said when every suggested question has been used up. Pointing back at an
 * empty row would be the run-around; this names what's left to do instead.
 */
export const ALL_SUGGESTIONS_USED =
  "I've covered everything I can on this one while I'm in a testing phase. Save the notes to your draft or mark the item done, and open questions will come with the full version.";

/**
 * Said when Aria did answer but produced nothing new. Distinct from the above:
 * here it's worth rephrasing, so pointing at the suggestions is useful rather
 * than the run-around it would be when nothing can be answered at all.
 */
export const FOLLOW_UP_NO_CHANGE =
  "That didn't give me anything new to add. Try wording it differently, or pick one of the suggestions below.";

/**
 * Whether someone is trying to converse with Aria, asking it a question or
 * asking it to go and do something, rather than handing it a task to file.
 *
 * Checked so Aria can say plainly that this is still being built. Without it,
 * a question gets answered with a prompt to add a task, which reads as though
 * Aria misunderstood rather than as a limit it knows it has.
 */
export function wantsRealWorldAction(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  // Greetings and acknowledgements have warm replies of their own.
  if (detectSmallTalk(message)) return false;
  /*
   * A question is no longer a trigger.
   *
   * It used to be, any "how do I write a lab report?" got the limits notice
   * rather than an answer, because without a model there was no answer to give.
   * There is one now, and intercepting it is the bug: a student asking for help
   * with their work is the entire point of the product.
   *
   * What's left is what Aria still genuinely cannot do, reach out and
   * *transact*. Booking, ordering, paying. Promising those would be a lie;
   * refusing to explain something is just a waste.
   *
   * Searching came off this list when it started working. "Google it" and
   * "search the web" are now requests Aria can simply carry out, and answering
   * them with an apology for not being able to was the same bug as before,
   * wearing the previous limit's clothes.
   */
  if (looksLikeTask(t)) return false;
  return /\b(book|order|buy|purchase|pay for|reserve)\b/.test(t);
}

// ---------------------------------------------------------------------------
// Local heuristic fallback, good enough to demo offline / without a key.
// ---------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nextWeekday(base: Date, target: number): Date {
  for (let i = 1; i <= 7; i += 1) {
    const d = addDays(base, i);
    if (d.getDay() === target) return d;
  }
  return addDays(base, 1);
}

function resolveDate(text: string, today: string): string {
  const t = text.toLowerCase();
  const base = parseISO(today);

  if (/\btoday\b|\btonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return toISODate(addDays(base, 1));

  const inDays = t.match(/in (\d+) days?/);
  if (inDays) return toISODate(addDays(base, parseInt(inDays[1], 10)));

  const inWeeks = t.match(/in (\d+) weeks?/);
  if (inWeeks) return toISODate(addDays(base, parseInt(inWeeks[1], 10) * 7));

  if (/next week/.test(t)) return toISODate(addDays(base, 7));
  if (/this weekend|\bweekend\b/.test(t)) return toISODate(nextWeekday(base, 6));

  const nextMatch = /\bnext\s+(\w+)/.exec(t);
  for (let i = 0; i < 7; i += 1) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      let d = nextWeekday(base, i);
      if (nextMatch && WEEKDAYS[i].startsWith(nextMatch[1])) d = addDays(d, 7);
      return toISODate(d);
    }
  }

  return toISODate(addDays(base, 1)); // default: tomorrow
}

function detectKind(text: string): TaskKind {
  const t = text.toLowerCase();
  if (/birthday|bday|turning \d+/.test(t)) return 'birthday';
  if (/anniversary/.test(t)) return 'anniversary';
  if (/\bproject\b/.test(t)) return 'project';
  if (/essay|assignment|homework|report|lab|exam|quiz|study|paper|problem set|readings?/.test(t))
    return 'assignment';
  if (/\bevent\b|party|dinner|meeting|appointment|concert|wedding|reservation|hangout|festival/.test(t))
    return 'event';
  return 'general';
}

function detectPriority(text: string): Priority {
  const t = text.toLowerCase();
  if (/urgent|asap|important|critical|high priority|deadline|due/.test(t)) return 'high';
  if (/whenever|sometime|no rush|low priority|eventually/.test(t)) return 'low';
  return 'medium';
}

function detectTime(text: string): string | undefined {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'pm') h += 12;
    const min = m[2] ? parseInt(m[2], 10) : 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = t.match(/\b(\d{1,2}):(\d{2})\b/); // 24-hour
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 24 && min < 60) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  if (/\bnoon\b/.test(t)) return '12:00';
  if (/\bmidnight\b/.test(t)) return '00:00';
  if (/\bmorning\b/.test(t)) return '09:00';
  if (/\bafternoon\b/.test(t)) return '15:00';
  if (/\bevening\b|\btonight\b/.test(t)) return '19:00';
  return undefined;
}

function detectMethod(text: string): TaskMethod | undefined {
  const t = text.toLowerCase();
  if (/\bcall\b|\bphone\b|\bring\b/.test(t)) return 'call';
  if (/\bemail\b|e-mail|\bmail\b/.test(t)) return 'email';
  if (/\bcard\b|greeting card/.test(t)) return 'card';
  if (/\btext\b|\bsms\b|\bmessage\b|imessage|\bdm\b/.test(t)) return 'sms';
  return undefined;
}

function detectEmail(text: string): string | undefined {
  const m = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m ? m[0].replace(/[.,;:]+$/, '') : undefined;
}

function detectContact(text: string): string | undefined {
  const patterns = [
    /(?:to|for)\s+([A-Z][a-z]+)/,
    /([A-Z][a-z]+)['’]s\b/,
    /(?:wish|message|text|call|email|congratulate|remind)\s+([A-Z][a-z]+)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && !WEEKDAYS.includes(m[1].toLowerCase())) return m[1].replace(/^\w/, (c) => c.toUpperCase());
  }
  return undefined;
}

function cleanTitle(text: string): string {
  let s = text.trim();
  s = s.replace(
    /^(hey aria[,\s]*|aria[,\s]*|please\s+|can you\s+|could you\s+|remind me to\s+|remind me\s+|remind me that\s+|add (?:a )?(?:task|reminder)?(?: to)?\s+|create (?:a )?task (?:to|for)?\s+|create\s+|new task[:\s]+|i need to\s+|i have to\s+|i've got to\s+|note to\s+|todo[:\s]+|task[:\s]+)/i,
    '',
  );
  // Strip trailing date phrases for a cleaner title.
  s = s.replace(
    /\s+(?:on|by|this|next|tomorrow|today|tonight)?\s*(?:on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|tonight|next week|this weekend|the weekend|in \d+ (?:days?|weeks?))\b\.?$/i,
    '',
  );
  s = s.replace(/[.\s]+$/, '');
  if (!s) s = text.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function looksLikeTask(text: string): boolean {
  const t = text.toLowerCase();
  return /remind|add|create|task|todo|schedule|need to|have to|due|assignment|birthday|anniversary|homework|essay|call|text|message|wish|study|exam|meeting|appointment|deadline|by (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|next)/.test(
    t,
  );
}

export function localParse(message: string, today: string, focus?: TaskKind): AssistantResponse {
  const talk = detectSmallTalk(message);
  if (talk) {
    return { reply: talk, tasks: [], fallback: true };
  }

  if (!focus && !looksLikeTask(message)) {
    /*
     * The offline answer to a question, and why it says what it says.
     *
     * This is the line somebody sees when the model could not be reached: no
     * session, no key, no network. It used to be one fixed sentence inviting
     * them to add a task, which is not an answer to "how long should the
     * introduction be", and repeating it verbatim to every question is what
     * made Aria look broken rather than offline.
     *
     * A scripted reply cannot answer the question. What it can do is be honest
     * that it is not answering, which is the difference between an assistant
     * that is unavailable and one that is stupid.
     */
    return { reply: offlineAnswer(message), tasks: [], fallback: true };
  }

  const title = cleanTitle(message);
  const date = resolveDate(message, today);
  const time = detectTime(message);
  const kind = focus ?? detectKind(message);
  const priority = detectPriority(message);
  const isWork = kind === 'assignment' || kind === 'project';
  const contactName = isWork ? undefined : detectContact(message);
  const contactEmail = isWork ? undefined : detectEmail(message);
  const method = contactEmail
    ? 'email'
    : (detectMethod(message) ?? defaultMethodFor(kind, !!contactName));

  const task: ParsedTask = { title, date, time, kind, priority, contactName, contactEmail, method };
  return {
    reply: `Here’s what I’ve got. Tap Review to set the date and time, then I’ll add it.`,
    tasks: [task],
    fallback: true,
  };
}
