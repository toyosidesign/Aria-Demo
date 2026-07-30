import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
import { DraftSchema } from '@/lib/api-schemas';
import { limitAi } from '@/lib/rate-limit';
import {
  isMessageMethod,
  localFallbackDraft,
  type DraftRequest,
  type DraftResponse,
} from '@/lib/aria-actions';

/**
 * Built per request so Aria writes as whoever is signed in, rather than as the
 * demo persona. Pronouns stay neutral: the app never asks for them, so it must
 * not assume any.
 */
const systemFor = (senderName?: string, senderContext?: string) => {
  const me = senderName?.trim() || 'the person you help';
  // Their own description of themselves, or nothing. Assuming "university
  // student" pitched every draft at a student regardless of who was writing.
  const who = senderContext?.trim() ? `${me} (${senderContext.trim()})` : me;
  return `You are Aria, a warm, thoughtful assistant helping ${who}.
You are drafting a short message that ${me} will send from their own phone, written in their voice (first person, as ${me}).

Rules:
- Return ONLY the message text, with no preamble, no quotation marks, no "Here's a draft", no sign-off notes.
- Keep it genuine, warm, and concise (1–3 sentences for a message; a short outline for an assignment).
- Sound like a real person texting, not a greeting card. Match how they'd actually write. Avoid clichés and over-formality.
- Never invent specific facts (times, places, inside jokes) that weren't given.
- It should be ready to send as-is.
- Do not use em dashes (—) or hyphens as separators; use commas, periods, or colons instead.`;
};

function buildPrompt(req: DraftRequest): string {
  const who = req.contactName ? `to ${req.contactName}` : '';
  const lines: string[] = [];

  // A text/email/card/call is a message flow whatever the category is.
  const messaging = isMessageMethod(req.method);

  if (!messaging && (req.kind === 'assignment' || req.kind === 'project')) {
    if (req.subtaskTitle && req.research) {
      lines.push(
        `For the assignment "${req.title}", help the student research the "${req.subtaskTitle}" topic. Give concise research notes as bullet points: the key facts/dates/people, the main angles and viewpoints to explore, and 2–3 specific things or source types to look up. No prose paragraphs, no preamble.`,
      );
      if (req.description) lines.push(`Notes so far: ${req.description}`);
    } else if (req.subtaskTitle) {
      lines.push(
        `For the assignment "${req.title}", write the "${req.subtaskTitle}" section. Produce the actual draft prose for just that section: a few tight paragraphs a student could build on. No outline, no preamble, no headings.`,
      );
      if (req.description) lines.push(`Notes so far: ${req.description}`);
    } else if (req.method === 'draft') {
      lines.push(
        `Write a full first draft of this assignment: "${req.title}". Real prose the student can revise: introduction, body with 2–3 developed points, a counterpoint, and a conclusion. No outline, no preamble.`,
      );
      if (req.description) lines.push(`Context: ${req.description}`);
    } else {
      lines.push(`Draft a concise starting outline for this assignment: "${req.title}".`);
      if (req.description) lines.push(`Context: ${req.description}`);
      lines.push('Give 4–6 short numbered sections. No preamble.');
    }
  } else if (
    !messaging &&
    (req.kind === 'general' || req.kind === 'event' || req.kind === 'reminder') &&
    !req.contactName
  ) {
    if (req.method === 'plan') {
      lines.push(`Break this task into a short, practical step-by-step plan: "${req.title}".`);
      if (req.description) lines.push(`Context: ${req.description}`);
      lines.push('Give 3–6 concrete numbered steps a student could act on today. No preamble.');
    } else {
      lines.push(`Draft a short, practical note to help get this task started: "${req.title}".`);
      if (req.description) lines.push(`Context: ${req.description}`);
      lines.push('A few sentences the student can shape. No preamble.');
    }
  } else {
    const occasion =
      req.kind === 'birthday'
        ? 'a birthday message'
        : req.kind === 'anniversary'
          ? 'an anniversary message'
          : 'a short message';
    lines.push(`Write ${occasion} ${who} for this task: "${req.title}".`);
    if (req.description) lines.push(`Context: ${req.description}`);
    const fmt =
      req.method === 'email'
        ? 'Format it as a short, warm email with a friendly greeting and a sign-off.'
        : req.method === 'card'
          ? 'Write it as a warm, heartfelt greeting-card message.'
          : req.method === 'call'
            ? 'Do NOT write a message. Instead give 3–4 short bullet talking points for a phone call.'
            : 'Write it as a short, casual text message.';
    lines.push(fmt);
  }

  if (req.instruction && req.previousDraft) {
    lines.push('');
    if (req.research) {
      // A research follow-up is a question about the topic, not an edit to the
      // notes. Treating it as a rewrite answers something the student didn't
      // ask: "who are the main people?" came back as reworded notes.
      lines.push(`Here are the research notes so far:\n${req.previousDraft}`);
      lines.push(
        `Now answer this follow-up question about "${req.subtaskTitle ?? req.title}": ${req.instruction}`,
      );
      lines.push(
        'Answer the question directly, as concise bullet points. Add what the notes above do not already cover rather than restating them. No preamble.',
      );
    } else {
      lines.push(`Here is the previous draft:\n${req.previousDraft}`);
      lines.push(`Now rewrite it: ${req.instruction}. Return only the revised message.`);
    }
  }

  return lines.join('\n');
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Unauthenticated, this was a free proxy to a paid model on our key: the caller
// controls `instruction` and `previousDraft`, so they controlled the whole prompt
// and got the completion back. The wrapper enforces identity, quota and shape
// before this body is trusted — see lib/api-auth.ts.
export const POST = protectedRoute(DraftSchema, limitAi, async (body) => {
  // No key configured → return a scripted draft so the demo still works.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
  }

  try {
    const client = new Anthropic();
    // Cast: keep the current wire format (adaptive thinking + effort) even if
    // the installed SDK's local types lag behind.
    const msg = (await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: systemFor(body.senderName, body.senderContext),
      messages: [{ role: 'user', content: buildPrompt(body) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as Anthropic.Message;

    if (msg.stop_reason === 'refusal') {
      return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
    }

    const text = extractText(msg);
    return Response.json({
      message: text || localFallbackDraft(body),
      fallback: !text,
    } satisfies DraftResponse);
  } catch (err) {
    // The scripted draft keeps the app usable, but silence here hid a dead API
    // key for a long time — every draft looked written when none of them were.
    console.error('[aria] draft: Claude call failed, using scripted text:', err);
    return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
  }
});
