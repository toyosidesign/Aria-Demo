/**
 * Per-user and process-wide ceilings on the routes that cost money.
 *
 * Authentication answers *who*; this answers *how much*. Without it a single
 * registered account, or one leaked token, can still run an unbounded Anthropic
 * or Resend bill.
 *
 * Two ceilings, checked in order, because they stop different attacks:
 *
 *  1. Per-user, bounds one honest account having a heavy day.
 *  2. Process-wide, bounds the bill when someone scripts a hundred accounts.
 *     Per-user limits are worthless against that on their own: signing up is
 *     free, so quota scaled linearly with however many addresses an attacker
 *     could cycle through. This is the circuit breaker, sized well above real
 *     aggregate traffic rather than as a throttle.
 *
 * ── The trade-off the second ceiling makes ────────────────────────────────────
 * A shared ceiling means one caller's spending can refuse another's request, so
 * it converts an unbounded *cost* risk into a bounded *availability* risk. That
 * is the right way round, a bill cannot be undone and an hour of 429s can, but
 * it is a real consequence, not a free win.
 *
 * The ratio is what keeps it honest: the per-user ceiling is ~6% of the global
 * one, so no single account can starve everyone else, and exhausting the shared
 * budget takes roughly 17 confirmed accounts acting together. That is the same
 * cost threshold the confirmed-contact requirement in lib/api-auth.ts imposes,
 * so neither control is the weak link.
 *
 * Raise ARIA_AI_GLOBAL_HOURLY as real traffic grows, a ceiling tight enough to
 * turn a busy afternoon into an outage is worse than no ceiling, because the
 * next person to hit it will simply delete it.
 *
 * ── Known limitation, stated plainly ──────────────────────────────────────────
 * The store is in-process. API routes can run in more than one instance and
 * restart on deploy, so this bounds abuse *per instance* rather than globally.
 * It needs no infrastructure and turns "unlimited" into "limited", which is most
 * of the benefit.
 *
 * ── If you move this to Redis, read this first ────────────────────────────────
 * Everything below is deliberately **synchronous**, and that is a correctness
 * property, not a style choice. JavaScript runs one task to completion, so
 * `peek` and `record` cannot interleave: two simultaneous requests are always
 * serialised and the ceiling is exact.
 *
 * Porting this to an async store by awaiting inside `limit` silently destroys
 * that. Between the `await peek(...)` and the `await record(...)` the runtime is
 * free to service other requests, so N concurrent callers can all observe
 * "under the limit" and all record a hit, the ceiling is overshot by up to N,
 * and precisely under the load an attacker creates. A naive port makes this
 * control weaker while looking like an upgrade.
 *
 * Do it atomically instead. With Upstash/Redis that means one round trip that
 * both tests and increments, a Lua script via EVAL, or INCR against a fixed
 * window with EXPIRE. Sketch:
 *
 *     -- KEYS[1] = bucket key, ARGV[1] = now, ARGV[2] = window ms, ARGV[3] = max
 *     redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
 *     local n = redis.call('ZCARD', KEYS[1])
 *     if n >= tonumber(ARGV[3]) then return {0, redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')[2]} end
 *     redis.call('ZADD', KEYS[1], ARGV[1], ARGV[1])
 *     redis.call('PEXPIRE', KEYS[1], ARGV[2])
 *     return {1, 0}
 *
 * And fail *closed onto this store* if Redis is unreachable, degrading to
 * per-instance limiting is acceptable, degrading to no limiting is not.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until a retry could succeed. Only meaningful when `ok` is false. */
  retryAfter: number;
}

const hits = new Map<string, number[]>();

/**
 * The id the process-wide ceiling is filed under.
 *
 * Real ids are Supabase UUIDs, so this cannot collide with a user's own bucket.
 */
const GLOBAL_ID = '__global';

/**
 * Drop timestamps nothing can be blocked by any more.
 *
 * Without this, a long-lived instance keeps one array per caller it has ever
 * seen, so the map grows for the life of the process.
 */
let lastSweep = 0;
function sweep(windowMs: number, now: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < windowMs);
    if (live.length) hits.set(key, live);
    else hits.delete(key);
  }
}

/**
 * Would this caller be allowed, without recording anything?
 *
 * Checking and recording are separate so a request can clear the per-user
 * ceiling and still be turned away by the process-wide one without having
 * consumed the caller's own quota. Prunes expired timestamps as it goes.
 */
function peek(
  bucket: string,
  id: string,
  max: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const key = `${bucket}:${id}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  // Keep the pruned list: a blocked attempt must not count as another hit, or
  // hammering the endpoint would push the retry time out indefinitely.
  hits.set(key, recent);

  if (recent.length >= max) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Charge one hit. Only ever called once every ceiling has already allowed it. */
function record(bucket: string, id: string, now: number) {
  const key = `${bucket}:${id}`;
  const recent = hits.get(key) ?? [];
  recent.push(now);
  hits.set(key, recent);
}

/**
 * Sliding window, so a burst at a boundary can't get two windows' worth.
 *
 * Nothing is recorded unless *both* ceilings allow the request, so a caller is
 * never charged for a rejection, neither their own, nor one caused by someone
 * else exhausting the shared ceiling.
 */
function limit(
  bucket: string,
  id: string,
  perUser: number,
  global: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(windowMs, now);

  const own = peek(bucket, id, perUser, windowMs, now);
  if (!own.ok) return own;

  const shared = peek(bucket, GLOBAL_ID, global, windowMs, now);
  if (!shared.ok) return shared;

  record(bucket, id, now);
  record(bucket, GLOBAL_ID, now);
  return { ok: true, retryAfter: 0 };
}

const HOUR = 60 * 60 * 1000;

/**
 * An operator-tunable ceiling, read once at module load.
 *
 * A typo must not silently disable the ceiling, so anything that isn't a
 * positive finite number falls back to the default rather than becoming
 * `NaN` (which every `>=` comparison would treat as "never full").
 */
function ceilingFrom(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Model calls: ample for a person working, ruinous for a script. */
const AI_PER_USER = ceilingFrom('ARIA_AI_PER_USER_HOURLY', 30);
const AI_GLOBAL = ceilingFrom('ARIA_AI_GLOBAL_HOURLY', 500);

/** Outbound mail is scarcer and far more damaging to abuse. */
const MAIL_PER_USER = ceilingFrom('ARIA_MAIL_PER_USER_HOURLY', 10);
const MAIL_GLOBAL = ceilingFrom('ARIA_MAIL_GLOBAL_HOURLY', 100);

export const limitAi = (userId: string): RateLimitResult =>
  limit('ai', userId, AI_PER_USER, AI_GLOBAL, HOUR);

export const limitMail = (userId: string): RateLimitResult =>
  limit('mail', userId, MAIL_PER_USER, MAIL_GLOBAL, HOUR);

/** 429 carrying the header a well-behaved client will honour. */
export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}

/** Test seam: the ceilings in force, so a test doesn't hardcode them. */
export const __ceilings = {
  aiPerUser: AI_PER_USER,
  aiGlobal: AI_GLOBAL,
  mailPerUser: MAIL_PER_USER,
  mailGlobal: MAIL_GLOBAL,
};

/** Test seam: lets the verification script start from a known state. */
export function __resetRateLimits() {
  hits.clear();
  lastSweep = 0;
}
