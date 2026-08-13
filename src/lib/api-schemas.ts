import { z } from 'zod';

/**
 * Runtime shapes for the API routes.
 *
 * `as DraftRequest` on a parsed body is a compile-time fiction: it checks
 * nothing at runtime, so every field arrived unverified. These schemas are the
 * actual check.
 *
 * The length caps matter as much as the types. Every one of these strings is
 * interpolated into a prompt, so an unbounded string is an unbounded bill, a
 * single multi-megabyte body would otherwise cost more than a day of honest use.
 */

const TASK_KINDS = [
  'birthday',
  'anniversary',
  'event',
  'reminder',
  'assignment',
  'project',
  'general',
] as const;

const TASK_METHODS = [
  'sms',
  'email',
  'card',
  'photo',
  'call',
  'steps',
  'outline',
  'draft',
  'remind',
  'plan',
] as const;

export const LearnerSchema = z.object({
  role: z.enum(['student', 'employed', 'independent']).optional(),
  studying: z.string().max(80).optional(),
  level: z.string().max(40).optional(),
  interests: z.array(z.string().max(40)).max(12).optional(),
  explainStyle: z.enum(['direct', 'examples', 'stepwise']).optional(),
});

/** POST /api/draft */
export const DraftSchema = z.object({
  kind: z.enum(TASK_KINDS),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  contactName: z.string().max(120).optional(),
  method: z.enum(TASK_METHODS).optional(),
  subtaskTitle: z.string().max(300).optional(),
  research: z.boolean().optional(),
  /* Their own handling instruction. Bounded like every other free-text field:
     it reaches a prompt, so its size is an allocation decision, not a taste. */
  ownInstruction: z.string().max(2000).optional(),
  question: z.string().max(1000).optional(),
  /** Explain the topic itself, pitched at how this student asked to be taught. */
  explain: z.boolean().optional(),
  reflect: z.boolean().optional(),
  learner: LearnerSchema.optional(),
  senderName: z.string().max(120).optional(),
  senderContext: z.string().max(300).optional(),
  instruction: z.string().max(1000).optional(),
  previousDraft: z.string().max(8000).optional(),
});

/** POST /api/assistant */
export const AssistantSchema = z.object({
  message: z.string().min(1).max(2000),
  // The client sends today's date; a malformed one would reach the prompt as-is.
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(2000),
      }),
    )
    .max(20)
    .optional(),
  focus: z.enum(TASK_KINDS).optional(),
  senderName: z.string().max(120).optional(),
  senderContext: z.string().max(300).optional(),
});

/**
 * Who the work is for.
 *
 * Every field is capped. These land inside a system prompt, so an uncapped
 * string here is an instruction-injection surface as much as a size one, the
 * limits are small enough that nothing useful fits besides an actual answer.
 */

/** POST /api/subtasks */
/**
 * Nothing to send, and that is the point.
 *
 * The health route asks the server about itself, so an empty object is the
 * whole request. It still goes through the same validation as everything else:
 * a route that accepts any body because it happens to ignore the body is one
 * exception away from being the hole.
 */
export const HealthSchema = z.object({}).strict();

export const ChecklistSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  learner: LearnerSchema.optional(),
});

const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
const BriefFieldSchema = z.object({ value: z.string().max(600), confidence: ConfidenceSchema });

/**
 * What an extraction may contain, coming back in as well as going out.
 *
 * `known` carries the last extraction back to the server when a second document
 * is uploaded to fill gaps, so it is parsed with the same shape it was produced
 * with, a client is a client even when the data started here.
 */
export const BriefFactsSchema = z.object({
  deliverable: BriefFieldSchema.optional(),
  deadline: BriefFieldSchema.optional(),
  weighting: BriefFieldSchema.optional(),
  criteria: z
    .object({
      items: z
        .array(z.object({ label: z.string().max(160), weight: z.number().min(0).max(100).optional() }))
        .max(12),
      confidence: ConfidenceSchema,
    })
    .optional(),
  format: BriefFieldSchema.optional(),
});

/**
 * POST /api/brief
 *
 * The only route that accepts a file, and the only one allowed
 * `MAX_UPLOAD_BYTES`. The base64 cap here is the second net: 9MB of encoded
 * data is comfortably above the 6MB file the picker permits and comfortably
 * below the body ceiling, so a client that ignores the picker's limit is still
 * bounded by the schema rather than by memory.
 */
export const BriefSchema = z.object({
  text: z.string().max(60_000).optional(),
  file: z
    .object({
      data: z.string().max(9 * 1024 * 1024),
      mediaType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain']),
      name: z.string().max(200).optional(),
    })
    .optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  known: BriefFactsSchema.optional(),
});

/** POST /api/guide */
export const GuideSchema = z.object({
  mode: z.enum(['assignment', 'project']),
  title: z.string().min(1).max(300),
  focus: z.string().max(40),
  facts: BriefFactsSchema.optional(),
  definition: z.string().max(2000).optional(),
  scopeIn: z.array(z.string().max(200)).max(20).optional(),
  scopeOut: z.array(z.string().max(200)).max(20).optional(),
  note: z.string().max(2000).optional(),
  learner: LearnerSchema.optional(),
  student: z.boolean().optional(),
});

/**
 * A single header line, with no way to start another.
 *
 * CR and LF are how you smuggle extra headers through a field that ends up in
 * one, a `subject` of "Hi\nBcc: someone@else" is the whole trick. `to` and
 * `replyTo` already reject newlines (the EMAIL regex in the route excludes all
 * whitespace, and `.email()` rejects them outright), but `subject` was
 * unconstrained and inconsistent with them.
 *
 * Resend takes JSON and builds the MIME itself, so this is very unlikely to be
 * exploitable through that provider, it is here so the guarantee holds at the
 * boundary rather than depending on how a third party assembles headers.
 */
const headerSafe = z.string().refine((s) => !/[\r\n]/.test(s), {
  message: 'must not contain line breaks',
});

/** POST /api/send-email */
export const SendEmailSchema = z.object({
  // Validated as an address here rather than only split on commas downstream,
  // so a header-injection attempt or a bare word never reaches the provider.
  to: z.string().min(3).max(500),
  subject: headerSafe.max(300).optional(),
  // The body becomes the message text, not a header, so newlines belong here.
  body: z.string().max(20000),
  replyTo: z.string().email().max(200).optional(),
});

/**
 * Ceiling on a request body, enforced before it is parsed.
 *
 * The schemas above cap every field, but only once the body is already an
 * object in memory, so `request.json()` would happily buffer and parse a
 * multi-megabyte payload and only then reject it. The caps stopped an unbounded
 * *bill*; this stops an unbounded *allocation*, which is a cheaper attack
 * because one request does the damage.
 *
 * ── Why this number and not a tidier one ──────────────────────────────────────
 * It has to clear the largest body the schemas above actually permit, measured
 * in *bytes*, and those two units disagree. Zod's `.max()` counts UTF-16 code
 * units, but the wire carries UTF-8: one CJK character is a single unit and
 * three bytes. AssistantSchema allows `message` (2000) plus 20 history entries
 * of 2000, so a chat conducted in Japanese reaches ~128KB while every field is
 * still comfortably inside its documented limit.
 *
 * A 64KB cap looks generous against the character counts and silently rejects
 * that request, an outage visible only to people who don't write in English.
 * 256KB clears the real maximum with room to spare and still bounds the
 * allocation to something a server shrugs off.
 *
 * `scripts/security-check/offline.ts` asserts this holds by constructing that
 * worst-case body, so raising a field cap without revisiting this fails the
 * suite rather than breaking those users.
 */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * The one exception, and it is named so it stays one.
 *
 * A brief arrives as a PDF or a photo of a handout, and there is no way to read
 * one on the device, so the bytes themselves have to reach the model. Base64
 * inflates a file by a third, so the 6MB the picker accepts
 * (`MAX_BRIEF_BYTES` in lib/documents.ts) lands here at about 8MB.
 *
 * This is a real loosening of the allocation bound above, so it is deliberately
 * not a raise of that constant: every other route keeps 256KB, and this ceiling
 * is passed explicitly by the single route entitled to it. That route is
 * authenticated and on the AI quota, so the cost of a large body is paid by an
 * account that can be cut off, not by anyone with the URL.
 *
 * `scripts/security-check/offline.ts` asserts that only /api/brief uses it.
 */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Parse a request body against a schema.
 *
 * Returns the data, or null. The reason is deliberately not returned: the shape
 * of a request is the client's business, but which field failed and why is a
 * map of the server's internals.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<z.infer<T> | null> {
  // Cheap rejection first, for a client that declares its size honestly.
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  let raw: unknown;
  try {
    const text = await request.text();
    // content-length is the caller's claim; the bytes are the truth. A missing,
    // lying, or chunked-transfer body must not get a free pass, so the real
    // length is checked before anything parses it.
    if (byteLength(text) > maxBytes) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Bytes, not UTF-16 code units.
 *
 * `String.length` undercounts anything outside the BMP, an emoji-padded body
 * would measure at half its real size and slip past a length-based cap.
 */
function byteLength(text: string): number {
  return typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(text).length
    : // No TextEncoder (very old runtime): fall back to the conservative
      // assumption that every code unit could be a full 3-byte sequence.
      text.length * 3;
}

/** 400 in the same shape the routes already use. */
export const badRequest = (): Response =>
  Response.json({ error: 'Invalid request' }, { status: 400 });
