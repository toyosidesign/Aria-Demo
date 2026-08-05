import Anthropic from '@anthropic-ai/sdk';

import { protectedRoute } from '@/lib/api-auth';
import { BriefSchema, MAX_UPLOAD_BYTES } from '@/lib/api-schemas';
import { localBrief, type BriefFacts } from '@/lib/brief';
import { limitAi } from '@/lib/rate-limit';

/**
 * Read an assignment brief and say what it actually asks for.
 *
 * ── Why the confidence field is not optional ────────────────────────────────
 *
 * The model is told, in the schema and in the prompt, that every fact it
 * returns carries how sure it is. A deadline read off "Submit by 5pm on 14
 * March 2027" is high; one inferred from "end of week 9" is a guess, and a
 * guess presented as a fact is the failure mode that costs a grade.
 *
 * The instruction that matters most is the one about omission: a field it
 * cannot find must be left out rather than filled with something plausible. The
 * app has a good answer for a missing fact, the gap buttons on the extraction
 * card, and no answer at all for a confident wrong one.
 */

const SYSTEM = `You read assignment briefs and coursework specifications and extract only what is actually written in them.

Return these fields when the document states them, and OMIT any field the document does not state:
- deliverable: what has to be handed in, including length ("2,000-word essay", "10-slide deck plus notes")
- deadline: when it is due
- weighting: what it is worth ("40% of the module")
- criteria: what it is marked on, with the percentage for each when given
- format: referencing style, file format, font/spacing rules, anonymous marking rules

Rules:
- Never invent, infer beyond the text, or fill a field with a plausible default. An omitted field is correct and useful; a wrong one is not.
- confidence: "high" when the document states it outright, "medium" when it is stated indirectly, "low" when you are reading between the lines.
- deadline: resolve to YYYY-MM-DD when the document gives a real date. If it only says something relative ("week 9", "end of term"), return what it says with confidence "low" rather than converting it.
- title: a short name for the work, from the document. Omit if it does not name one.
- Return the criteria in the document's own words, shortened. Do not add criteria that are not listed.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    deliverable: { $ref: '#/$defs/field' },
    deadline: { $ref: '#/$defs/field' },
    weighting: { $ref: '#/$defs/field' },
    format: { $ref: '#/$defs/field' },
    criteria: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { label: { type: 'string' }, weight: { type: 'number' } },
            required: ['label'],
          },
        },
        confidence: { $ref: '#/$defs/confidence' },
      },
      required: ['items', 'confidence'],
    },
  },
  required: [],
  $defs: {
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    field: {
      type: 'object',
      additionalProperties: false,
      properties: { value: { type: 'string' }, confidence: { $ref: '#/$defs/confidence' } },
      required: ['value', 'confidence'],
    },
  },
} as const;

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * The brief itself, as whatever kind of block it is.
 *
 * A PDF goes as a document block so the model reads the real layout, tables of
 * criteria are the part that matters and the part that survives plain-text
 * extraction worst. A photo of a handout goes as an image. Text goes as text,
 * which is cheaper than both and is what a paste gives us.
 */
function contentFor(body: {
  text?: string;
  file?: { data: string; mediaType: string; name?: string };
  today: string;
  known?: BriefFacts;
}): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (body.file && body.file.mediaType === 'application/pdf') {
    blocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: body.file.data },
    });
  } else if (body.file && body.file.mediaType !== 'text/plain') {
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: body.file.mediaType as 'image/png' | 'image/jpeg' | 'image/webp',
        data: body.file.data,
      },
    });
  }
  if (body.text?.trim()) blocks.push({ type: 'text', text: body.text.trim() });

  const known = body.known ? JSON.stringify(body.known) : null;
  blocks.push({
    type: 'text',
    text: [
      `Today is ${body.today}. Use it only to resolve dates the document gives; never to invent one.`,
      // A second document is uploaded to fill gaps, so what is already known
      // goes in: re-answering a field the student already confirmed, with a
      // worse reading from a handbook, would undo their own correction.
      known ? `Already established (keep unless this document contradicts it): ${known}` : '',
      'Extract the fields you can support from the document. Omit the rest.',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  return blocks;
}

export const POST = protectedRoute(
  BriefSchema,
  limitAi,
  async (body) => {
    // Nothing to read is not an error, the card renders five gaps, each with
    // its own way forward, which is a usable screen.
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ facts: localBrief(body), fallback: true });
    }

    try {
      const client = new Anthropic();
      const msg = (await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: contentFor(body) }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as Anthropic.Message;

      if (msg.stop_reason === 'refusal') {
        return Response.json({ facts: localBrief(body), fallback: true });
      }

      const parsed = JSON.parse(extractText(msg)) as BriefFacts & { title?: string };
      const { title, ...facts } = parsed;
      // An extraction with nothing in it is a failure that looks like a success.
      // Fall back rather than hand the card an empty object it will draw as
      // five gaps with no explanation of why.
      if (!Object.keys(facts).length) {
        return Response.json({ facts: localBrief(body), fallback: true });
      }
      return Response.json({ facts, title, fallback: false });
    } catch (err) {
      // The brief itself never reaches the log, it is someone's coursework,
      // and the failure is about the call, not the contents.
      console.error('[aria] brief: Claude call failed, using local reader:', err);
      return Response.json({ facts: localBrief(body), fallback: true });
    }
  },
  // The one route entitled to a file. See MAX_UPLOAD_BYTES.
  MAX_UPLOAD_BYTES,
);
