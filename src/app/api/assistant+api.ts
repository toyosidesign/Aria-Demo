import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
import { askWithSearch } from '@/lib/web-search';
import { AssistantSchema } from '@/lib/api-schemas';
import { limitAi } from '@/lib/rate-limit';
import { localParse, type AssistantResponse, type AssistantTurn } from '@/lib/assistant';
import type { TaskKind } from '@/store/aria-store';

interface Body {
  message: string;
  today: string;
  history?: AssistantTurn[];
  focus?: string;
  /** The signed-in user's name, so Aria addresses them correctly. */
  senderName?: string;
  senderContext?: string;
}

const systemFor = (senderName?: string, senderContext?: string) => {
  const me = senderName?.trim() || 'the person you help';
  const who = senderContext?.trim() ? `${me} (${senderContext.trim()})` : me;
  return `You are Aria, a proactive, consent-first assistant for ${who}.

You do two things in this chat, and the first one is the one people notice.

1. ANSWER. When ${me} asks you something, answer it properly: a real answer, in
two or three sentences, the way a knowledgeable friend would. Questions about
their work, how to approach something, what a word means, how long something
takes, what to do about a situation, anything at all. Never deflect a question
back to "tell me something to add" and never reply with a menu of what you can
do. If you do not know, say so plainly and say what would help.

2. CAPTURE. When ${me} says something that is a thing to be done, turn it into a
task for them to review.

Most messages are one or the other. A few are both ("what should I say to my
tutor about the extension, and remind me to email her Friday"), and then you
answer first and prepare the task as well.

You will be given today's date. Resolve every relative date ("Friday", "tomorrow", "next week", "in 3 days", "the 30th") to a concrete calendar date in ISO yyyy-MM-dd, relative to today. Never return a date in the past; if a weekday has already passed this week, use next week's.

If ${me} mentions a time ("at 3pm", "by 9am", "this evening"), set time as "HH:mm" (24-hour), e.g. "15:00", "09:00", "19:00". Omit time if they don't mention one.

${me} will review and confirm the task's date, time, and details before it's saved, so do not claim it's already added.

For each task ${me} asks for, choose:
- kind: one of "birthday" (someone's birthday), "anniversary", "event" (parties, dinners, meetings, appointments), "reminder" (a simple nudge), "assignment" (essays, homework, labs, exams, readings, problem sets), "project" (larger multi-step work), or "general" (any other task/errand).
- priority: "high" if urgent/exam/deadline language; "low" if casual/no-rush; otherwise "medium".
- contactName: the person involved, when it's a message/birthday/anniversary (e.g. "Jane").
- contactEmail: any email address in the message (e.g. "lee@uni.edu"). If an email is present, set method to "email".
- method: how ${me} wants Aria to handle it.
  · Contact/message tasks (birthday, anniversary, or general with a person): "sms" (text), "email", "card" (a greeting card), or "call". Infer from phrasing ("text Sam" → sms, "email the professor" → email, "send a card" → card, "call Mum" → call). Default "sms" for messages, "card" for birthdays.
  · Assignments: "steps" (work through it part by part, the default), "outline", "draft" (write a full first draft), or "remind" (just a reminder).
  · General tasks with no person: "remind" (default), "plan" (break into steps), or "draft" (draft a note).
- subtasks: only if ${me} lists concrete steps.

Rules:
- For simple conversational messages ("yes", "no", "thanks", "hold on", "wait", "hi", "bye", "never mind"), reply warmly in one short line and return an EMPTY tasks array. Never invent a task from a bare acknowledgement.
- reply: when you prepared a task, one or two short warm sentences describing it for ${me} to review. Do NOT say it's already added. Mention the day naturally ("for Friday").
- reply, when it is a question: the actual answer. Two or three sentences, specific and useful, no preamble, no offer to add it to a list unless they asked. A question with an empty tasks array is a completely normal turn and is not a failure.
- Never repeat a previous reply. If ${me} asks something you have already answered, answer the new part or say what is still unclear.
- lookUp: true when answering properly needs something you cannot know from memory: anything current or recent, prices, dates, deadlines, who holds a role now, what a specific organisation or course says, statistics, or anything ${me} implies is time-sensitive. Also true when being out of date would matter more than being slow. False for everything else, including tasks to add, small talk, and questions about ${me}'s own list. When it is true, keep reply short: it will be replaced by a researched answer.
- lookUpQuery: what to search for, as somebody would type it into a search engine. Empty string when lookUp is false.
- If the message contains no task to create, return an empty tasks array.
- Do NOT invent tasks ${me} didn't ask for.
- In the reply text, do not use em dashes or long hyphens as separators; use commas, periods, or colons instead.`;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    lookUp: { type: 'boolean' },
    lookUpQuery: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          date: { type: 'string', description: 'ISO yyyy-MM-dd' },
          time: { type: 'string', description: 'optional HH:mm 24-hour' },
          kind: {
            type: 'string',
            enum: ['birthday', 'anniversary', 'event', 'reminder', 'assignment', 'project', 'general'],
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          contactName: { type: 'string' },
          contactEmail: { type: 'string' },
          method: {
            type: 'string',
            enum: ['sms', 'email', 'card', 'call', 'steps', 'outline', 'draft', 'remind', 'plan'],
          },
          description: { type: 'string' },
          subtasks: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'date', 'kind', 'priority'],
      },
    },
  },
  required: ['reply', 'lookUp', 'lookUpQuery', 'tasks'],
} as const;

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// `history` is echoed into `messages`, so an unvalidated `role` reached the SDK
// verbatim. AssistantSchema pins it to user/assistant and caps the length, and
// the wrapper guarantees it ran, see lib/api-auth.ts.
export const POST = protectedRoute(AssistantSchema, limitAi, async (body) => {
  const focus = body.focus as TaskKind | undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(localParse(body.message, body.today, focus) satisfies AssistantResponse);
  }

  try {
    const client = new Anthropic();
    const history = (body.history ?? []).slice(-6).map((h) => ({
      role: h.role,
      content: h.text,
    }));
    const focusNote = focus
      ? `\n\nThe user has chosen the category "${focus}". Use that as the task's kind unless the message clearly indicates a different one.`
      : '';

    const msg = (await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: `${systemFor(body.senderName, body.senderContext)}\n\nToday's date is ${body.today}.${focusNote}`,
      messages: [...history, { role: 'user', content: body.message }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as Anthropic.Message;

    if (msg.stop_reason === 'refusal') {
      return Response.json(localParse(body.message, body.today, focus) satisfies AssistantResponse);
    }

    const text = extractText(msg);
    const parsed = JSON.parse(text) as AssistantResponse & { lookUp?: boolean; lookUpQuery?: string };
    if (typeof parsed.reply !== 'string' || !Array.isArray(parsed.tasks)) {
      throw new Error('bad shape');
    }

    /*
     * A second call, only when the first one said the answer needs looking up.
     *
     * Search costs money and seconds, and most messages here are somebody
     * adding a task. Asking the model to flag the ones that need current
     * information keeps the common case a single call, and it is a better judge
     * of "would being out of date matter here" than any keyword list this file
     * could hold.
     *
     * The searched answer replaces the remembered one rather than sitting
     * beside it. Two answers to one question is worse than either.
     */
    if (parsed.lookUp) {
      const found = await askWithSearch(client, {
        system: `You are Aria, answering a question for ${body.senderName?.trim() || 'the person you help'}. Today is ${body.today}.

Search before you answer. Give the actual answer in two to four sentences, specific, no preamble, no bullet points, no offer to add anything to a list. Say what the answer is and when it was true. If the sources disagree or you could not find it, say that plainly rather than picking one. Do not use em dashes.`,
        prompt: parsed.lookUpQuery?.trim() || body.message,
      });
      if (found) {
        parsed.reply = found.text;
        parsed.sources = found.sources;
      }
    }

    delete parsed.lookUp;
    delete parsed.lookUpQuery;
    return Response.json(parsed satisfies AssistantResponse);
  } catch (err) {
    console.error('[aria] assistant: Claude call failed, using local parsing:', err);
    return Response.json(localParse(body.message, body.today, focus) satisfies AssistantResponse);
  }
});
