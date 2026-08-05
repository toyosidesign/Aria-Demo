/**
 * The backwards planner and the rollover rules. `npm run check:plan`.
 *
 * This is arithmetic that decides when a student starts working, so it is
 * checked rather than eyeballed. The cases that matter are the ones nobody
 * wants to reproduce by hand on a phone: a deadline tomorrow, a deadline
 * already gone, more steps than days, and a week where every useful day is
 * already spoken for.
 *
 * Pure module, no React, `lib/plan.ts` has no imports beyond date-fns for
 * exactly this reason.
 */

import assert from 'node:assert/strict';

import {
  DROP_AFTER_ROLLOVERS,
  GUIDE_AFTER_ROLLOVERS,
  bufferFor,
  dropQuestion,
  liveSteps,
  planBackwards,
  rolloverVerdict,
  strike,
} from '@/lib/plan';
import { briefGaps, localBrief, priorityFromWeighting, tutorQuestion } from '@/lib/brief';
import { nextTourDate } from '@/lib/demo';

let passed = 0;
const failures: string[] = [];

function test(name: string, body: () => void) {
  try {
    body();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures.push(name);
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${message}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const STEPS = [
  { title: 'Read the sources' },
  { title: 'Draft the argument' },
  { title: 'Write it up' },
  { title: 'Proofread' },
];

// ───────────────────────────────────────────────────────────────────────────────
section('Working back from the deadline');

test('every step lands before the deadline, in order', () => {
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: STEPS });
  const work = plan.steps.filter((s) => !s.buffer);
  assert.equal(work.length, STEPS.length, 'no step may be dropped');
  for (const s of work) {
    assert.ok(s.due < '2026-09-30', `${s.title} must finish before the deadline`);
    assert.ok(s.due >= '2026-09-01', `${s.title} must not be planned into the past`);
  }
  // Order is preserved: you cannot proofread before you have written anything.
  for (let i = 1; i < work.length; i += 1) {
    assert.ok(work[i - 1].due <= work[i].due, 'steps must stay in order');
  }
  assert.deepEqual(work.map((s) => s.title), STEPS.map((s) => s.title));
});

test('the run-up to the deadline is reserved first, and is visible', () => {
  /*
   * The buffer covers printing, uploading, a portal that rejects the file type,
   * and a submission page that will not load. Reserved before any work is
   * placed so an overrunning plan eats its own steps rather than the run-up , 
   * and drawn as a row, because reserved time nobody can see gets booked over.
   */
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: STEPS });
  const buffer = plan.steps.find((s) => s.buffer);
  assert.ok(buffer, 'the buffer must be a row of the plan');
  assert.equal(buffer!.due, '2026-09-30');
  assert.equal(plan.bufferDays, 2, 'a month out earns two days');
  const lastWork = plan.steps.filter((s) => !s.buffer).at(-1)!;
  assert.ok(lastWork.due <= '2026-09-28', 'work must stop before the reserved days');
});

test('the buffer shrinks with the time available, and disappears when there is none', () => {
  assert.equal(bufferFor(30), 2);
  assert.equal(bufferFor(10), 1);
  // Two days out, reserving one would leave a single day for the whole thing.
  // Honest is better: no buffer, and the plan says what it is.
  assert.equal(bufferFor(2), 0);
  assert.equal(bufferFor(1), 0);
});

test('the first step is where the answer is, when work has to start', () => {
  /*
   * The whole reason for planning backwards. Forwards planning answers "what
   * shall I do first", which is not the question a deadline asks.
   */
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: STEPS });
  assert.equal(plan.startsOn, plan.steps[0].due);
  assert.ok(plan.startsOn >= '2026-09-01' && plan.startsOn < '2026-09-30');
});

test('time is shared out by what the work is marked on', () => {
  /*
   * The difference between a plan and a list. A step serving a 40% criterion
   * earns more of the calendar than one serving 10%, so the same four steps
   * against a different rubric produce a different plan.
   */
  const weighted = planBackwards({
    deadline: '2026-10-01',
    today: '2026-09-01',
    steps: [
      { title: 'Argument', weight: 60 },
      { title: 'Presentation', weight: 5 },
    ],
  });
  const [argument, presentation] = weighted.steps.filter((s) => !s.buffer);
  /*
   * A step's share is the stretch that ends on its due date, so the first one
   * is measured from today rather than from `startsOn`, `startsOn` *is* the
   * first step's due date, and measuring from it would report nought days for
   * whichever step got the most of them.
   */
  const argumentDays = daysBetween('2026-09-01', argument.due);
  const presentationDays = daysBetween(argument.due, presentation.due);
  assert.ok(
    argumentDays > presentationDays,
    `the 60% step must get more days (${argumentDays} vs ${presentationDays})`,
  );
});

test('days already spoken for are stepped over', () => {
  /*
   * A plan that puts three hours of reading on a day with two lectures is a
   * plan that gets abandoned in week one.
   */
  const busy = ['2026-09-28', '2026-09-27', '2026-09-26'];
  const plan = planBackwards({
    deadline: '2026-09-30',
    today: '2026-09-01',
    steps: STEPS,
    busy,
  });
  for (const s of plan.steps.filter((x) => !x.buffer)) {
    assert.ok(!busy.includes(s.due), `${s.title} landed on a day that is already taken`);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
section('When there is not enough time');

test('a plan that does not fit is still returned, and says so', () => {
  /*
   * A refusal would leave the student with nothing. A compressed plan plus
   * "there is not room for this" lets them decide what to cut, which is the
   * decision that actually needs making.
   */
  const plan = planBackwards({ deadline: '2026-09-03', today: '2026-09-01', steps: STEPS });
  assert.equal(plan.tight, true);
  assert.equal(plan.steps.filter((s) => !s.buffer).length, STEPS.length, 'nothing is silently dropped');
  for (const s of plan.steps) assert.ok(s.due >= '2026-09-01', 'and nothing is planned into the past');
});

test('a deadline that has already gone is reported, not rescheduled', () => {
  const plan = planBackwards({ deadline: '2026-08-30', today: '2026-09-01', steps: STEPS });
  assert.equal(plan.late, true);
  assert.equal(plan.bufferDays, 0, 'there is nothing left to reserve');
  for (const s of plan.steps) assert.equal(s.due, '2026-08-30');
});

test('a deadline today is late, not a one-day plan', () => {
  const plan = planBackwards({ deadline: '2026-09-01', today: '2026-09-01', steps: STEPS });
  assert.equal(plan.late, true);
});

test('no steps means no plan, and no crash', () => {
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: [] });
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.tight, false);
});

test('a fully busy stretch does not push work into the past', () => {
  // Every remaining day is taken. The planner must stack rather than reverse
  // past today, which would produce dates that have already happened.
  const busy = ['2026-09-02', '2026-09-03', '2026-09-04'];
  const plan = planBackwards({ deadline: '2026-09-05', today: '2026-09-01', steps: STEPS, busy });
  for (const s of plan.steps) assert.ok(s.due >= '2026-09-01');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Striking things out');

test('a struck step stays visible and stops being work', () => {
  /*
   * Struck rather than deleted: "I am not doing that" is a decision worth being
   * able to see and reverse, and a plan that loses rows when tapped is one
   * nobody taps.
   */
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: STEPS });
  const struck = strike(plan.steps, 'Proofread');
  assert.equal(struck.length, plan.steps.length, 'the row is still there');
  assert.equal(struck.find((s) => s.title === 'Proofread')?.struck, true);
  assert.ok(!liveSteps(struck).some((s) => s.title === 'Proofread'), 'but it is not a step any more');
  // Tapping again puts it back.
  assert.equal(strike(struck, 'Proofread').find((s) => s.title === 'Proofread')?.struck, false);
});

test('the buffer never becomes a checklist item', () => {
  const plan = planBackwards({ deadline: '2026-09-30', today: '2026-09-01', steps: STEPS });
  assert.ok(!liveSteps(plan.steps).some((s) => s.buffer), 'reserved time is not a task');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Rollovers');

test('twice offers the Guide, three times asks the question', () => {
  /*
   * A step that keeps moving is a message, not a scheduling problem. Silence
   * on the third reschedule is what makes a planner into a nag.
   */
  assert.deepEqual(rolloverVerdict(0), { offerGuide: false, askToDrop: false });
  assert.deepEqual(rolloverVerdict(1), { offerGuide: false, askToDrop: false });
  assert.equal(rolloverVerdict(GUIDE_AFTER_ROLLOVERS).offerGuide, true);
  assert.equal(rolloverVerdict(GUIDE_AFTER_ROLLOVERS).askToDrop, false, 'help before judgement');
  assert.equal(rolloverVerdict(DROP_AFTER_ROLLOVERS).askToDrop, true);
  assert.ok(GUIDE_AFTER_ROLLOVERS < DROP_AFTER_ROLLOVERS, 'the offer must come first');
});

test('the drop question is answerable, and names the step', () => {
  const q = dropQuestion('Read the sources');
  assert.match(q, /Read the sources/);
  assert.match(q, /\?$/, 'it has to be a question, not a verdict');
});

// ───────────────────────────────────────────────────────────────────────────────
section('The demo tour jumps somewhere');

test('the tour never picks the day you are already on', () => {
  /*
   * The bug this exists to prevent, and it shipped once. Three seeded tasks
   * fall on the current day, so a "today or later" rule returned today: the
   * switch set the date it was already on, nothing changed, and it flicked
   * straight back off. A control that visibly undoes itself reads as broken.
   */
  const today = '2026-09-10';
  assert.equal(nextTourDate([today, '2026-09-12'], today), '2026-09-12');
  assert.equal(nextTourDate([today, today], today), undefined, 'only today means nowhere to go');
});

test('it takes the soonest of them, whatever order they arrive in', () => {
  // The store hands over task dates unsorted, and the nearest one is the one
  // worth seeing, a tour that opens three weeks out demonstrates nothing today.
  assert.equal(
    nextTourDate(['2026-09-30', '2026-09-12', '2026-09-21'], '2026-09-10'),
    '2026-09-12',
  );
});

test('nothing waiting means no offer at all', () => {
  // The caller hides the row on undefined. An offer that goes nowhere is worse
  // than no offer, so this has to be distinguishable from a date.
  assert.equal(nextTourDate([], '2026-09-10'), undefined);
  assert.equal(nextTourDate(['2026-09-01', '2026-09-09'], '2026-09-10'), undefined);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Reading a brief without a model');

test('the local reader finds what is unambiguous and claims low confidence', () => {
  const facts = localBrief({
    today: '2026-09-01',
    text: 'Write a 2,000 word essay. Worth 40% of the module. Due 2026-11-14. Harvard referencing.',
  });
  assert.equal(facts.deliverable?.value, '2,000 words');
  assert.equal(facts.deadline?.value, '2026-11-14');
  assert.match(facts.weighting?.value ?? '', /40%/);
  assert.match(facts.format?.value ?? '', /Harvard/i);
  for (const field of [facts.deliverable, facts.deadline, facts.weighting, facts.format]) {
    assert.equal(field?.confidence, 'low', 'a regex is never sure');
  }
});

test('it refuses to guess a date it cannot resolve', () => {
  /*
   * The one mistake this must not make. "Week 9" means nothing without a term
   * calendar, and a wrong deadline is the failure that costs a grade, so it
   * stays a gap, and the card offers to ask the tutor.
   */
  const facts = localBrief({ today: '2026-09-01', text: 'Submit by the end of week 9.' });
  assert.equal(facts.deadline, undefined);
  assert.ok(briefGaps(facts).includes('deadline'));
});

test('an uploaded file with no key produces gaps, not inventions', () => {
  // The local reader cannot open a PDF. Five gaps with three ways forward each
  // is a usable screen; five invented facts is not.
  const facts = localBrief({ today: '2026-09-01', file: { data: 'x', mediaType: 'application/pdf' } });
  assert.equal(briefGaps(facts).length, 5);
});

test('a second document fills gaps without overwriting what was known', () => {
  const known = { deadline: { value: '2026-11-14', confidence: 'high' as const } };
  const facts = localBrief({ today: '2026-09-01', text: 'Due 2026-12-01. Harvard referencing.', known });
  assert.equal(facts.deadline?.value, '2026-11-14', 'the established fact wins');
  assert.match(facts.format?.value ?? '', /Harvard/i, 'and the gap is filled');
});

test('the tutor question is sendable as it stands', () => {
  const one = tutorQuestion(['deadline'], 'History essay');
  assert.match(one, /History essay/);
  assert.match(one, /when it is due/);
  // Several gaps become one message: three emails about one brief is worse for
  // the tutor and less likely to be sent.
  const many = tutorQuestion(['deadline', 'weighting', 'criteria'], 'History essay');
  assert.equal(many.split('\n\n').length, one.split('\n\n').length, 'still one message');
  assert.match(many, /and what it is marked on/);
});

test('priority comes from the weighting, and copes with nonsense', () => {
  assert.equal(priorityFromWeighting({ weighting: { value: '40%', confidence: 'high' } }), 'high');
  assert.equal(priorityFromWeighting({ weighting: { value: '10%', confidence: 'high' } }), 'low');
  assert.equal(priorityFromWeighting({ weighting: { value: '20%', confidence: 'high' } }), 'medium');
  assert.equal(priorityFromWeighting({ weighting: { value: 'a lot', confidence: 'low' } }), 'medium');
  assert.equal(priorityFromWeighting(undefined), 'medium');
});

// ───────────────────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

console.log(
  failures.length
    ? `\n\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n` +
        failures.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${passed} plan checks passed.\x1b[0m`,
);
process.exit(failures.length ? 1 : 0);
