import Anthropic from '@anthropic-ai/sdk';

import { localFallbackDraft, type DraftRequest, type DraftResponse } from '@/lib/aria-actions';

const SYSTEM = `You are Aria, a warm, thoughtful assistant helping a university student named Maya.
You are drafting a short message that Maya will send from her own phone, written in her voice (first person, as Maya).

Rules:
- Return ONLY the message text — no preamble, no quotation marks, no "Here's a draft", no sign-off notes.
- Keep it genuine, warm, and concise (1–3 sentences for a message; a short outline for an assignment).
- Sound like a real student texting, not a greeting card. Avoid clichés and over-formality.
- Never invent specific facts (times, places, inside jokes) that weren't given.
- It should be ready to send as-is.`;

function buildPrompt(req: DraftRequest): string {
  const who = req.contactName ? `to ${req.contactName}` : '';
  const lines: string[] = [];

  if (req.kind === 'assignment' || req.kind === 'project') {
    if (req.subtaskTitle && req.research) {
      lines.push(
        `For the assignment "${req.title}", help the student research the "${req.subtaskTitle}" topic. Give concise research notes as bullet points: the key facts/dates/people, the main angles and viewpoints to explore, and 2–3 specific things or source types to look up. No prose paragraphs, no preamble.`,
      );
      if (req.description) lines.push(`Notes so far: ${req.description}`);
    } else if (req.subtaskTitle) {
      lines.push(
        `For the assignment "${req.title}", write the "${req.subtaskTitle}" section. Produce the actual draft prose for just that section — a few tight paragraphs a student could build on. No outline, no preamble, no headings.`,
      );
      if (req.description) lines.push(`Notes so far: ${req.description}`);
    } else if (req.method === 'draft') {
      lines.push(
        `Write a full first draft of this assignment: "${req.title}". Real prose the student can revise — introduction, body with 2–3 developed points, a counterpoint, and a conclusion. No outline, no preamble.`,
      );
      if (req.description) lines.push(`Context: ${req.description}`);
    } else {
      lines.push(`Draft a concise starting outline for this assignment: "${req.title}".`);
      if (req.description) lines.push(`Context: ${req.description}`);
      lines.push('Give 4–6 short numbered sections. No preamble.');
    }
  } else if (
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
            ? 'Do NOT write a message — instead give 3–4 short bullet talking points for a phone call.'
            : 'Write it as a short, casual text message.';
    lines.push(fmt);
  }

  if (req.instruction && req.previousDraft) {
    lines.push('');
    lines.push(`Here is the previous draft:\n${req.previousDraft}`);
    lines.push(`Now rewrite it: ${req.instruction}. Return only the revised message.`);
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

export async function POST(request: Request): Promise<Response> {
  let body: DraftRequest;
  try {
    body = (await request.json()) as DraftRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

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
      system: SYSTEM,
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
  } catch {
    return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
  }
}
