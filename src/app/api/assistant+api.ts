import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
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
Your job in this chat is to turn what ${me} says into calendar tasks, and to reply warmly and briefly.

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
- reply: one or two short, warm sentences describing the task you've prepared for ${me} to review. Do NOT say it's already added. Mention the day naturally ("for Friday"). If it isn't a task, just answer helpfully.
- If the message contains no task to create, return an empty tasks array.
- Do NOT invent tasks ${me} didn't ask for.
- In the reply text, do not use em dashes or long hyphens as separators; use commas, periods, or colons instead.`;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
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
  required: ['reply', 'tasks'],
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
    const parsed = JSON.parse(text) as AssistantResponse;
    if (typeof parsed.reply !== 'string' || !Array.isArray(parsed.tasks)) {
      throw new Error('bad shape');
    }
    return Response.json(parsed satisfies AssistantResponse);
  } catch (err) {
    console.error('[aria] assistant: Claude call failed, using local parsing:', err);
    return Response.json(localParse(body.message, body.today, focus) satisfies AssistantResponse);
  }
});
