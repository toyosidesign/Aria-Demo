import Anthropic from '@anthropic-ai/sdk';

import { describeLearner } from '@/lib/learner';
import { protectedRoute } from '@/lib/api-auth';
import { askWithSearch } from '@/lib/web-search';
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
- Do not use em dashes or long hyphens as separators; use commas, periods, or colons instead.`;
};

function buildPrompt(req: DraftRequest): string {
  const who = req.contactName ? `to ${req.contactName}` : '';
  const lines: string[] = [];
  const learner = describeLearner(req.learner);

  // A text/email/card/call is a message flow whatever the category is.
  const messaging = isMessageMethod(req.method);

  /*
   * A question about the work, answered rather than acted on.
   *
   * Anything typed under a draft used to be treated as "change it", so asking
   * why a point came second produced another draft and Aria looked like it was
   * repeating itself. This path answers and leaves the draft alone: it is not a
   * rewrite with extra steps.
   */
  if (req.question?.trim()) {
    lines.push(
      `They are asking about work you produced for "${req.title}"${req.subtaskTitle ? `, the "${req.subtaskTitle}" part` : ''}.`,
      '',
      'Their question:',
      req.question.trim(),
      '',
      'Answer the question. Do not rewrite the work, do not produce a new version of it, and do not repeat it back at them: they can see it. Two to five sentences, specific to what is actually in the text, quoting a short phrase from it where that makes the answer concrete.',
      'If the answer is that you do not know, or that the text does not say, say that plainly rather than inventing a justification.',
      'No preamble and no offer to change anything unless they asked.',
    );
    if (req.previousDraft) lines.push(`The work in question:\n${req.previousDraft}`);
    if (req.ownInstruction?.trim())
      lines.push(`They had asked you to handle it this way:\n${req.ownInstruction.trim()}`);
    if (req.description) lines.push(`Context on the task:\n${req.description}`);
    if (learner) lines.push(learner);
    return lines.join('\n');
  }

  if (!messaging && (req.kind === 'assignment' || req.kind === 'project')) {
    /*
     * Their instruction, first, and above everything this route would otherwise
     * have decided.
     *
     * "Something else" means the three shapes Aria offers were not what they
     * wanted, so the value of the option is entirely in being obeyed. A model
     * asked to be helpful will round an unusual instruction toward a familiar
     * one, "ten slides, twenty words each" quietly becoming an essay plan, and
     * that is the failure to design against. Hence: to the letter, no
     * substitutions, and where something needed genuinely was not said, ask one
     * specific question instead of choosing on their behalf.
     */
    if (req.ownInstruction?.trim()) {
      lines.push(
        `They told you exactly how they want "${req.title}" handled. Their words:`,
        req.ownInstruction.trim(),
        '',
        'Follow that instruction to the letter. Every constraint in it is real: counts, formats, lengths, structure, tone, what to leave out. Do not substitute a more familiar task for the one they described, do not add sections they did not ask for, and do not improve on the format.',
        'If something you genuinely need was not said, ask one specific question and nothing else. Do not guess it and do not produce a half answer alongside the question.',
        'No preamble and no sign-off. Give them the thing they asked for.',
      );
      if (req.subtaskTitle) lines.push(`This turn is about: "${req.subtaskTitle}".`);
      if (req.description) lines.push(`Context they added:\n${req.description}`);
      if (learner) lines.push(learner);
      if (req.instruction) lines.push(`They have now asked you to: ${req.instruction}`);
      if (req.previousDraft) lines.push(`What you gave them last time:\n${req.previousDraft}`);
      return lines.join('\n');
    }

    if (req.reflect) {
      /*
       * Say it back, add nothing.
       *
       * The reflect-back card is agreed with or corrected, so an invented goal
       * would be agreed with too, and a project then gets scoped around
       * something nobody asked for. The instruction to use only what was given
       * is doing the real work here, not the tone.
       */
      lines.push(
        `Say back, in your own words, what this project is: "${req.title}".`,
        'Two or three sentences, second person ("You\'re building..."). Use only what you were given: do not add goals, audiences, deadlines or features that were not stated.',
        'If something important is missing, say what is unclear rather than filling it in.',
        'No preamble, no encouragement, no questions at the end.',
      );
      if (req.description) lines.push(`What they told me:\n${req.description}`);
      return lines.join('\n');
    }

    if (req.explain) {
      /*
       * The thing onboarding was collecting all along.
       *
       * "How should I explain things?" and the interests list have been stored
       * since the welcome flow and read by exactly one route, so a student who
       * asked for examples from what they are into got them when subtasks were
       * generated and nowhere else. An explanation is the one place that
       * preference most obviously belongs.
       */
      lines.push(
        `The student wants "${req.title}" explained${req.subtaskTitle ? `, specifically "${req.subtaskTitle}"` : ''}.`,
        'Explain the topic itself, not how to write about it. Break it into a few labelled parts, and ground at least one of them in a concrete real-world situation they would recognise.',
        'No preamble, no restating the question.',
      );
      if (learner) lines.push(learner);
      return lines.join('\n');
    }

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
// before this body is trusted, see lib/api-auth.ts.
export const POST = protectedRoute(DraftSchema, limitAi, async (body) => {
  // No key configured → return a scripted draft so the demo still works.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
  }

  try {
    const client = new Anthropic();

    /*
     * Research reads the web; everything else on this route does not.
     *
     * `research` is the request the Research screen makes, and it is the one
     * case here where being out of date is the failure: a student is looking
     * something up to use it. A birthday card, an email, a reflect-back are all
     * about this person's own situation, and a search there would spend money
     * and seconds to add nothing.
     *
     * A failed search returns null and falls through to the ordinary call
     * below, so the notes still arrive, just without sources.
     */
    if (body.research) {
      const found = await askWithSearch(client, {
        system: `${systemFor(body.senderName, body.senderContext)}

Search before you write. Return notes a student can use: short paragraphs or short lines, the specific facts, figures, dates and names, and who says each one. Prefer sources somebody could cite. Where the sources disagree, say so rather than picking a side. Where you could not find something, say that plainly instead of filling the gap from memory. Never write sentences they could hand in as their own argument.`,
        prompt: buildPrompt(body),
        maxTokens: 1600,
      });
      if (found) {
        return Response.json({
          message: found.text,
          fallback: false,
          sources: found.sources,
          searched: found.searched,
        } satisfies DraftResponse);
      }
    }

    // Cast: keep the current wire format (adaptive thinking + effort) even if
    // the installed SDK's local types lag behind.
    const msg = (await client.messages.create({
      model: 'claude-opus-4-8',
      /*
       * Room for what they actually asked for.
       *
       * 1024 is plenty for a card, an outline or one section of an essay, which
       * is everything this route used to be asked for. An instruction somebody
       * wrote themselves is not bounded by Aria's idea of a task: "turn my
       * notes into ten slides" ran out of tokens after five in testing, and a
       * truncated answer to a precise instruction reads as Aria ignoring the
       * instruction, which is the one failure this option cannot afford.
       */
      max_tokens: body.ownInstruction?.trim() ? 4096 : 1024,
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
    // key for a long time, every draft looked written when none of them were.
    console.error('[aria] draft: Claude call failed, using scripted text:', err);
    return Response.json({ message: localFallbackDraft(body), fallback: true } satisfies DraftResponse);
  }
});
