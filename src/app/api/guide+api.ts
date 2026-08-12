import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
import { GuideSchema } from '@/lib/api-schemas';
import { describeLearner } from '@/lib/learner';
import { briefSummary } from '@/lib/brief';
import { localGuide, needsMore, type GuideDirection, type GuideRequest } from '@/lib/guide';
import { limitAi } from '@/lib/rate-limit';

/**
 * Three or four ways forward, with what each would need and what it would cost.
 *
 * ── The two prompts, and why they are different ─────────────────────────────
 *
 * A student is being marked. So the assignment guide gives angles, the
 * questions each angle has to answer, and where the rubric rewards it, and it
 * does not write the argument, because the argument is the thing being
 * assessed. That is not a hedge about liability, it is what makes the output
 * useful: an essay handed to someone who has to defend it in a viva is worse
 * than no essay.
 *
 * A project has nobody marking it. A PM asking how to scope something wants a
 * recommendation, and giving them careful non-answers would be a worse product
 * for no reason at all. `student` decides which applies, and it is sent by the
 * app rather than inferred from the mode, so a student's own side project gets
 * the straight answer too.
 */

const SHARED = `You are Aria. You return options, not prose.

Every direction must include:
- title: the direction itself, one line, concrete
- needs: what taking it would require (sources, access, a decision, a tool)
- costs: what it would cost, time, risk, or what it rules out

Rules:
- 3 or 4 directions. Genuinely different from each other, not one idea in three costumes.
- Specific to what you were given. If two directions would fit any piece of work in the subject, you have not used the context.
- No preamble, no encouragement, no summary at the end.
- Do not use em dashes.`;

const ASSIGNMENT = `${SHARED}

This is an assignment being marked, so:
- Each direction is an angle the student could take, never the argument itself.
- questions: 2 short questions that direction has to answer to work.
- rewardedBy: which of the stated marking criteria it earns marks under. Use the criteria you were given, in their words. Omit it if none were given.
- Do not write the essay, the introduction, the thesis statement, or any sentence they could hand in. You are showing them where to dig, not digging.`;

const PROJECT = `${SHARED}

This is someone's own project and nobody is marking it, so give a straight recommendation:
- Directions may be scope options, approaches, things to cut, or definitions of done.
- Say plainly which one you would take and why, in the costs line of the others ("slower than option 1 for the same result").
- questions: 2 short questions worth settling before committing. Omit if the direction is obvious.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    directions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          needs: { type: 'string' },
          costs: { type: 'string' },
          rewardedBy: { type: 'string' },
          questions: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'needs', 'costs'],
      },
    },
  },
  required: ['directions'],
} as const;

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Everything Aria knows about the work, in the order it matters.
 *
 * The criteria come before the title on purpose: a guide that ignores the
 * rubric is worse than none, and the surest way to have it ignored is to bury
 * it under the parts that read like context.
 */
function promptFor(req: GuideRequest): string {
  const lines: string[] = [];
  const facts = briefSummary(req.facts);
  if (facts) lines.push(`The brief says:\n${facts}`);
  if (req.definition?.trim()) lines.push(`Done means: ${req.definition.trim()}`);
  if (req.scopeIn?.length) lines.push(`In scope: ${req.scopeIn.join('; ')}`);
  if (req.scopeOut?.length) lines.push(`Explicitly out of scope: ${req.scopeOut.join('; ')}`);
  lines.push(`The work: ${req.title}`);
  if (req.note?.trim()) lines.push(`They added: ${req.note.trim()}`);
  lines.push(
    req.focus === 'angle'
      ? 'They are stuck on picking an angle. Give them angles to choose between.'
      : req.focus === 'proof'
        ? 'They have an angle and are stuck on what it has to prove. Lead with the questions each direction must answer.'
        : req.focus === 'scope'
          ? 'They are stuck on what this should cover. Lead with scope options, including what each one drops.'
          : 'They are stuck on what finished looks like. Lead with definitions of done, each one testable.',
  );
  return lines.join('\n\n');
}

export const POST = protectedRoute(GuideSchema, limitAi, async (body) => {
  const req = body as GuideRequest;

  /*
   * Checked here as well as on the device.
   *
   * The client refuses to call with nothing to go on, and this is the same
   * refusal at the boundary: a request that arrives with only a title cannot
   * produce anything specific, so it asks for the one thing that would change
   * that instead of spending a call to generate four directions that fit any
   * essay ever written.
   */
  const missing = needsMore(req);
  if (missing) return Response.json({ kind: 'needs', ask: missing });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ kind: 'directions', directions: localGuide(req), fallback: true });
  }

  try {
    const client = new Anthropic();
    const student = req.student !== false && req.mode === 'assignment';
    const msg = (await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: [student ? ASSIGNMENT : PROJECT, describeLearner(req.learner)]
        .filter(Boolean)
        .join('\n\n'),
      messages: [{ role: 'user', content: promptFor(req) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as Anthropic.Message;

    if (msg.stop_reason === 'refusal') {
      return Response.json({ kind: 'directions', directions: localGuide(req), fallback: true });
    }
    const parsed = JSON.parse(extractText(msg)) as { directions?: GuideDirection[] };
    const directions = (parsed.directions ?? []).filter((d) => d.title?.trim()).slice(0, 4);
    if (!directions.length) throw new Error('empty guide');
    return Response.json({ kind: 'directions', directions, fallback: false });
  } catch (err) {
    console.error('[aria] guide: Claude call failed, using local directions:', err);
    return Response.json({ kind: 'directions', directions: localGuide(req), fallback: true });
  }
});
