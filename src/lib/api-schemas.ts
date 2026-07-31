import { z } from 'zod';

/**
 * Runtime shapes for the API routes.
 *
 * `as DraftRequest` on a parsed body is a compile-time fiction: it checks
 * nothing at runtime, so every field arrived unverified. These schemas are the
 * actual check.
 *
 * The length caps matter as much as the types. Every one of these strings is
 * interpolated into a prompt, so an unbounded string is an unbounded bill — a
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

/** POST /api/draft */
export const DraftSchema = z.object({
  kind: z.enum(TASK_KINDS),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  contactName: z.string().max(120).optional(),
  method: z.enum(TASK_METHODS).optional(),
  subtaskTitle: z.string().max(300).optional(),
  research: z.boolean().optional(),
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
 * string here is an instruction-injection surface as much as a size one — the
 * limits are small enough that nothing useful fits besides an actual answer.
 */
export const LearnerSchema = z.object({
  studying: z.string().max(80).optional(),
  level: z.string().max(40).optional(),
  interests: z.array(z.string().max(40)).max(12).optional(),
  explainStyle: z.enum(['direct', 'examples', 'stepwise']).optional(),
});

/** POST /api/subtasks */
export const ChecklistSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  learner: LearnerSchema.optional(),
});

/**
 * A single header line, with no way to start another.
 *
 * CR and LF are how you smuggle extra headers through a field that ends up in
 * one — a `subject` of "Hi\nBcc: someone@else" is the whole trick. `to` and
 * `replyTo` already reject newlines (the EMAIL regex in the route excludes all
 * whitespace, and `.email()` rejects them outright), but `subject` was
 * unconstrained and inconsistent with them.
 *
 * Resend takes JSON and builds the MIME itself, so this is very unlikely to be
 * exploitable through that provider — it is here so the guarantee holds at the
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
 * object in memory — so `request.json()` would happily buffer and parse a
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
 * that request — an outage visible only to people who don't write in English.
 * 256KB clears the real maximum with room to spare and still bounds the
 * allocation to something a server shrugs off.
 *
 * `scripts/security-check/offline.ts` asserts this holds by constructing that
 * worst-case body, so raising a field cap without revisiting this fails the
 * suite rather than breaking those users.
 */
export const MAX_BODY_BYTES = 256 * 1024;

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
): Promise<z.infer<T> | null> {
  // Cheap rejection first, for a client that declares its size honestly.
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

  let raw: unknown;
  try {
    const text = await request.text();
    // content-length is the caller's claim; the bytes are the truth. A missing,
    // lying, or chunked-transfer body must not get a free pass, so the real
    // length is checked before anything parses it.
    if (byteLength(text) > MAX_BODY_BYTES) return null;
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
 * `String.length` undercounts anything outside the BMP — an emoji-padded body
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
