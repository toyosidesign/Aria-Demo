/**
 * The conversational task setup, asserted end to end. `npm run check:flow`.
 *
 * The order Aria asks things in *is* the feature — "who, then have I got their
 * number, then when" is what separates an assistant from a form read aloud — so
 * it is checked here rather than rediscovered by tapping through a phone.
 *
 * Pure module, no React: lib/task-flow.ts exists in that shape precisely so
 * this file can walk every kind without a renderer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ackFor,
  flowMethod,
  flowTitle,
  isPersonKind,
  nextStep,
  promptFor,
  startFlow,
  toTaskInput,
  type FlowDraft,
  type FlowStep,
} from '@/lib/task-flow';
import type { TaskKind } from '@/store/aria-store';

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

/** Answer whatever is being asked, and return the sequence of steps seen. */
function walk(kind: TaskKind, answers: Partial<FlowDraft> = {}): FlowStep[] {
  let d = startFlow(kind);
  const seen: FlowStep[] = [];
  for (let i = 0; i < 20; i += 1) {
    const step = nextStep(d);
    seen.push(step);
    if (step === 'done') break;
    d = { ...d, ...answers, answered: { ...d.answered, [step]: true } };
  }
  return seen;
}

// ───────────────────────────────────────────────────────────────────────────────
section('The order Aria asks in');

test('a birthday asks who first, then whether we have their contact', () => {
  const seen = walk('birthday');
  assert.equal(seen[0], 'who', 'a birthday with no name is just a date');
  assert.equal(seen[1], 'contact');
  assert.equal(seen[2], 'date');
});

test('an assignment never asks whose birthday it is', () => {
  const seen = walk('assignment');
  assert.ok(!seen.includes('who'), 'a person-shaped question on a piece of work reads as a bug');
  assert.ok(!seen.includes('contact'));
  assert.ok(!seen.includes('card'), 'and there is no card for an essay');
  // It opens by asking what the work is, then when it's due.
  assert.equal(seen[0], 'what');
  assert.ok(seen.indexOf('what') < seen.indexOf('date'));
});

test('every kind opens by asking what it is, one way or the other', () => {
  /*
   * Non-person kinds used to fall out of the flow entirely: one prompt, then a
   * text box and the sentence parser. Now each is walked, and each starts by
   * establishing the subject — a title for work, a person for an occasion.
   */
  const kinds: TaskKind[] = ['general', 'reminder', 'event', 'assignment', 'project'];
  for (const kind of kinds) {
    const seen = walk(kind);
    assert.equal(seen[0], 'what', `${kind} must ask what it is first`);
    assert.ok(seen.includes('date'), `${kind} still needs a date`);
    assert.ok(seen.includes('priority'), `${kind} still gets a priority`);
  }
  for (const kind of ['birthday', 'anniversary'] as TaskKind[]) {
    assert.equal(walk(kind)[0], 'who', `${kind} asks who instead`);
  }
});

test('only work is offered an explanation, and only before scheduling', () => {
  /*
   * The learner profile onboarding collects (explainStyle, interests) was read
   * by exactly one route until now. This is the surface that uses it.
   *
   * Offered before the date questions on purpose: a student stuck on an
   * assignment is usually stuck on the topic, not the deadline.
   */
  const essay = walk('assignment');
  assert.ok(essay.includes('explain'), 'an assignment must be offered one');
  assert.ok(essay.indexOf('explain') < essay.indexOf('date'), 'before scheduling, not after');
  assert.ok(walk('project').includes('explain'));
  // An occasion has no topic to teach.
  for (const kind of ['birthday', 'reminder', 'event', 'general'] as TaskKind[]) {
    assert.ok(!walk(kind).includes('explain'), `${kind} has nothing to explain`);
  }
});

test('declining an explanation does not ask twice', () => {
  let d: FlowDraft = { ...startFlow('assignment'), answered: { what: true } };
  assert.equal(nextStep(d), 'explain');
  d = { ...d, answered: { ...d.answered, explain: true } };
  assert.notEqual(nextStep(d), 'explain');
});

test('an assignment saves as steps, so the breakdown is actually offered', () => {
  /*
   * It saved as 'remind'. The task screen keys its whole breakdown feature off
   * `method === 'steps'`, so an assignment set up in chat arrived with the one
   * thing Aria is useful for on an assignment switched off, and nothing about
   * the flow looked wrong while it happened.
   *
   * These mirror `defaultMethodFor` in the store, which cannot be imported here
   * without dragging in React Native. This is what keeps the two in step.
   */
  const due = { date: '2026-08-10' };
  assert.equal(toTaskInput({ ...startFlow('assignment'), ...due }).method, 'steps');
  assert.equal(toTaskInput({ ...startFlow('project'), ...due }).method, 'steps');
  assert.equal(toTaskInput({ ...startFlow('reminder'), ...due }).method, 'remind');
  assert.equal(toTaskInput({ ...startFlow('event'), ...due }).method, 'remind');
  assert.equal(toTaskInput({ ...startFlow('general'), ...due }).method, 'remind');
});

test('work is asked about a deadline, not a date it sits on', () => {
  const essay = { ...startFlow('assignment'), title: 'History essay' };
  assert.match(promptFor('date', essay), /due/i, 'an assignment has a deadline');
  assert.doesNotMatch(promptFor('date', essay), /put this on/);
  // An occasion keeps its own phrasing.
  assert.match(promptFor('date', { ...startFlow('birthday'), who: 'Sam' }), /birthday/);
});

test('a title is never left as the literal word undefined', () => {
  assert.equal(flowTitle({ ...startFlow('assignment') }), 'Untitled task');
  assert.equal(flowTitle({ ...startFlow('assignment'), title: 'Essay on Hobbes' }), 'Essay on Hobbes');
});

test('every kind reaches the preview and stops', () => {
  const kinds: TaskKind[] = [
    'birthday',
    'anniversary',
    'event',
    'reminder',
    'assignment',
    'project',
    'general',
  ];
  for (const kind of kinds) {
    const seen = walk(kind);
    assert.ok(seen.includes('preview'), `${kind} must be previewed before saving`);
    assert.equal(seen[seen.length - 1], 'done', `${kind} must terminate`);
  }
});

test('the card message is only asked for once a card is wanted', () => {
  // Said no: never asked what it should say.
  const withoutCard = walk('birthday', { delivery: 'remind' });
  assert.ok(!withoutCard.includes('cardMessage'));
  // Said yes: asked.
  const withCard = walk('birthday', { delivery: 'card' });
  assert.ok(withCard.includes('cardMessage'));
});

test('choosing a card leads to picking which card', () => {
  const seen = walk('birthday', { delivery: 'card' });
  assert.ok(seen.includes('cardStyle'), 'a card must be chosen, not assigned');
  assert.ok(
    seen.indexOf('cardStyle') < seen.indexOf('cardMessage'),
    'pick the card before writing in it',
  );
});

test('a plain message still asks for words, but never for a card design', () => {
  /*
   * The bug the three-way choice exists to fix. It used to be a yes/no about a
   * card, so "no" was read as "nothing to send" and someone who wanted to text
   * happy birthday reached the preview with no message at all.
   */
  const seen = walk('birthday', { delivery: 'message' });
  assert.ok(seen.includes('cardMessage'), 'a message needs writing');
  assert.ok(!seen.includes('cardStyle'), 'a message has no card design');
});

test('priority is asked, not assumed', () => {
  /*
   * It used to be hardcoded to medium in toTaskInput, so every task Aria set
   * up came out the same weight however urgent it was.
   */
  const seen = walk('birthday');
  assert.ok(seen.includes('priority'), 'the flow must ask');
  assert.equal(
    toTaskInput({ ...startFlow('birthday'), date: '2026-08-10', priority: 'high' }).priority,
    'high',
    'and must carry the answer through',
  );
  // Never asked (a kind that skips it, or an abandoned flow): still valid.
  assert.equal(
    toTaskInput({ ...startFlow('birthday'), date: '2026-08-10' }).priority,
    'medium',
  );
});

test('a bare reminder asks for neither', () => {
  const seen = walk('birthday', { delivery: 'remind' });
  assert.ok(!seen.includes('cardStyle'));
  assert.ok(!seen.includes('cardMessage'));
});

test('the method follows the channel we actually have', () => {
  const base = { ...startFlow('birthday'), who: 'Sam', delivery: 'message' as const };
  assert.equal(flowMethod({ ...base, contactPhone: '+15551234' }), 'sms');
  assert.equal(flowMethod({ ...base, contactEmail: 'sam@example.com' }), 'email');
  // Nothing to send to: promising a text we cannot address would be a lie.
  assert.equal(flowMethod(base), 'remind');
});

test('a card template is only carried when a card was chosen', () => {
  const withCard = toTaskInput({
    ...startFlow('birthday'), date: '2026-08-10', delivery: 'card', cardTemplateId: 'birthday-cake',
  });
  assert.equal(withCard.cardTemplateId, 'birthday-cake');
  // Picked a card, changed their mind: the stale id must not travel.
  const changed = toTaskInput({
    ...startFlow('birthday'), date: '2026-08-10', delivery: 'message', cardTemplateId: 'birthday-cake',
  });
  assert.equal(changed.cardTemplateId, undefined);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Answers are remembered, including the negative ones');

test('saying no to an alarm does not ask again', () => {
  /*
   * The bug this exists to prevent. `alarm: false` and "not yet asked" both
   * look falsy, so a check on the value rather than on `answered` would loop
   * on the question forever for anyone who declined.
   */
  let d: FlowDraft = startFlow('birthday');
  d = { ...d, answered: { who: true, contact: true, date: true, time: true, priority: true } };
  assert.equal(nextStep(d), 'alarm');
  d = { ...d, alarm: false, answered: { ...d.answered, alarm: true } };
  assert.notEqual(nextStep(d), 'alarm', 'a declined alarm must not be asked twice');
});

test('declining a card is remembered the same way', () => {
  let d: FlowDraft = startFlow('birthday');
  d = {
    ...d,
    answered: { who: true, contact: true, date: true, time: true, priority: true, alarm: true },
  };
  assert.equal(nextStep(d), 'card');
  d = { ...d, delivery: 'remind', answered: { ...d.answered, card: true } };
  assert.notEqual(nextStep(d), 'card');
});

// ───────────────────────────────────────────────────────────────────────────────
section('What the task ends up as');

test('the title reads like a person wrote it', () => {
  assert.equal(flowTitle({ ...startFlow('birthday'), who: 'Sam' }), "Sam's birthday");
  assert.equal(flowTitle({ ...startFlow('anniversary'), who: 'Mum' }), "Mum's anniversary");
  // No name yet: still something sayable, never "undefined's birthday".
  assert.equal(flowTitle(startFlow('birthday')), 'Birthday');
});

test('a declined card does not come back as the method anyway', () => {
  /*
   * `defaultMethodFor` assumes a card for every birthday, which is right when
   * nobody was asked and wrong here — the flow just asked and was told no.
   * Overriding a stated answer with a default is worse than never asking.
   */
  const d: FlowDraft = { ...startFlow('birthday'), who: 'Sam', delivery: 'remind' };
  assert.notEqual(flowMethod(d), 'card');
  assert.equal(flowMethod({ ...d, delivery: 'card' }), 'card');
});

test('a contact picked in chat reaches the saved task', () => {
  const d: FlowDraft = {
    ...startFlow('birthday'),
    who: 'Sam',
    contactPhone: '+15551234',
    date: '2026-08-10',
    time: '09:00',
    alarm: true,
    delivery: 'card',
    cardTemplateId: 'birthday-balloons',
    message: 'Happy birthday!',
    answered: {},
  };
  const input = toTaskInput(d);
  assert.equal(input.contactName, 'Sam');
  assert.equal(input.contactPhone, '+15551234');
  assert.equal(input.date, '2026-08-10');
  assert.equal(input.time, '09:00');
  assert.equal(input.alarm, true);
  assert.equal(input.kind, 'birthday');
  assert.equal(input.description, 'Happy birthday!');
});

test('no time chosen means no time, not midnight', () => {
  // `time: null` is a real answer — "the day is enough". Passing 00:00 through
  // would put every such task at the top of the morning.
  const input = toTaskInput({ ...startFlow('birthday'), date: '2026-08-10', time: null });
  assert.equal(input.time, undefined);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Aria says something at every step');

test('no step leaves Aria silent', () => {
  const steps: FlowStep[] = [
    'who',
    'contact',
    'date',
    'time',
    'alarm',
    'card',
    'cardMessage',
    'preview',
    'done',
  ];
  const d = { ...startFlow('birthday'), who: 'Sam' };
  for (const step of steps) {
    const prompt = promptFor(step, d);
    assert.ok(prompt && prompt.length > 3, `${step} must have something to say`);
    assert.doesNotMatch(prompt, /undefined/, `${step} leaked an unset value`);
  }
});

test('a prompt never says "undefined" before a name is known', () => {
  const blank = startFlow('birthday');
  for (const step of ['contact', 'date', 'card'] as FlowStep[]) {
    assert.doesNotMatch(promptFor(step, blank), /undefined/);
  }
});

test('acknowledgements are honest about what was recorded', () => {
  const d = { ...startFlow('birthday'), who: 'Sam' };
  assert.match(ackFor('who', d) ?? '', /Sam/);
  assert.match(ackFor('alarm', { ...d, alarm: false }) ?? '', /No alarm/);
  // Skipping the contact must not claim details were saved.
  assert.match(ackFor('contact', d) ?? '', /No contact/);
});

test('isPersonKind agrees with the walk', () => {
  assert.equal(isPersonKind('birthday'), true);
  assert.equal(isPersonKind('anniversary'), true);
  assert.equal(isPersonKind('assignment'), false);
});

// ───────────────────────────────────────────────────────────────────────────────
section('The thread separates one task from the next');

test('every category emits a divider, not just the guided ones', () => {
  /*
   * The divider used to be emitted inside `beginFlow`, which only runs for
   * birthdays and anniversaries. So finishing a birthday and then starting an
   * event produced no seam at all and the two setups ran together, which is
   * the exact complaint the divider was added to answer.
   *
   * It belongs on the category tap, before the guided/simple paths diverge.
   */
  const chat = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/chat.tsx'),
    'utf8',
  );
  const beginFlow = chat.slice(chat.indexOf('function beginFlow'), chat.indexOf('async function draftCardMessage'));
  assert.doesNotMatch(beginFlow, /mkDivider/, 'beginFlow reaches only two kinds; the divider must not live there');
  assert.match(chat, /if \(messages\.length > 0\) addChatMessage\(mkDivider\(/, 'the category tap must emit it');
});

test('clearing the conversation clears the flow with it', () => {
  /*
   * The eraser called `clearChat()` on its own. That empties the messages the
   * store holds and leaves the step the screen holds alone, so the calendar sat
   * there on an empty thread with nothing left that had asked for a date.
   *
   * Same split that stranded a half-finished setup on reopen. Anything that
   * ends the conversation has to end the flow too, so both go through one
   * function and this is what keeps them together.
   */
  const chat = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/chat.tsx'),
    'utf8',
  );
  const eraser = chat.slice(chat.indexOf('accessibilityLabel="Clear this conversation"'));
  const handler = eraser.slice(0, eraser.indexOf('/>'));
  assert.match(handler, /resetConversation\(\)/, 'the eraser must go through the full reset');
  assert.doesNotMatch(handler, /clearChat\(\)/, 'clearing messages alone leaves the panel behind');
  assert.match(chat, /function resetConversation\(\)[\s\S]{0,400}setFlow\(null\)/);
});

// ───────────────────────────────────────────────────────────────────────────────
console.log(
  failures.length
    ? `\n\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n` +
        failures.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${passed} task-flow checks passed.\x1b[0m`,
);
process.exit(failures.length ? 1 : 0);
