/**
 * The Pro daily review, asserted end to end. `npm run check:review`.
 *
 * This is the one feature where approving a screen causes something to leave
 * the device with nobody watching, so what each item promises has to be exactly
 * what happens. The cases below are the ones where a wrong answer costs
 * somebody something real: a text counted as sent when no app may send it, a
 * task approved with no recipient, an email going out with no hold.
 *
 * Pure module, no React: lib/daily-review.ts is built that way so this file can
 * walk it without a renderer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_ACTION_TIME,
  HOLD_MINUTES,
  buildReview,
  isAutonomous,
  reviewNotification,
  reviewSummary,
  runAtFor,
} from '@/lib/daily-review';
import { TIERS, can, tierOf } from '@/lib/entitlements';
import {
  FREE_DAILY_WRITES,
  limitReachedNote,
  remainingWrites,
  writesLeftNote,
} from '@/lib/quota';
import { routeForNotification } from '@/lib/notification-routes';
import { WORK_AHEAD_DAYS, WORK_AHEAD_LIMIT, workAhead, workAheadReport } from '@/lib/work-ahead';
import { catchUp, catchUpReport } from '@/lib/plan';
import {
  ASSEMBLE_LEAD_DAYS,
  assemble,
  assembleReport,
  assembledFilename,
  countWords,
  factsFromSections,
  readyToAssemble,
  targetWordCount,
} from '@/lib/assemble';
import type { Task } from '@/store/aria-store';

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

const TODAY = '2026-09-15';
const NOW = new Date('2026-09-15T08:00:00');

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Email Dr Reyes',
    date: TODAY,
    priority: 'medium',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    method: 'email',
    contactName: 'Dr Reyes',
    contactEmail: 'reyes@university.edu',
    description: 'Asking for two more days on the problem set.',
    createdAt: '2026-09-01T09:00:00.000Z',
    ...over,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
section('What approval actually means');

test('an email is the only thing Aria says it will send', () => {
  /*
   * The whole honesty of the feature. A server can finish an email; it cannot
   * send a text or a WhatsApp, because neither platform lets an app do it. If
   * those were counted as "sent", the failure would be discovered by the person
   * who never got the message.
   */
  assert.equal(isAutonomous('email'), true);
  assert.equal(isAutonomous('sms'), false);
  assert.equal(isAutonomous('whatsapp'), false);
});

test('a text is prepared, not sent, and the wording says so', () => {
  const review = buildReview(
    [task({ method: 'sms', contactPhone: '+15550000', contactEmail: undefined })],
    TODAY,
    NOW,
  );
  assert.equal(review.sending.length, 0, 'nothing may be counted as sent');
  assert.equal(review.preparing.length, 1);
  assert.match(review.preparing[0].line, /one tap/i, 'it has to say a tap is still needed');
});

test('an essay, a call and a reminder are the person’s own', () => {
  const review = buildReview(
    [
      task({ id: 'a', method: 'steps', title: 'History essay' }),
      task({ id: 'b', method: 'call', title: 'Ring the dentist' }),
      task({ id: 'c', method: 'remind', title: 'Gym' }),
    ],
    TODAY,
    NOW,
  );
  assert.equal(review.yours.length, 3);
  assert.equal(review.actionable.length, 0, 'approval must not claim these');
  assert.match(review.yours[1].line, /remind/i, 'a call is a reminder, not an action');
});

test('a card goes by email when there is an address, and WhatsApp when there is not', () => {
  const withEmail = buildReview([task({ method: 'card' })], TODAY, NOW);
  assert.equal(withEmail.sending[0].channel, 'email', 'the one channel Aria can finish');
  const withoutEmail = buildReview(
    [task({ method: 'card', contactEmail: undefined, contactPhone: '+15550000' })],
    TODAY,
    NOW,
  );
  assert.equal(withoutEmail.preparing[0].channel, 'whatsapp');
  assert.equal(withoutEmail.sending.length, 0);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Nothing goes out immediately');

test('every action is held for ten minutes at least', () => {
  /*
   * The promise onboarding makes in as many words. It is the only thing between
   * a mis-tap at breakfast and an email nobody can recall.
   */
  const review = buildReview([task({ time: '08:02' })], TODAY, NOW);
  const runAt = new Date(review.sending[0].runAt!).getTime();
  assert.ok(
    runAt >= NOW.getTime() + HOLD_MINUTES * 60_000,
    'an item due in two minutes must still wait out the hold',
  );
});

test('a time that has already gone is pushed to the hold, not skipped', () => {
  // Approving at 8am has to cover the 7am ones, or the review quietly drops
  // exactly the tasks somebody is already late on.
  const runAt = new Date(runAtFor(task({ time: '07:00' }), NOW)).getTime();
  assert.equal(runAt, NOW.getTime() + HOLD_MINUTES * 60_000);
});

test('a later time in the day is kept as it stands', () => {
  /*
   * Compared as instants, never as strings. `runAt` is UTC and the task's time
   * is local, so a string assertion passes or fails on the machine's timezone,
   * which is how this check first went green in London and would have failed in
   * New York.
   */
  const runAt = runAtFor(task({ time: '17:30' }), NOW);
  assert.equal(new Date(runAt).getTime(), new Date(`${TODAY}T17:30:00`).getTime());
});

test('no time means mid-morning rather than midnight', () => {
  // Midnight would put everything at the top of the day and send it all at
  // once, hours before anybody expects it.
  const runAt = runAtFor(task({ time: undefined }), new Date(`${TODAY}T05:00:00`));
  assert.equal(
    new Date(runAt).getTime(),
    new Date(`${TODAY}T${DEFAULT_ACTION_TIME}:00`).getTime(),
  );
});

// ───────────────────────────────────────────────────────────────────────────────
section('What cannot be approved says why');

test('a task with nobody to send to is shown, not dropped', () => {
  const review = buildReview([task({ contactEmail: undefined })], TODAY, NOW);
  assert.equal(review.blocked.length, 1);
  assert.match(review.blocked[0].blocked!, /email address/i);
  assert.equal(review.actionable.length, 0, 'and it is not counted as handled');
});

test('a task with nothing written is shown, not dropped', () => {
  const review = buildReview([task({ description: undefined })], TODAY, NOW);
  assert.equal(review.blocked.length, 1);
  assert.match(review.blocked[0].blocked!, /nothing written/i);
  assert.equal(review.actionable.length, 0);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Only today, and only what is open');

test('tomorrow is not approved today', () => {
  /*
   * Approving the day means the day. Reaching forward would be taking consent
   * for something the person has not looked at yet, which is the trust the
   * whole feature runs on.
   */
  const review = buildReview([task({ id: 'x', date: '2026-09-16' })], TODAY, NOW);
  assert.equal(review.items.length, 0);
});

test('anything already done is left alone', () => {
  const review = buildReview([task({ status: 'done' })], TODAY, NOW);
  assert.equal(review.items.length, 0);
});

// ───────────────────────────────────────────────────────────────────────────────
section('What the prompt says');

test('the summary counts rather than reassures', () => {
  const review = buildReview(
    [
      task({ id: 'a' }),
      task({ id: 'b', method: 'sms', contactPhone: '+1555', contactEmail: undefined }),
      task({ id: 'c', method: 'steps' }),
    ],
    TODAY,
    NOW,
  );
  const line = reviewSummary(review);
  assert.match(line, /3 things/);
  assert.match(line, /send 1/);
  assert.match(line, /1 ready/);
});

test('a day Aria cannot act on does not pretend otherwise', () => {
  const review = buildReview([task({ method: 'steps' })], TODAY, NOW);
  const line = reviewSummary(review);
  assert.match(line, /yours to do/i);
  assert.doesNotMatch(line, /approve/i, 'there is nothing to approve');
});

test('an empty day says so and stops', () => {
  const line = reviewSummary(buildReview([], TODAY, NOW));
  assert.match(line, /nothing due/i);
});

test('the notification carries the same sentence as the screen', () => {
  // Two copies of a promise drift. The notification is the summary, so what it
  // says at 8am is what the review shows when it opens.
  const review = buildReview([task()], TODAY, NOW);
  assert.equal(reviewNotification(review).body, reviewSummary(review));
  assert.match(reviewNotification(review).title, /review/i);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Where the tier line falls');

test('Free plans the work and Pro does it', () => {
  /*
   * The line is drawn around work rather than around sending, because sending
   * is the one thing that cannot be delivered: no mobile OS lets an app send a
   * text or a WhatsApp as the user. Everything Pro claims here is something the
   * app actually gates.
   */
  for (const capability of ['workAhead', 'planUpkeep', 'dailyReview', 'autonomousEmail', 'assemble'] as const) {
    assert.equal(can('pro', capability), true, `pro must have ${capability}`);
    assert.equal(can('free', capability), false, `free must not have ${capability}`);
  }
  assert.equal(tierOf(true), 'pro');
  assert.equal(tierOf(false), 'free');
});

test('neither tier is sold on something the platform forbids', () => {
  // The one sentence somebody could otherwise buy Pro believing. It is in the
  // pitch rather than a footnote.
  assert.match(TIERS.pro.limit, /tap/i);
  assert.match(TIERS.pro.limit, /texts|whatsapp/i);
  assert.ok(
    !TIERS.pro.points.some((p) => /text|whatsapp/i.test(p) && /send/i.test(p)),
    'no Pro point may promise sending a text',
  );
  // And Free is described as a whole product, not as a list of absences.
  assert.ok(TIERS.free.points.length >= 3);
  assert.ok(!/upgrade|unlock/i.test(TIERS.free.points.join(' ')), 'Free is not an advert for Pro');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Work done before you get there');

test('only what is missing, close, and possible', () => {
  const items = workAhead(
    [
      task({ id: 'has-words', date: TODAY, method: 'card', description: 'Already written' }),
      task({ id: 'no-recipient', date: TODAY, method: 'card', description: undefined, contactName: undefined }),
      task({ id: 'needs-words', date: TODAY, method: 'card', description: undefined }),
      task({ id: 'too-far', date: '2026-10-30', method: 'card', description: undefined }),
      task({ id: 'done', date: TODAY, status: 'done', method: 'card', description: undefined }),
    ],
    TODAY,
  );
  assert.deepEqual(items.map((i) => i.taskId), ['needs-words']);
});

test('a draft is never regenerated over one that exists', () => {
  /*
   * The rule that keeps this safe to run unattended. Somebody may have edited
   * those words by hand, and replacing them would be Aria overwriting work
   * while its owner was not looking.
   */
  const items = workAhead([task({ description: 'Mine, edited' })], TODAY);
  assert.equal(items.length, 0);
});

test('work with no steps gets broken down; work with steps gets the next one started', () => {
  /*
   * The breakdown used to be where Pro stopped: Aria produced the list
   * overnight and then waited, so somebody woke to six blank parts and the same
   * blank page they went to bed with. Now the first unwritten part is started.
   *
   * One part, and never ticked. Writing the whole essay while its author sleeps
   * is not help, it is a submission nobody has read, and the difference between
   * those two is exactly one part and an untouched checkbox.
   */
  const withoutSteps = workAhead([task({ kind: 'assignment', method: 'steps', subtasks: [] })], TODAY);
  assert.equal(withoutSteps[0]?.kind, 'breakdown');

  const withSteps = workAhead(
    [
      task({
        kind: 'assignment',
        method: 'steps',
        subtasks: [
          { id: 's1', title: 'Read', done: true },
          { id: 's2', title: 'Methods', done: false },
          { id: 's3', title: 'Results', done: false },
        ],
      }),
    ],
    TODAY,
  );
  assert.equal(withSteps.length, 1, 'one part per pass, not the whole plan');
  assert.equal(withSteps[0].kind, 'part');
  assert.equal(withSteps[0].subtaskTitle, 'Methods', 'the first one nobody has written');
});

test('a part already written is left alone', () => {
  /*
   * Same rule as a draft that exists: somebody may have written or edited that
   * section themselves, and rewriting it overnight is Aria overwriting work
   * while its owner is not looking.
   */
  const items = workAhead(
    [
      task({
        kind: 'assignment',
        method: 'steps',
        subtasks: [{ id: 's2', title: 'Methods', done: false }],
        draftSections: [{ title: 'Methods', content: 'Mine, written by hand.' }],
      }),
    ],
    TODAY,
  );
  assert.equal(items.length, 0);
});

test('the queue is bounded and takes the soonest first', () => {
  // Every item is a model call somebody pays for, so a Sunday-night dump of
  // twenty tasks cannot become twenty calls.
  const many = Array.from({ length: 10 }, (_, i) =>
    task({ id: `t${i}`, date: i === 9 ? TODAY : '2026-09-17', method: 'card', description: undefined }),
  );
  const items = workAhead(many, TODAY);
  assert.equal(items.length, WORK_AHEAD_LIMIT);
  assert.equal(items[0].taskId, 't9', 'the one due today comes first');
});

test('the horizon is days, not weeks', () => {
  const edge = workAhead([task({ date: '2026-09-18', method: 'card', description: undefined })], TODAY);
  assert.equal(edge.length, 1, `${WORK_AHEAD_DAYS} days out is still worth preparing`);
  const beyond = workAhead([task({ date: '2026-09-19', method: 'card', description: undefined })], TODAY);
  assert.equal(beyond.length, 0, 'past the horizon it would be rewritten before it was read');
});

test('a pass that did nothing says nothing', () => {
  assert.equal(workAheadReport([]), null);
  assert.match(
    workAheadReport([{ taskId: 'a', title: 'x', kind: 'draft', date: TODAY }]) ?? '',
    /1 message written/,
  );
});

// ───────────────────────────────────────────────────────────────────────────────
section('A plan that keeps itself true');

const STEP = (id: string, due: string, done = false) => ({ id, title: `Step ${id}`, done, due });

test('steps left in the past are spread across the days that are left', () => {
  const result = catchUp(
    [STEP('a', '2026-09-10'), STEP('b', '2026-09-12'), STEP('c', '2026-09-20')],
    TODAY,
    '2026-09-30',
  );
  assert.equal(result.moved, 2, 'both overdue steps counted');
  for (const s of result.steps) {
    assert.ok(s.due! >= TODAY, `${s.title} must not stay in the past`);
    assert.ok(s.due! <= '2026-09-30', `${s.title} must land before the deadline`);
  }
});

test('finished steps are never re-dated', () => {
  // They happened. Their date is a record, not an intention.
  const result = catchUp([STEP('a', '2026-09-01', true), STEP('b', '2026-09-02')], TODAY, '2026-09-30');
  assert.equal(result.steps[0].due, '2026-09-01');
});

test('only the steps that were actually late count as rolled over', () => {
  /*
   * The counter feeds the Guide offer at two and the drop question at three. A
   * step nudged along because an earlier one moved has not been avoided, and
   * counting it would have the app asking somebody to justify a step they were
   * never given the chance to do.
   */
  const result = catchUp([STEP('a', '2026-09-10'), STEP('b', '2026-09-25')], TODAY, '2026-09-30');
  const [late, notLate] = result.steps;
  assert.equal(late.rollovers, 1);
  assert.equal(notLate.rollovers, undefined);
});

test('a plan already on track is left exactly as it is', () => {
  const steps = [STEP('a', '2026-09-20'), STEP('b', '2026-09-25')];
  const result = catchUp(steps, TODAY, '2026-09-30');
  assert.equal(result.moved, 0);
  assert.deepEqual(result.steps, steps, 'no dates may shift for the sake of it');
});

test('when it no longer fits, it says so rather than pretending', () => {
  const result = catchUp(
    [STEP('a', '2026-09-01'), STEP('b', '2026-09-02'), STEP('c', '2026-09-03'), STEP('d', '2026-09-04')],
    TODAY,
    '2026-09-16',
  );
  assert.equal(result.tight, true);
  assert.match(catchUpReport(result, 'Essay'), /no longer fits/i);
  assert.match(catchUpReport({ steps: [], moved: 0, tight: false }, 'Essay'), /on track/i);
});

// ───────────────────────────────────────────────────────────────────────────────
section('A tapped notification lands on what it was about');

test('each kind of notification knows where it goes', () => {
  /*
   * Reported from a phone: a tapped task reminder opened "Get started", and
   * another opened "No finished tasks yet". Neither screen had anything to do
   * with the reminder. The cause was that a task alarm carried no data at all,
   * so a tap could only launch the app and the app went wherever its startup
   * logic decided.
   */
  assert.equal(routeForNotification({ kind: 'task-alarm', taskId: 'abc' }), '/task/abc');
  assert.equal(routeForNotification({ kind: 'daily-review' }), '/review');
  assert.equal(routeForNotification({ kind: 'automation', automationId: 'a1' }), '/aria/run');
});

test('a payload that means nothing routes nowhere', () => {
  /*
   * Null rather than a fallback to the home screen: sending an unrecognised
   * notification somewhere plausible looks exactly like a tap that did nothing,
   * and hides that something was scheduled this build no longer understands.
   */
  assert.equal(routeForNotification(undefined), null);
  assert.equal(routeForNotification({}), null);
  assert.equal(routeForNotification({ kind: 'something-else' }), null);
  // Half a payload is not a destination: a task alarm with no task cannot open
  // a task, and guessing one would open somebody else's.
  assert.equal(routeForNotification({ kind: 'task-alarm' }), null);
  assert.equal(routeForNotification({ kind: 'automation' }), null);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Assembling the document');

const FACTS = {
  deliverable: { value: '2,000-word essay, submitted as PDF', confidence: 'high' as const },
  deadline: { value: '2026-09-25', confidence: 'high' as const },
  weighting: { value: '40% of the module', confidence: 'high' as const },
  criteria: {
    items: [
      { label: 'Argument', weight: 40 },
      { label: 'Analysis', weight: 30 },
      { label: 'Structure', weight: 20 },
      { label: 'Referencing', weight: 10 },
    ],
    confidence: 'medium' as const,
  },
  format: { value: 'Harvard referencing, PDF', confidence: 'high' as const },
};

const SECTIONS = [
  { title: 'The brief', content: 'Deliverable: 2,000-word essay' },   // working notes
  { title: 'Introduction', content: 'word '.repeat(300) },
  { title: 'The argument', content: 'word '.repeat(900) },
];

test('the document is arrangement, never authorship', () => {
  /*
   * Every word came from the task. Nothing here calls a model, which is why it
   * is instant, free, and defensible: a student can say when each paragraph was
   * written. A version that generated the missing parts would be the one thing
   * this product must not do.
   */
  const out = assemble({ title: 'Cold War essay', deadline: '2026-09-25', facts: FACTS, sections: SECTIONS });
  assert.ok(out.body.includes('The argument'), 'written work belongs in the document');
  assert.ok(!out.body.includes('Deliverable: 2,000-word essay'), 'working notes do not');
  // 1200 words of prose plus the three words of the two headings, which are
  // part of the document a marker receives. The cover sheet is not.
  assert.equal(out.words, 1203, 'the count is the work, not the cover sheet');
});

test('the cover sheet says who, what, when and what it is marked on', () => {
  const out = assemble({
    title: 'Cold War essay', author: 'Maya Chen', context: '2nd year studying History',
    deadline: '2026-09-25', facts: FACTS, sections: SECTIONS,
  });
  for (const expected of ['Maya Chen', '2nd year studying History', 'Worth 40% of the module', 'Argument (40%)', 'Harvard referencing']) {
    assert.ok(out.body.includes(expected), `the cover sheet must carry: ${expected}`);
  }
  assert.match(out.body, /1203 words of 2000/);
});

test('the file name is one a marker can find again', () => {
  // A folder of forty files called "Essay.pdf" is the problem this solves.
  assert.equal(assembledFilename('Cold War essay', 'Maya Chen'), 'Maya Chen - Cold War essay.txt');
  // Punctuation is stripped rather than escaped: a slash in a title is a path
  // separator on at least one platform somebody will open this on.
  assert.equal(assembledFilename('Essay: part 1/2', 'Maya'), 'Maya - Essay part 12.txt');
  assert.equal(assembledFilename('', undefined), 'Assignment.txt');
});

test('a word target is read from the brief, commas and all', () => {
  assert.equal(targetWordCount(FACTS), 2000, '"2,000-word" is one number, not two');
  assert.equal(targetWordCount({ deliverable: { value: '1500 words', confidence: 'high' } }), 1500);
  assert.equal(targetWordCount({ deliverable: { value: '10-slide deck', confidence: 'high' } }), undefined);
  assert.equal(targetWordCount(undefined), undefined);
});

test('being short is reported as a number, not a percentage', () => {
  const thin = assemble({
    title: 'Cold War essay', deadline: '2026-09-25', facts: FACTS,
    sections: [{ title: 'Introduction', content: 'word '.repeat(400) }],
  });
  assert.ok(thin.warnings.some((w) => /1599 words short/.test(w)), 'a number is actionable tonight');
});

test('nothing written assembles anyway, and says what it is', () => {
  /*
   * A student at 11pm needs what exists rather than a refusal. The document is
   * produced whatever state the work is in, and the warning is what stops a
   * cover sheet being mistaken for an essay.
   */
  const empty = assemble({ title: 'Cold War essay', deadline: '2026-09-25', sections: [] });
  assert.ok(empty.body.includes('Cold War essay'), 'the cover sheet still exists');
  assert.equal(empty.words, 0);
  assert.ok(empty.warnings.some((w) => /nothing written yet/i.test(w)));
});

test('open steps and missing format rules are surfaced, never fixed silently', () => {
  const out = assemble({
    title: 'Cold War essay', deadline: '2026-09-25',
    facts: { ...FACTS, format: undefined },
    sections: SECTIONS,
    steps: [{ title: 'Read the sources', done: true }, { title: 'Referencing', done: false }],
  });
  assert.ok(out.warnings.some((w) => /Referencing/.test(w)), 'an open step is worth knowing about');
  assert.ok(out.warnings.some((w) => /format rules/i.test(w)));
});

test('a day before the deadline, and not the morning of', () => {
  /*
   * The lead time is the feature. Assembling on the day it is due produces the
   * same document and is no use: the point is having time to read it, fix what
   * is wrong, and still submit calmly.
   */
  assert.equal(ASSEMBLE_LEAD_DAYS, 1);
  assert.equal(readyToAssemble('2026-09-25', '2026-09-24'), true, 'the day before');
  assert.equal(readyToAssemble('2026-09-25', '2026-09-25'), true, 'and the day itself');
  assert.equal(readyToAssemble('2026-09-25', '2026-09-23'), false, 'not two days out');
  assert.equal(readyToAssemble('2026-09-25', '2026-09-26'), false, 'and never after it has gone');
});

test('the handover says the size and how much to check', () => {
  const clean = assemble({
    title: 'Cold War essay', deadline: '2026-09-25',
    facts: { ...FACTS, deliverable: undefined },
    sections: [{ title: 'Introduction', content: 'word '.repeat(50) }],
    steps: [{ title: 'Done', done: true }],
  });
  assert.match(assembleReport(clean), /51 words/);
  const messy = assemble({ title: 'x', deadline: '2026-09-25', facts: FACTS, sections: SECTIONS });
  assert.match(assembleReport(messy), /to look at/);
});

test('the brief is read back off the task, and never guessed', () => {
  /*
   * There is no column for the brief, so setup writes it onto the task as the
   * same readable summary the card showed, and assembly parses that back. The
   * safety property is what matters: a line it does not recognise produces
   * nothing rather than something wrong. A missing weighting is a cover sheet
   * without one; an invented deadline would be the worst bug this app has.
   */
  const facts = factsFromSections([
    { title: 'The brief', content: 'Deliverable: 2,000-word essay\nWeighting: 40% of the module\nMarked on: Argument (40%), Analysis (30%)\nFormat rules: Harvard, PDF' },
    { title: 'Introduction', content: 'not the brief' },
  ]);
  assert.equal(facts?.deliverable?.value, '2,000-word essay');
  assert.equal(facts?.weighting?.value, '40% of the module');
  assert.deepEqual(facts?.criteria?.items, [
    { label: 'Argument', weight: 40 },
    { label: 'Analysis', weight: 30 },
  ]);
  assert.equal(facts?.format?.value, 'Harvard, PDF');
  // Nothing to read: nothing claimed.
  assert.equal(factsFromSections([{ title: 'Introduction', content: 'x' }]), undefined);
  assert.equal(factsFromSections(undefined), undefined);
  assert.equal(factsFromSections([{ title: 'The brief', content: 'Nonsense with no labels' }]), undefined);
});

test('words are counted the way a marker counts them', () => {
  // The apostrophe does not split a word, and the punctuation is not one.
  assert.equal(countWords("Aria's plan, working back from the deadline."), 7);
  assert.equal(countWords('   '), 0);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Free has a day of writing, and everything else forever');

test('the allowance resets daily and never carries over', () => {
  /*
   * Unused writing is not credit. A week away should not buy a Sunday of
   * eighty-four drafts, and the number people plan around is the daily one.
   */
  assert.equal(remainingWrites(undefined, TODAY), FREE_DAILY_WRITES, 'a fresh day is full');
  assert.equal(remainingWrites({ date: TODAY, count: 5 }, TODAY), FREE_DAILY_WRITES - 5);
  assert.equal(
    remainingWrites({ date: '2026-01-01', count: FREE_DAILY_WRITES }, TODAY),
    FREE_DAILY_WRITES,
    "yesterday's spending is yesterday's",
  );
  assert.equal(remainingWrites({ date: TODAY, count: 99 }, TODAY), 0, 'never negative');
});

test('the app stays quiet until the limit is nearly here', () => {
  /*
   * Counting down from twelve turns a planner into a meter. The point is a
   * limit somebody meets on a heavy day and never notices on an ordinary one.
   */
  assert.equal(writesLeftNote({ date: TODAY, count: 2 }, TODAY), null, 'silent early on');
  assert.match(writesLeftNote({ date: TODAY, count: 11 }, TODAY) ?? '', /1 piece/);
  assert.match(writesLeftNote({ date: TODAY, count: 12 }, TODAY) ?? '', /resets tomorrow/);
});

test('being stopped says the number, the time, and what still works', () => {
  /*
   * Somebody stopped mid-task is owed a fact and a time, not a pitch. And the
   * sentence has to be true: reminders, plans, the checklist and sending are
   * not part of the allowance, so the app must not imply they are.
   */
  const note = limitReachedNote();
  assert.match(note, new RegExp(`${FREE_DAILY_WRITES} pieces of writing`));
  assert.match(note, /resets tomorrow/);
  assert.match(note, /plans, reminders, checklist and sending/);
  assert.match(note, /Pro removes the cap/, 'offered once, not leaned on');
});

test('only the routes that write are charged for', () => {
  /*
   * Health and mail are not writing. A limit that stopped an email going out
   * would be charging for the part of the app that has nothing to do with the
   * thing being limited, which is how a fair cap starts feeling like a toll.
   */
  const client = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/api-client.ts'), 'utf8');
  for (const route of ['/api/assistant', '/api/draft', '/api/subtasks', '/api/guide', '/api/brief']) {
    assert.ok(client.includes(`'${route}'`), `${route} spends the allowance`);
  }
  const costs = client.slice(client.indexOf('const COSTS_WRITING'), client.indexOf('export async function postJson'));
  assert.ok(!costs.includes('/api/health'), 'health is free');
  assert.ok(!costs.includes('/api/send-email'), 'and so is sending');
  // Refused in the server's own shape, so every caller already handles it.
  assert.match(client, /status: 429/);
});

test('Pro is not counted at all', () => {
  const store = readFileSync(path.resolve(import.meta.dirname, '../../src/store/aria-store.ts'), 'utf8');
  assert.match(store, /if \(st\.pro\) return true;/, 'paid accounts skip the meter entirely');
});

// ───────────────────────────────────────────────────────────────────────────────
console.log(
  failures.length
    ? `\n\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n` +
        failures.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${passed} review checks passed.\x1b[0m`,
);
process.exit(failures.length ? 1 : 0);

