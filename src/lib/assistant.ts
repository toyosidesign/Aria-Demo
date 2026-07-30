import { addDays, parseISO } from 'date-fns';

import { toISODate } from '@/lib/dates';
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
 * What Aria says when someone tries to talk to it properly.
 *
 * Says what it can't do before what it can, because the useful half is no use
 * to someone still waiting for an answer to the question they actually asked.
 */
export const TESTING_NOTICE =
  "I'm in a testing phase, so I can't hold a real conversation or go and do things out in the world yet. That part is still being built. What I can do today is capture and organise what's on your plate: tell me something like “remind me to submit my lab report on Friday at 5pm” and I'll set it up for you.";

/**
 * The same limit, said where a task asks Aria to go and find things out.
 *
 * Kept next to TESTING_NOTICE so the two can't drift into promising different
 * things. Research is the sharpest case: the screen is named for looking things
 * up, so without saying this, notes written from general knowledge read as
 * sourced findings a student might hand in unchecked.
 */
export const OUT_OF_SCOPE_NOTICE =
  "One thing first: I'm in a testing phase, so I can't go and research this properly yet. No searching the web, no reading sources. That part is still being built. What I give you below comes from general knowledge, so treat it as a starting point and check anything you rely on.";

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
export function wantsRealConversation(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  // Greetings and acknowledgements already have warm replies of their own.
  if (detectSmallTalk(message)) return false;
  // A question mark settles it, and is checked first: "how do I write a lab
  // report?" mentions a task word but is plainly a question.
  if (t.endsWith('?')) return true;
  if (looksLikeTask(t)) return false;
  return /^(who|what|when|where|why|how|which|can you|could you|would you|will you|do you|are you|is there|tell me|explain|find|search|look up|book|order|buy|pay|research|summar)\b/.test(
    t,
  );
}

// ---------------------------------------------------------------------------
// Local heuristic fallback — good enough to demo offline / without a key.
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
    return {
      reply:
        "I'm here to help you stay on top of things. Tell me something to add, like “remind me to submit my lab report on Friday”.",
      tasks: [],
      fallback: true,
    };
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
