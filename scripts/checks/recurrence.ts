/**
 * Recurrence date maths. Run with `npm run check:recurrence`.
 *
 * Here because calendar arithmetic is the kind of thing that looks obviously
 * right and is wrong twice a year. The cases that matter are the ones a naive
 * "add 30 days" or "bump the month number" implementation gets wrong: the 31st
 * of a month that has no 31st, the 29th of February, and a repeating task that
 * was left unticked long enough that stepping once would land it in the past.
 */

import assert from 'node:assert/strict';

import {
  REPEAT_LABEL,
  REPEAT_OPTIONS,
  effectiveToday,
  nextFutureOccurrence,
  nextOccurrence,
} from '@/lib/dates';

let pass = 0; const fail: string[] = [];
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message.split('\n')[0]}`); }
};

console.log('\nnextOccurrence, plain steps');
t('daily', () => assert.equal(nextOccurrence('2026-07-30', 'daily'), '2026-07-31'));
t('weekly', () => assert.equal(nextOccurrence('2026-07-30', 'weekly'), '2026-08-06'));
t('fortnightly', () => assert.equal(nextOccurrence('2026-07-30', 'fortnightly'), '2026-08-13'));
t('monthly', () => assert.equal(nextOccurrence('2026-07-30', 'monthly'), '2026-08-30'));
t('yearly', () => assert.equal(nextOccurrence('2026-07-30', 'yearly'), '2027-07-30'));

console.log('\nthe end-of-month traps');
t('31 Jan monthly -> 28 Feb, not 3 Mar', () =>
  assert.equal(nextOccurrence('2027-01-31', 'monthly'), '2027-02-28'));
t('31 Mar monthly -> 30 Apr', () =>
  assert.equal(nextOccurrence('2026-03-31', 'monthly'), '2026-04-30'));
t('29 Feb yearly -> 28 Feb on a non-leap year', () =>
  assert.equal(nextOccurrence('2028-02-29', 'yearly'), '2029-02-28'));
t('daily across a month boundary', () =>
  assert.equal(nextOccurrence('2026-07-31', 'daily'), '2026-08-01'));
t('daily across a year boundary', () =>
  assert.equal(nextOccurrence('2026-12-31', 'daily'), '2027-01-01'));

console.log('\nnextFutureOccurrence, never lands in the past');
t('a daily task ignored for 2 weeks lands tomorrow, not 2 weeks ago', () => {
  const next = nextFutureOccurrence('2026-07-16', 'daily', '2026-07-30');
  assert.equal(next, '2026-07-31');
});
t('a weekly task ignored for months lands in the future', () => {
  const next = nextFutureOccurrence('2026-01-05', 'weekly', '2026-07-30');
  assert.ok(next > '2026-07-30', `${next} must be after today`);
  // and it must stay on the same weekday
  assert.equal(new Date(next + 'T00:00:00').getDay(), new Date('2026-01-05T00:00:00').getDay());
});
t('a monthly task keeps its day-of-month when catching up', () => {
  const next = nextFutureOccurrence('2026-01-15', 'monthly', '2026-07-30');
  assert.equal(next, '2026-08-15');
});
t('an on-time completion just steps once', () => {
  assert.equal(nextFutureOccurrence('2026-07-30', 'weekly', '2026-07-30'), '2026-08-06');
});
t('a future-dated task still steps forward from its own date', () => {
  assert.equal(nextFutureOccurrence('2026-08-20', 'weekly', '2026-07-30'), '2026-08-27');
});
t('a malformed date cannot hang the loop', () => {
  const out = nextFutureOccurrence('not-a-date', 'daily', '2026-07-30');
  assert.equal(typeof out, 'string');
});

console.log('\nevery option is wired up');
t('each REPEAT_OPTION advances and has a label', () => {
  for (const o of REPEAT_OPTIONS) {
    assert.ok(REPEAT_LABEL[o.value], `${o.value} needs a label`);
    assert.notEqual(nextOccurrence('2026-07-30', o.value), '2026-07-30', `${o.value} must move`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\neffectiveToday, the demo cannot accept a date it draws as overdue');

t('with no simulation, it is the real date', () => {
  const real = new Date();
  const iso = `${real.getFullYear()}-${String(real.getMonth() + 1).padStart(2, '0')}-${String(real.getDate()).padStart(2, '0')}`;
  assert.equal(effectiveToday(iso), iso);
});

t('simulating forward, the simulated day wins', () => {
  const real = new Date();
  const ahead = new Date(real.getTime() + 11 * 864e5);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(effectiveToday(iso(ahead)), iso(ahead));
});

t('THE BUG: a day before the simulated today is now rejected', () => {
  const real = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const demo = iso(new Date(real.getTime() + 10 * 864e5)); // simulating +10 days
  const picked = iso(new Date(real.getTime() + 5 * 864e5)); // 5 days out: past in-world

  const today = effectiveToday(demo);
  assert.equal(picked < today, true, 'must be flagged as past');

  // What the old code did: compare against the real date only.
  assert.equal(picked < iso(real), false, 'old check let this through, that was the bug');
});

t('a stale demo date behind the real one cannot rewind validation', () => {
  const real = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const behind = iso(new Date(real.getTime() - 30 * 864e5));
  assert.equal(effectiveToday(behind), iso(real), 'must clamp forward to the real date');
});

console.log(
  fail.length
    ? `\n\x1b[31m${fail.length} failed\x1b[0m, ${pass} passed\n` + fail.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${pass} checks passed.\x1b[0m`,
);
process.exit(fail.length ? 1 : 0);
