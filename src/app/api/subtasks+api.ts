import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
import { ChecklistSchema } from '@/lib/api-schemas';
import { limitAi } from '@/lib/rate-limit';
import { localChecklist } from '@/lib/subtasks';

const SYSTEM = `You help someone break a piece of work into a clear, actionable checklist of topics/sections to work on.
Given an assignment title (and optional notes), return 5–8 short, concrete items specific to the SUBJECT: the actual topics or sections the student should cover, in a sensible order. Each item is a few words, no numbering, no punctuation at the end, and no dashes or hyphens.
Example, "Essay on the history of America": ["Colonial era and settlement", "Road to independence", "The Revolutionary War", "Building the new nation", "Civil War and abolition", "Industrialization and immigration", "Civil rights movement", "Modern America"].`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['items'],
} as const;

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Authentication, quota and validation are the wrapper's job, so they cannot be
// forgotten here. See lib/api-auth.ts.
export const POST = protectedRoute(ChecklistSchema, limitAi, async (body) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ items: localChecklist(body) });
  }

  try {
    const client = new Anthropic();
    const msg = (await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Assignment: "${body.title}"${body.description ? `\nNotes: ${body.description}` : ''}`,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as Anthropic.Message;

    if (msg.stop_reason === 'refusal') {
      return Response.json({ items: localChecklist(body) });
    }
    const parsed = JSON.parse(extractText(msg)) as { items?: string[] };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) throw new Error('bad shape');
    return Response.json({ items: parsed.items });
  } catch (err) {
    console.error('[aria] subtasks: Claude call failed, using local checklist:', err);
    return Response.json({ items: localChecklist(body) });
  }
});
