/**
 * The conversational task setup, asserted end to end. `npm run check:flow`.
 *
 * The order Aria asks things in *is* the feature, "who, then have I got their
 * number, then when" is what separates an assistant from a form read aloud, so
 * it is checked here rather than rediscovered by tapping through a phone.
 *
 * Pure module, no React: lib/task-flow.ts exists in that shape precisely so
 * this file can walk every kind without a renderer.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  ackFor,
  applyTypedAnswer,
  contactSatisfied,
  flowDocument,
  isTypedStep,
  closeGuide,
  flowMethod,
  flowSteps,
  flowTitle,
  guideAvailableAt,
  isEventKind,
  isPersonKind,
  isWorkKind,
  openGuide,
  pinnedStep,
  reflectConfidence,
  titleFromText,
  workDeadline,
  needsContact,
  nextStep,
  promptFor,
  submissionReminder,
  DEFAULT_SUBMIT_TIME,
  reopen,
  startFlow,
  toTaskInput,
  EVENT_HANDLING,
  METHOD_NEEDS,
  WORK_ACCEPTS_AT,
  type EventMethod,
  type FlowDraft,
  type FlowStep,
} from '@/lib/task-flow';
import { NARROWING, localGuide, needsMore } from '@/lib/guide';
import { offlineAnswer } from '@/lib/offline-answer';
import { dedupeSources, hostOf } from '@/lib/source';
import { looksLikeQuestion } from '@/lib/question';
import {
  ASSEMBLED_SECTION,
  INSTRUCTION_SECTION,
  WORKING_SECTION,
  isReserved,
  ownInstruction,
  workingDraft,
  writtenSections,
} from '@/lib/sections';
import { handInReadiness } from '@/lib/ready';
import { currentTaskMessages, historyForModel } from '@/lib/chat-scope';
import { SAVE_QUESTION, saveTarget, wantsSave } from '@/lib/save-intent';
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

test('a birthday asks who first, and everything else hangs off the answer', () => {
  const seen = walk('birthday');
  assert.equal(seen[0], 'who', 'a birthday with no name is just a date');
  assert.equal(seen[1], 'date');
});

test('an assignment never asks whose birthday it is', () => {
  const seen = walk('assignment');
  assert.ok(!seen.includes('who'), 'a person-shaped question on a piece of work reads as a bug');
  assert.ok(!seen.includes('contact'));
  assert.ok(!seen.includes('method'), 'and there is nothing to send for an essay');
  // It opens on the brief, because the brief already says most of this.
  assert.equal(seen[0], 'brief');
  assert.ok(seen.indexOf('brief') < seen.indexOf('planPreview'));
});

test('every kind opens by establishing what it is, one way or the other', () => {
  /*
   * Three openings, one job: know what this is before asking anything about it.
   * A title for a task, a person for an occasion, and the brief for work , 
   * which is the one case where the answer already exists as a document, so
   * asking for a title first would be asking someone to summarise a file they
   * are about to hand over.
   */
  for (const kind of ['general', 'reminder', 'event'] as TaskKind[]) {
    const seen = walk(kind);
    assert.equal(seen[0], 'what', `${kind} must ask what it is first`);
    assert.ok(seen.includes('date'), `${kind} still needs a date`);
    assert.ok(seen.includes('priority'), `${kind} still gets a priority`);
  }
  for (const kind of ['assignment', 'project'] as TaskKind[]) {
    assert.equal(walk(kind)[0], 'brief', `${kind} starts from the brief`);
    assert.equal(isWorkKind(kind), true);
  }
  for (const kind of ['birthday', 'anniversary'] as TaskKind[]) {
    assert.equal(walk(kind)[0], 'who', `${kind} asks who instead`);
  }
});

test('being stuck is answered by the Guide, from every place it is offered', () => {
  /*
   * This replaced a standalone "shall I explain the topic first?" step, which
   * asked before the work had been described and rendered no control at all in
   * the panel. The Guide asks after there is something to be stuck *on*, and
   * appears in the same four places wearing the same word, that consistency is
   * the feature, so it is listed here rather than left to each screen.
   */
  for (const step of ['planPreview', 'definition', 'milestones', 'scope'] as FlowStep[]) {
    assert.equal(guideAvailableAt(step), true, `${step} must offer the Guide`);
  }
  for (const step of ['date', 'time', 'preview', 'extraction'] as FlowStep[]) {
    assert.equal(guideAvailableAt(step), false, `${step} is not somewhere people are stuck`);
  }
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

test('every kind is read back before it is saved, and every kind terminates', () => {
  /*
   * Two surfaces, one rule: nothing is saved that was not shown first. An
   * occasion gets the preview card; work gets the plan preview, which is the
   * same promise made by a screen that has more to show, a preview *of* the
   * preview would be a tap that teaches nothing.
   */
  for (const kind of ['birthday', 'anniversary', 'event', 'reminder', 'general'] as TaskKind[]) {
    const seen = walk(kind);
    assert.ok(seen.includes('preview'), `${kind} must be previewed before saving`);
    assert.equal(seen[seen.length - 1], 'done', `${kind} must terminate`);
  }
  for (const kind of ['assignment', 'project'] as TaskKind[]) {
    const seen = walk(kind, { title: 'Work', facts: { deadline: { value: '2026-09-01', confidence: 'high' } } });
    assert.ok(seen.includes(WORK_ACCEPTS_AT), `${kind} must show the plan before saving`);
    assert.equal(seen[seen.length - 1], 'done', `${kind} must terminate`);
    assert.ok(!seen.includes('preview'), 'the plan preview is the preview');
  }
});

test('the card message is only asked for once a card is wanted', () => {
  // Said no: never asked what it should say.
  const withoutCard = walk('birthday', { handling: 'remind' });
  assert.ok(!withoutCard.includes('cardMessage'));
  // Said yes: asked.
  const withCard = walk('birthday', { handling: 'card' });
  assert.ok(withCard.includes('cardMessage'));
});

test('choosing a card leads to picking which card', () => {
  const seen = walk('birthday', { handling: 'card' });
  assert.ok(seen.includes('cardStyle'), 'a card must be chosen, not assigned');
  assert.ok(
    seen.indexOf('cardStyle') < seen.indexOf('cardMessage'),
    'pick the card before writing in it',
  );
});

test('a text still asks for words, but never for a card design', () => {
  /*
   * The bug the handling question exists to fix. It used to be a yes/no about a
   * card, so "no" was read as "nothing to send" and someone who wanted to text
   * happy birthday reached the preview with no message at all.
   */
  const seen = walk('birthday', { handling: 'sms' });
  assert.ok(seen.includes('cardMessage'), 'a text needs writing');
  assert.ok(!seen.includes('cardStyle'), 'a text has no card design');
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
  const seen = walk('birthday', { handling: 'remind' });
  assert.ok(!seen.includes('cardStyle'));
  assert.ok(!seen.includes('cardMessage'));
  assert.ok(!seen.includes('contact'), 'and there is nobody to collect');
});

test('the method is what was chosen, unless it cannot be addressed', () => {
  /*
   * Taken at its word now: the flow asked "How should Aria handle it?" and got
   * an answer, where it used to ask for "a message" and guess the channel from
   * whichever detail the contact happened to carry.
   *
   * The exception is the old rule kept: promising a text we have no number for
   * would be a lie, and the offer card on Today would carry that promise all
   * the way to the student.
   */
  const sam = { ...startFlow('birthday'), who: 'Sam' };
  assert.equal(flowMethod({ ...sam, handling: 'sms', contactPhone: '+15551234' }), 'sms');
  assert.equal(flowMethod({ ...sam, handling: 'email', contactEmail: 'sam@example.com' }), 'email');
  assert.equal(flowMethod({ ...sam, handling: 'call', contactPhone: '+15551234' }), 'call');
  // An email address is no use to a text message.
  assert.equal(flowMethod({ ...sam, handling: 'sms', contactEmail: 'sam@example.com' }), 'remind');
  assert.equal(flowMethod({ ...sam, handling: 'email', contactPhone: '+15551234' }), 'remind');
  assert.equal(flowMethod({ ...sam, handling: 'call' }), 'remind');
  // A card and a picture need the person, not a channel to reach them on.
  assert.equal(flowMethod({ ...sam, handling: 'card' }), 'card');
  assert.equal(flowMethod({ ...sam, handling: 'photo' }), 'photo');
});

test('a card template and a picture only travel with the method that uses them', () => {
  const base = { ...startFlow('birthday'), who: 'Sam', date: '2026-08-10' };
  const withCard = toTaskInput({ ...base, handling: 'card', cardTemplateId: 'birthday-cake' });
  assert.equal(withCard.cardTemplateId, 'birthday-cake');
  const withPhoto = toTaskInput({ ...base, handling: 'photo', photoUri: 'file://pic.jpg' });
  assert.equal(withPhoto.photoUri, 'file://pic.jpg');
  // Picked a card, changed their mind to a text: the stale id must not travel,
  // or Today draws a card for a task that is not one.
  const changed = toTaskInput({
    ...base, handling: 'sms', contactPhone: '+15551234', cardTemplateId: 'birthday-cake',
    photoUri: 'file://pic.jpg',
  });
  assert.equal(changed.cardTemplateId, undefined);
  assert.equal(changed.photoUri, undefined);
});

// ───────────────────────────────────────────────────────────────────────────────
section('The Assignment flow');

test('it opens on the brief, because the brief already exists', () => {
  /*
   * Everything on the extraction card was read out of a document the student
   * already has. Opening on anything else, a title box, a date, is asking
   * them to transcribe what Aria is about to read anyway.
   */
  const seen = walk('assignment', { title: 'History essay' });
  assert.equal(seen[0], 'brief');
  assert.ok(seen.indexOf('brief') < seen.indexOf('extraction'));
  assert.ok(seen.indexOf('extraction') < seen.indexOf('commitments'), 'read it, then plan around it');
  assert.ok(seen.indexOf('commitments') < seen.indexOf('planPreview'));
  assert.equal(seen[seen.length - 1], 'done');
});

test('a brief that named the work is not asked to name it again', () => {
  // Upload, extraction fills the title: `what` never appears.
  assert.ok(!walk('assignment', { title: 'Cold War essay' }).includes('what'));
  // Nothing extracted a title, so it has to be asked for.
  assert.ok(walk('assignment').includes('what'));
});

test('the deadline is only asked for when the brief did not give one', () => {
  /*
   * The single question an assignment gets asked about dates, and only when
   * there is nothing to plan backwards from. Asking anyway would be asking the
   * student to repeat what they just uploaded.
   */
  const withDeadline = walk('assignment', {
    title: 'Essay',
    facts: { deadline: { value: '2026-09-01', confidence: 'high' } },
  });
  assert.ok(!withDeadline.includes('date'), 'the brief said when it is due');
  assert.ok(walk('assignment', { title: 'Essay' }).includes('date'), 'it did not, so ask');
  // A relative deadline is worth showing and useless to plan from, so it does
  // not count as one: "end of week 9" cannot be counted backwards from.
  const vague = walk('assignment', {
    title: 'Essay',
    facts: { deadline: { value: 'end of week 9', confidence: 'low' } },
  });
  assert.ok(vague.includes('date'), 'a date Aria cannot resolve is still a gap');
});

test('an assignment is never asked how much it matters', () => {
  /*
   * The brief already said, in the one number the student cares about. 40% is
   * high, 5% is not, and asking would be asking them to repeat themselves.
   */
  assert.ok(!walk('assignment', { title: 'Essay' }).includes('priority'));
  const heavy = toTaskInput({
    ...startFlow('assignment'),
    title: 'Essay',
    date: '2026-09-01',
    facts: { weighting: { value: '40% of the module', confidence: 'high' } },
  });
  assert.equal(heavy.priority, 'high');
  const light = toTaskInput({
    ...startFlow('assignment'),
    title: 'Problem sheet',
    date: '2026-09-01',
    facts: { weighting: { value: '5%', confidence: 'high' } },
  });
  assert.equal(light.priority, 'low');
  // Nothing said: the neutral answer, not a guess.
  assert.equal(
    toTaskInput({ ...startFlow('assignment'), title: 'Essay', date: '2026-09-01' }).priority,
    'medium',
  );
});

test('the deadline from the brief is what the task is saved on', () => {
  const fromBrief = toTaskInput({
    ...startFlow('assignment'),
    title: 'Essay',
    facts: { deadline: { value: '2026-09-01', confidence: 'high' } },
  });
  assert.equal(fromBrief.date, '2026-09-01', 'read, not asked for');
  assert.equal(fromBrief.method, 'steps', 'so the task screen offers the breakdown');
  /*
   * A date they typed wins over the brief.
   *
   * The two only coexist when the student answered the deadline question and
   * then uploaded something, or corrected the extraction afterwards, and in
   * both cases the answer they gave by hand is the more deliberate one.
   */
  const typed = toTaskInput({
    ...startFlow('assignment'),
    title: 'Essay',
    date: '2026-08-20',
    facts: { deadline: { value: '2026-09-01', confidence: 'low' } },
  });
  assert.equal(typed.date, '2026-08-20');
});

// ───────────────────────────────────────────────────────────────────────────────
section('The Project flow, and its gate');

test('nothing is scoped or scheduled before done is defined', () => {
  const seen = walk('project', { title: 'Design system' });
  assert.equal(seen[0], 'brief');
  assert.ok(seen.indexOf('definition') < seen.indexOf('scope'), 'the gate comes before scope');
  assert.ok(seen.indexOf('definition') < seen.indexOf('milestones'));
  assert.ok(seen.indexOf('definition') < seen.indexOf('planPreview'));
  assert.ok(seen.indexOf('reflect') > seen.indexOf('definition'), 'read it back after it is stated');
  assert.ok(seen.indexOf('scope') < seen.indexOf('milestones'));
});

test('"I can\'t say yet" is an answer, and becomes the first job', () => {
  /*
   * The gate is not a required field. Being unable to say what done looks like
   * is the most honest thing a project can start with, and working it out is
   * the actual first piece of work, so that is what it becomes.
   */
  const deferred: FlowDraft = {
    ...startFlow('project'),
    title: 'Design system',
    definitionDeferred: true,
    milestones: [{ title: 'Audit the components', due: '2026-09-10' }],
    answered: {},
  };
  assert.equal(flowSteps(deferred)[0].title, 'Work out what done looks like');
  assert.equal(pinnedStep(deferred), 'Work out what done looks like');
  // Stated instead: the milestones stand on their own.
  const stated: FlowDraft = { ...deferred, definitionDeferred: false, definition: 'Three pages live' };
  assert.equal(pinnedStep(stated), 'Audit the components');
});

test('a milestone carries what forces it all the way to the task', () => {
  /*
   * A milestone with nothing forcing it is the one that moves. The date is
   * useless for saying so afterwards; the forcing function is the thing worth
   * naming in a nudge, so it travels with the step rather than staying in the
   * setup screen.
   */
  const steps = flowSteps({
    ...startFlow('project'),
    title: 'Design system',
    milestones: [
      { title: 'Share the draft', due: '2026-09-10', forcing: 'Sam is expecting it' },
      { title: 'Tidy the tokens', due: '2026-09-14' },
    ],
    answered: {},
  });
  assert.equal(steps[0].forcing, 'Sam is expecting it');
  assert.equal(steps[1].forcing, undefined, 'a null stays a null rather than being invented');
  assert.equal(steps[0].due, '2026-09-10');
});

test('the project deadline is its last milestone', () => {
  const d: FlowDraft = {
    ...startFlow('project'),
    title: 'Design system',
    milestones: [
      { title: 'Audit', due: '2026-09-10' },
      { title: 'Ship', due: '2026-09-30' },
      { title: 'Draft', due: '2026-09-20' },
    ],
    answered: {},
  };
  assert.equal(workDeadline(d), '2026-09-30');
  assert.equal(toTaskInput(d).date, '2026-09-30');
  // No milestone carries a date, so the flow has to ask for one.
  assert.ok(walk('project', { title: 'Design system' }).includes('date'));
});

test('a project described in a sentence is not then asked for a title', () => {
  assert.equal(
    titleFromText('Build the marketing site. Three pages, live by term time.'),
    'Build the marketing site.',
  );
  // Long single sentences are cut rather than becoming a title nobody can read.
  const long = titleFromText('a'.repeat(200));
  assert.ok(long.length <= 61, 'cut to something a row can show');
});

test('the reflect-back says how sure it is, from what it actually had', () => {
  /*
   * Computed here rather than claimed by the model about itself. A reading
   * built from one line and a title is a guess, and the chip has to say so or
   * the card gets agreed with instead of corrected.
   */
  const thin: FlowDraft = { ...startFlow('project'), title: 'Thing', answered: {} };
  assert.equal(reflectConfidence(thin), 'low');
  const rich: FlowDraft = {
    ...startFlow('project'),
    title: 'Design system for the marketing site',
    definition: 'Done when the three pages are live and someone outside the team can use them.',
    scopeIn: ['Type scale', 'Colour'],
    scopeOut: ['Motion'],
    answered: {},
  };
  assert.equal(reflectConfidence(rich), 'high');
});

test('the out-list survives the conversation', () => {
  // The list people come back to, three weeks later. Useless if it only ever
  // existed on a setup screen.
  const doc = flowDocument({
    ...startFlow('project'),
    title: 'Design system',
    definition: 'Three pages live',
    scopeIn: ['Type scale'],
    scopeOut: ['Motion', 'Dark mode'],
    answered: {},
  });
  assert.match(doc, /Deliberately not doing/);
  assert.match(doc, /- Motion/);
  assert.match(doc, /Done means/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('The Guide');

test('it is a detour, and it comes back where it started', () => {
  /*
   * Four doors, one room. Modelling it as a step in the sequence would need
   * four sequences; modelling it as a flag with a return address needs one, and
   * this is what proves the address is honoured.
   */
  const planning: FlowDraft = {
    ...startFlow('assignment'),
    title: 'Essay',
    facts: { deadline: { value: '2026-09-01', confidence: 'high' } },
    answered: { brief: true, extraction: true, commitments: true },
  };
  assert.equal(nextStep(planning), 'planPreview');
  const opened = openGuide(planning, 'planPreview');
  assert.equal(nextStep(opened), 'guideAsk', 'the narrowing question comes first');
  const answered: FlowDraft = {
    ...opened,
    guide: { ...opened.guide!, focus: 'angle', directions: [{ title: 'A', needs: 'b', costs: 'c' }] },
  };
  assert.equal(nextStep(answered), 'guideDirections');
  assert.equal(nextStep(closeGuide(answered)), 'planPreview', 'back where it was opened from');
});

test('the narrowing question is asked before anything is generated', () => {
  // "I'm stuck" covers two problems whose answers look nothing alike, and one
  // tap splits them. Both modes ask, and both offer exactly two ways in.
  for (const mode of ['assignment', 'project'] as const) {
    assert.ok(NARROWING[mode].question.length > 20, `${mode} must ask something real`);
    assert.equal(NARROWING[mode].options.length, 2);
  }
  assert.match(NARROWING.assignment.question, /angle/i);
});

test('with nothing to go on it says so, and asks for the one thing that helps', () => {
  /*
   * The failure this exists to prevent: four directions that would fit any
   * essay ever written, presented as though they were about this one.
   */
  const bare = needsMore({ mode: 'assignment', title: 'Essay on the Cold War', focus: 'angle' });
  assert.ok(bare, 'a title alone is not enough to be specific about');
  assert.match(bare!, /paste/i);
  // A brief with criteria is plenty.
  assert.equal(
    needsMore({
      mode: 'assignment',
      title: 'Essay',
      focus: 'angle',
      facts: { criteria: { items: [{ label: 'Argument', weight: 40 }], confidence: 'high' } },
    }),
    null,
  );
  // So is a stated definition of done, for a project.
  assert.equal(
    needsMore({ mode: 'project', title: 'Site', focus: 'scope', definition: 'Three pages live' }),
    null,
  );
});

test('every direction carries what it needs and what it costs', () => {
  // A direction without them is a suggestion. With them it is a decision
  // someone can actually make, so the offline set holds to the same rule.
  for (const mode of ['assignment', 'project'] as const) {
    const directions = localGuide({ mode, title: 'Essay', focus: 'angle' });
    assert.ok(directions.length >= 3 && directions.length <= 4);
    for (const d of directions) {
      assert.ok(d.title.trim() && d.needs.trim() && d.costs.trim(), `${mode}: incomplete direction`);
    }
  }
  // The assignment set says where the marks are; the project set does not,
  // because nobody is marking it.
  assert.ok(localGuide({ mode: 'assignment', title: 'E', focus: 'angle' }).every((d) => d.rewardedBy));
  assert.ok(localGuide({ mode: 'project', title: 'P', focus: 'scope' }).every((d) => !d.rewardedBy));
});

test('the direction taken reaches the saved work', () => {
  const doc = flowDocument({
    ...startFlow('assignment'),
    title: 'Essay',
    guide: {
      open: false,
      from: 'planPreview',
      chosen: {
        title: 'Take a position and defend it',
        needs: 'Two sources that disagree',
        costs: 'You have to commit early',
        rewardedBy: 'Argument',
        questions: ['What is the strongest case against you?'],
      },
    },
    answered: {},
  });
  assert.match(doc, /Take a position and defend it/);
  assert.match(doc, /Needs: Two sources that disagree/);
  assert.match(doc, /Marks under: Argument/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('The Event flow, as HANDOFF §4 specifies it');

/** The three occasions, and the question each one opens with. */
const OCCASIONS: { kind: TaskKind; opens: FlowStep; asks: RegExp }[] = [
  { kind: 'event', opens: 'what', asks: /event/i },
  { kind: 'birthday', opens: 'who', asks: /birthday/i },
  { kind: 'anniversary', opens: 'who', asks: /anniversary/i },
];

test('each occasion opens with its own question', () => {
  /*
   * "What's this event?", "Whose birthday is it?", "Whose anniversary is it?"
   *, one flow, three doors into it. A general event is described rather than
   * named, which is why it opens on `what` and the other two on `who`.
   */
  for (const o of OCCASIONS) {
    const seen = walk(o.kind);
    assert.equal(seen[0], o.opens, `${o.kind} must open on ${o.opens}`);
    assert.match(promptFor(o.opens, startFlow(o.kind)), o.asks, `${o.kind} must name the occasion`);
  }
});

test('then all three ask date, time, repeat, priority, handling, in that order', () => {
  /*
   * The order is the product. Handling comes last of the five because it is
   * what decides everything asked afterwards, and the recipient is collected
   * after it rather than before: which of their details matter depends on
   * whether this is a text, an email or a call.
   */
  for (const o of OCCASIONS) {
    const seen = walk(o.kind, { handling: 'remind' });
    const order = ['date', 'time', 'repeat', 'priority', 'method'] as FlowStep[];
    const at = order.map((s) => seen.indexOf(s));
    for (const [i, s] of order.entries()) {
      assert.ok(at[i] > -1, `${o.kind} must ask ${s}`);
      if (i > 0) assert.ok(at[i - 1] < at[i], `${o.kind}: ${order[i - 1]} must come before ${s}`);
    }
  }
});

test('an event is never asked about an alarm, and everything else still is', () => {
  /*
   * Deliberate, and the one place this flow drops a question it used to ask.
   * The spec lists five for an occasion and an alarm is not among them; "does
   * it repeat" is the one people actually answer for a birthday.
   *
   * Work keeps its alarm, an essay does not repeat, and a deadline creeping up
   * is the thing it needs protecting from.
   */
  for (const o of OCCASIONS) {
    assert.ok(!walk(o.kind).includes('alarm'), `${o.kind} must not ask about an alarm`);
  }
  for (const kind of ['reminder', 'general'] as TaskKind[]) {
    assert.ok(walk(kind).includes('alarm'), `${kind} keeps its alarm question`);
    assert.ok(!walk(kind).includes('repeat'), `${kind} is not asked about repeating yet`);
  }
  /*
   * Work has neither, and that is not an oversight.
   *
   * An assignment's dates come from the plan, one per step, so a single alarm
   * on the task would fire for the wrong thing, and coursework does not
   * repeat. Both questions moved out when the plan moved in.
   */
  for (const kind of ['assignment', 'project'] as TaskKind[]) {
    assert.ok(!walk(kind).includes('alarm'), `${kind} plans per step instead`);
    assert.ok(!walk(kind).includes('repeat'), `${kind} does not come round again`);
  }
});

test('the six ways to handle it are offered, in the order stated', () => {
  assert.deepEqual(
    EVENT_HANDLING.map((m) => m.label),
    ['Text', 'Email', 'Call', 'Picture', 'Card', 'Just remind me'],
  );
});

test('what each method needs is what the table says', () => {
  /*
   * Text needs a number, Email needs an address, a Call needs neither a name
   * nor an address, just the number. This is the table in HANDOFF §4, and it
   * is what the contact step renders from, so it is asserted rather than
   * re-read off a phone.
   */
  const table: Record<EventMethod, [name: string, email: string, phone: string]> = {
    sms: ['required', 'optional', 'required'],
    email: ['required', 'required', 'optional'],
    call: ['none', 'none', 'required'],
    photo: ['required', 'optional', 'optional'],
    card: ['required', 'optional', 'optional'],
    remind: ['none', 'none', 'none'],
  };
  for (const [method, [name, email, phone]] of Object.entries(table) as [
    EventMethod,
    [string, string, string],
  ][]) {
    const needs = METHOD_NEEDS[method];
    assert.equal(needs.name, name, `${method}: name`);
    assert.equal(needs.email, email, `${method}: email`);
    assert.equal(needs.phone, phone, `${method}: phone`);
  }
  // And what else each one collects: words for anything that carries a message,
  // a design for a card, an image for a picture.
  assert.deepEqual(
    EVENT_HANDLING.filter((m) => METHOD_NEEDS[m.value].message).map((m) => m.value),
    ['sms', 'email', 'photo', 'card'],
  );
  assert.ok(METHOD_NEEDS.card.card && !METHOD_NEEDS.card.picture);
  assert.ok(METHOD_NEEDS.photo.picture && !METHOD_NEEDS.photo.card);
  assert.ok(!METHOD_NEEDS.call.message, 'a call is made in person; there is nothing to write');
});

test('each method asks for exactly what it needs, and nothing else', () => {
  const expected: Record<EventMethod, FlowStep[]> = {
    sms: ['contact', 'cardMessage'],
    email: ['contact', 'cardMessage'],
    call: ['contact'],
    photo: ['contact', 'photo', 'cardMessage'],
    card: ['contact', 'cardStyle', 'cardMessage'],
    remind: [],
  };
  const optional: FlowStep[] = ['contact', 'cardStyle', 'photo', 'cardMessage'];
  for (const [method, wanted] of Object.entries(expected) as [EventMethod, FlowStep[]][]) {
    const seen = walk('event', { handling: method });
    for (const step of optional) {
      const should = wanted.includes(step);
      assert.equal(seen.includes(step), should, `${method}: ${step} ${should ? 'missing' : 'asked for no reason'}`);
    }
    // Whatever it collects, it is collected after the method was chosen.
    for (const step of wanted) {
      assert.ok(seen.indexOf('method') < seen.indexOf(step), `${method}: ${step} came before the choice`);
    }
    assert.equal(seen[seen.length - 1], 'done', `${method} must terminate`);
  }
});

test('a card is picked before it is written in, and a picture chosen before its caption', () => {
  const card = walk('event', { handling: 'card' });
  assert.ok(card.indexOf('cardStyle') < card.indexOf('cardMessage'));
  const photo = walk('event', { handling: 'photo' });
  assert.ok(photo.indexOf('photo') < photo.indexOf('cardMessage'));
});

test('a method that cannot be addressed does not get past the contact question', () => {
  /*
   * Required means required: there is no texting someone with no number. The
   * panel keeps the button disabled on exactly this, so what it asks for and
   * what actually blocks are the same rule rather than two of them.
   */
  const sam = { ...startFlow('event'), who: 'Sam' };
  assert.equal(contactSatisfied({ ...sam, handling: 'sms' }), false);
  assert.equal(contactSatisfied({ ...sam, handling: 'sms', contactPhone: '+15551234' }), true);
  assert.equal(contactSatisfied({ ...sam, handling: 'email' }), false);
  assert.equal(contactSatisfied({ ...sam, handling: 'email', contactEmail: 's@e.com' }), true);
  // A call wants a number and nothing else, not even the name.
  assert.equal(contactSatisfied({ ...startFlow('event'), handling: 'call', contactPhone: '+1' }), true);
  // A card and a picture want the person; how to reach them is Aria's problem
  // at send time, not a blocker at setup.
  assert.equal(contactSatisfied({ ...sam, handling: 'card' }), true);
  assert.equal(contactSatisfied({ ...sam, handling: 'photo' }), true);
  // And a bare reminder involves nobody at all.
  assert.equal(needsContact('remind'), false);
  for (const m of EVENT_HANDLING.filter((h) => h.value !== 'remind')) {
    assert.equal(needsContact(m.value), true, `${m.value} involves someone`);
  }
});

test('one contact, picked once, satisfies whatever the method turns out to need', () => {
  /*
   * The rule the whole step exists for: choosing someone from the contact list
   * fills the fields and hides them. A picked contact carrying both details is
   * enough for every method, so nothing is asked again.
   */
  const picked = {
    ...startFlow('birthday'),
    who: 'Sam',
    contactPhone: '+15551234',
    contactEmail: 'sam@example.com',
  };
  for (const m of EVENT_HANDLING) {
    assert.equal(contactSatisfied({ ...picked, handling: m.value }), true, `${m.value} still asking`);
  }
});

test('changing the method at the preview re-asks what hung off it', () => {
  /*
   * "Change how" on the preview used to clear one mark. So a text with a number
   * changed to an email kept `contact` answered, skipped the question, and
   * saved with no address, which `flowMethod` then honestly downgraded to a
   * reminder. The email nobody was told about simply never existed.
   */
  const texted: FlowDraft = {
    ...startFlow('event'),
    title: 'Dinner',
    handling: 'sms',
    who: 'Sam',
    contactPhone: '+15551234',
    message: 'See you at 8',
    answered: {
      what: true, date: true, time: true, repeat: true, priority: true,
      method: true, contact: true, cardMessage: true, preview: true,
    },
  };
  const again = reopen(texted, 'method');
  assert.equal(nextStep(again), 'method');
  const asEmail: FlowDraft = { ...again, handling: 'email', answered: { ...again.answered, method: true } };
  assert.equal(nextStep(asEmail), 'contact', 'the address must be asked for');
  // What was written survives the change, it is a fair start for the email.
  assert.equal(asEmail.message, 'See you at 8');
  // A step with nothing hanging off it reopens alone.
  const dateOnly = reopen(texted, 'date');
  assert.equal(nextStep(dateOnly), 'date');
  assert.equal(dateOnly.answered.contact, true, 'the recipient did not depend on the date');
});

test('an event repeat reaches the saved task', () => {
  const input = toTaskInput({ ...startFlow('birthday'), who: 'Sam', date: '2026-08-10', repeat: 'yearly' });
  assert.equal(input.repeat, 'yearly');
  // "Just the once" is undefined, not a repeat of some default interval.
  assert.equal(
    toTaskInput({ ...startFlow('birthday'), who: 'Sam', date: '2026-08-10' }).repeat,
    undefined,
  );
});

test('task-flow and aria-actions agree on what an event is', () => {
  /*
   * `lib/task-flow.ts` restates the event kinds and methods rather than
   * importing them, because `lib/aria-actions.ts` reaches the store and this
   * module has to stay runnable without a React Native runtime, that is the
   * only reason this check can walk the flow at all.
   *
   * Restating is a copy, and a copy drifts. This is what stops it: the create
   * form and the chat flow must offer the same six methods for the same three
   * kinds, or the same task gets a different set of options depending on where
   * it was made.
   */
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  const listNamed = (name: string) => {
    const match = actions.match(new RegExp(`${name}: TaskKind\\[\\] = \\[([^\\]]*)\\]|${name}: TaskMethod\\[\\] = \\[([^\\]]*)\\]`));
    assert.ok(match, `${name} must still exist in aria-actions`);
    return [...(match[1] ?? match[2]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  assert.deepEqual(
    listNamed('EVENT_METHODS'),
    EVENT_HANDLING.map((m) => m.value),
    'the create form and the chat flow must offer the same handling options',
  );
  for (const kind of listNamed('EVENT_KINDS')) {
    assert.equal(isEventKind(kind as TaskKind), true, `${kind} is an event to the form, not to the flow`);
  }
  for (const o of OCCASIONS) assert.equal(isEventKind(o.kind), true);
  for (const kind of ['assignment', 'project', 'reminder', 'general'] as TaskKind[]) {
    assert.equal(isEventKind(kind), false, `${kind} is not an occasion`);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
section('What work can be handled as');

test('an assignment cannot be handled as a reminder, an email or a text', () => {
  /*
   * All three were on the list and none of them describe handling a piece of
   * work. "Just remind me" turned an essay into a nudge with the breakdown
   * switched off, which is the one thing Aria is useful for here; email and
   * text are ways of reaching a person, and the recipient of an assignment is a
   * submission portal.
   *
   * "Something else" joined them later and belongs: it is not a fourth channel
   * for reaching somebody, it is the same question answered in their own words
   * when none of the three fit.
   *
   * Read out of `lib/aria-actions.ts` by source, because that module imports
   * the store and cannot be loaded here.
   */
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  const list = actions.match(/ASSIGNMENT_METHODS: TaskMethod\[\] = \[([^\]]*)\]/);
  assert.ok(list, 'ASSIGNMENT_METHODS must still exist');
  const methods = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    methods,
    ['steps', 'outline', 'draft', 'other'],
    'three amounts of help, plus their own words, and nothing about sending',
  );
  for (const wrong of ['remind', 'email', 'sms', 'card', 'call']) {
    assert.ok(!methods.includes(wrong), `${wrong} is not a way to handle a piece of work`);
  }
  for (const gone of ['remind', 'email', 'sms']) {
    assert.ok(!methods.includes(gone), `${gone} is not a way of handling work`);
  }
});

test('setting work up does not ask when, only what and how', () => {
  /*
   * A date, a time, a repeat, a priority and a notes box are the questions you
   * ask about something that happens *at* a moment. Work does not happen at a
   * moment: it is done over days and then handed in, and only the handing in
   * has an hour. Asking all of it up front is what made starting an assignment
   * feel like filling in a form before being allowed to begin.
   */
  const form = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/task/new.tsx'),
    'utf8',
  );
  // Everything between the guard and its close is hidden for work.
  const guard = form.indexOf('{isWorkKind(kind) ? null : (');
  assert.ok(guard > -1, 'work must skip the scheduling half of the form');
  const hidden = form.slice(guard, form.indexOf('</>\n          )}', guard));
  for (const field of ['<MonthCalendar', '<TimeField', 'Priority', 'Repeat', 'Notes (optional)']) {
    assert.ok(hidden.includes(field), `${field} must be inside the part work skips`);
  }
  // And starting is the action, rather than saving something to a list.
  assert.ok(form.includes("'Start working on it'"), 'the button says what happens next');
  assert.ok(form.includes('router.replace(`/aria/${id}`'), 'and it goes straight into the work');
});

test('the create form asks work how before it asks when', () => {
  /*
   * The method decides what the rest of that screen is for: "step by step"
   * makes it a breakdown, "draft it" makes it something Aria writes. A calendar
   * first puts the least consequential question in front of the one that
   * changes everything after it.
   */
  const form = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/task/new.tsx'),
    'utf8',
  );
  const workHandling = form.indexOf('{isWorkKind(kind) ? handlingSection : null}');
  const date = form.indexOf('<MonthCalendar');
  const otherHandling = form.indexOf('{isWorkKind(kind) ? null : handlingSection}');
  assert.ok(workHandling > -1 && otherHandling > -1, 'both placements must exist');
  assert.ok(workHandling < date, 'work is asked how before the calendar');
  assert.ok(otherHandling > date, 'everything else keeps it after the date');
  // One control, two positions. Two copies drift the moment one gains an option.
  assert.equal(form.split('How should Aria handle it?').length - 1, 1);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Work starts, rather than being scheduled and left');

test('an accepted plan is followed by handing in, then by starting', () => {
  /*
   * The change that separates work from an occasion. An event is a date with
   * something to do on it, so scheduling it is the whole job. An assignment
   * accepted and then left alone is a plan nobody started, and the fortnight
   * between accepting a plan and beginning it is exactly where the time goes.
   */
  for (const kind of ['assignment', 'project'] as TaskKind[]) {
    const seen = walk(kind);
    const plan = seen.indexOf('planPreview');
    assert.ok(plan > -1, `${kind} must still show the plan`);
    assert.equal(seen[plan + 1], 'submitWhen', `${kind}: handing in comes straight after the plan`);
    assert.equal(seen[plan + 2], 'startNow', `${kind}: then the offer to begin`);
    assert.equal(seen[seen.length - 1], 'done');
  }
});

test('handing in becomes its own reminder, with an alarm and a day', () => {
  /*
   * Finishing the work and handing it in are two jobs, and the second is the
   * one people lose. A reminder is the category built for exactly that: one
   * job, one hour, an alarm as the point of it. Folding it into the assignment
   * would hide the moment of submission behind a task already closed in
   * somebody's head.
   */
  const d: FlowDraft = {
    ...startFlow('assignment'),
    title: 'Cold War essay',
    facts: { deadline: { value: '2026-09-25', confidence: 'high' } },
    submitWhen: 'day-before',
  };
  const r = submissionReminder(d)!;
  assert.equal(r.date, '2026-09-24', 'the day before means the day before');
  assert.equal(r.time, DEFAULT_SUBMIT_TIME);
  assert.match(r.title, /Hand in: Cold War essay/);
  // It says where the thing to hand in actually is. A bare "hand it in" sends
  // somebody hunting for the document at the worst possible moment.
  assert.match(r.description, /The document is on "Cold War essay"/);

  assert.equal(submissionReminder({ ...d, submitWhen: 'deadline-day' })!.date, '2026-09-25');
  assert.equal(
    submissionReminder({ ...d, submitWhen: 'custom', submitDate: '2026-09-20', submitTime: '16:30' })!.date,
    '2026-09-20',
  );
  assert.equal(
    submissionReminder({ ...d, submitWhen: 'custom', submitDate: '2026-09-20', submitTime: '16:30' })!.time,
    '16:30',
  );
});

test('nothing to hand in produces no reminder', () => {
  // A project with no deadline has no submission, and inventing a date for one
  // would put an alarm on a day nobody chose.
  const noDeadline: FlowDraft = { ...startFlow('project'), title: 'Design system' };
  assert.equal(submissionReminder(noDeadline), null);
});

test('the offer to begin names the first step', () => {
  const d: FlowDraft = {
    ...startFlow('assignment'),
    title: 'Cold War essay',
    plan: [
      { title: 'Read the sources', due: '2026-09-06' },
      { title: 'Submission buffer: 2 days', due: '2026-09-25', buffer: true },
    ],
  };
  assert.match(promptFor('startNow', d), /Read the sources/);
  // And says something useful when there is no plan to name a step from.
  assert.match(promptFor('startNow', startFlow('assignment')), /make a start/i);
});

test('choosing to start later is an answer, not a failure', () => {
  const later = { ...startFlow('assignment'), startedNow: false };
  assert.match(ackFor('startNow', later) ?? '', /plan says when to start/i);
  // Starting now needs no acknowledgement: the work opening is the answer.
  assert.equal(ackFor('startNow', { ...later, startedNow: true }), null);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Answers are remembered, including the negative ones');

test('saying no to an alarm does not ask again', () => {
  /*
   * The bug this exists to prevent. `alarm: false` and "not yet asked" both
   * look falsy, so a check on the value rather than on `answered` would loop
   * on the question forever for anyone who declined.
   *
   * An assignment, because an event asks about a repeat where this asks about
   * an alarm. Same trap either way: `repeat: undefined` is a real answer too.
   */
  let d: FlowDraft = startFlow('general');
  d = {
    ...d,
    answered: { what: true, approach: true, plan: true, date: true, time: true, priority: true },
  };
  assert.equal(nextStep(d), 'alarm');
  d = { ...d, alarm: false, answered: { ...d.answered, alarm: true } };
  assert.notEqual(nextStep(d), 'alarm', 'a declined alarm must not be asked twice');
});

test('"just the once" is remembered the same way', () => {
  // `repeat: undefined` is the answer "no", and identical to never having been
  // asked if anything checks the value rather than `answered`.
  let d: FlowDraft = { ...startFlow('birthday'), answered: { who: true, date: true, time: true } };
  assert.equal(nextStep(d), 'repeat');
  d = { ...d, repeat: undefined, answered: { ...d.answered, repeat: true } };
  assert.notEqual(nextStep(d), 'repeat', 'a declined repeat must not be asked twice');
});

test('declining to send anything is remembered the same way', () => {
  let d: FlowDraft = startFlow('birthday');
  d = { ...d, answered: { who: true, date: true, time: true, repeat: true, priority: true } };
  assert.equal(nextStep(d), 'method');
  d = { ...d, handling: 'remind', answered: { ...d.answered, method: true } };
  assert.notEqual(nextStep(d), 'method');
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
   * nobody was asked and wrong here, the flow just asked and was told no.
   * Overriding a stated answer with a default is worse than never asking.
   */
  const d: FlowDraft = { ...startFlow('birthday'), who: 'Sam', handling: 'remind' };
  assert.notEqual(flowMethod(d), 'card');
  assert.equal(flowMethod({ ...d, handling: 'card' }), 'card');
});

test('a contact picked in chat reaches the saved task', () => {
  const d: FlowDraft = {
    ...startFlow('birthday'),
    who: 'Sam',
    contactPhone: '+15551234',
    date: '2026-08-10',
    time: '09:00',
    alarm: true,
    handling: 'card',
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
  // `time: null` is a real answer, "the day is enough". Passing 00:00 through
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
    'repeat',
    'priority',
    'alarm',
    'method',
    'cardStyle',
    'photo',
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
  const blank = startFlow('event');
  // The contact question is reached with no name at all on a general event,
  // which is exactly where a `${who}` in the wrong sentence would show.
  for (const step of ['contact', 'date', 'method', 'repeat'] as FlowStep[]) {
    assert.doesNotMatch(promptFor(step, blank), /undefined/);
    for (const handling of EVENT_HANDLING) {
      assert.doesNotMatch(promptFor(step, { ...blank, handling: handling.value }), /undefined/);
    }
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
section('Planning a piece of work');

test('a plain task is asked how to handle it, then broken down', () => {
  /*
   * A title alone produces a generic checklist. "Work with me on creating a
   * design system" is the sentence that makes the breakdown worth reading, and
   * the flow never asked for it, it went from a name straight to a date.
   *
   * Only 'general' now. An assignment has a brief and a project has a
   * definition of done; asking either of them to describe an approach in prose
   * would be asking for the same information a third time.
   */
  const seen = walk('general');
  assert.ok(seen.includes('approach'), 'a task must be asked how to handle it');
  assert.ok(seen.includes('plan'), 'a task must be broken down');
  assert.ok(seen.indexOf('approach') < seen.indexOf('plan'), 'the approach shapes the plan');
  assert.ok(seen.indexOf('plan') < seen.indexOf('date'), 'plan before scheduling');
  // An occasion has nothing to break down, and work has its own planning.
  for (const kind of ['birthday', 'reminder', 'event', 'assignment', 'project'] as TaskKind[]) {
    assert.ok(!walk(kind).includes('approach'), `${kind} is not asked for an approach`);
  }
});

test('the document carries everything Aria worked out', () => {
  /*
   * One text for both the copy kept on the task and the one that leaves via the
   * share sheet. If they diverged, the version someone emailed to a colleague
   * would not be the version they could still see in the app.
   */
  const doc = flowDocument({
    ...startFlow('project'),
    title: 'Design system',
    approach: 'Work with me on creating a design system',
    checklist: ['Audit existing components', 'Define the type scale'],
    notes: [{ title: 'Define the type scale', content: 'Start from the body size.' }],
  });
  assert.match(doc, /Work with me on creating a design system/);
  assert.match(doc, /- Audit existing components/);
  assert.match(doc, /Start from the body size/);
  // Nothing collected means nothing offered to export.
  assert.equal(flowDocument(startFlow('project')), '');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Typed answers come from the composer');

test('the steps that need typing have no input of their own', () => {
  /*
   * They each rendered a text box inside the panel, directly above the composer
   *, two places to type the same answer, one of them redundant. The composer
   * is the one people already use.
   */
  for (const step of ['what', 'approach', 'who'] as const) {
    assert.equal(isTypedStep(step), true, `${step} is answered by typing`);
  }
  for (const step of ['date', 'time', 'repeat', 'priority', 'alarm', 'method', 'photo', 'preview'] as const) {
    assert.equal(isTypedStep(step), false, `${step} is answered by tapping`);
  }
});

test('a typed answer lands on the right field', () => {
  assert.deepEqual(applyTypedAnswer('what', ' History essay '), { title: 'History essay' });
  assert.deepEqual(applyTypedAnswer('who', 'Sam'), { who: 'Sam' });
  assert.deepEqual(applyTypedAnswer('approach', 'work with me on it'), {
    approach: 'work with me on it',
  });
  // A tap step typed into: nothing, rather than a wrong field.
  assert.deepEqual(applyTypedAnswer('date', 'tomorrow'), {});
});

// ───────────────────────────────────────────────────────────────────────────────
section('Asking about the work gets an answer; telling it changes the work');

test('a question about the draft is a question', () => {
  /*
   * Everything typed under a draft was treated as "change it", so "why did you
   * put the Berlin example second?" produced another draft. Aria looked like it
   * was repeating itself: it answered a question nobody asked and ignored the
   * one that was.
   */
  for (const q of [
    'why did you put the Berlin example second?',
    'what does equal consideration mean',
    'where did the 1,203 words figure come from?',
    'is this enough for the criteria',
    'explain the second paragraph',
  ]) {
    assert.equal(looksLikeQuestion(q), true, `"${q}" is a question`);
  }
});

test('a change asked for politely is still a change', () => {
  /*
   * The hard half. People ask for edits in question form constantly, and
   * answering "can you make it shorter?" with a paragraph about brevity is the
   * same bug pointing the other way.
   */
  for (const c of [
    'can you make it shorter?',
    'could you rewrite the intro',
    'would you cut the last line?',
    'add a sentence about Berlin',
    'more formal please',
    'turn it into bullet points',
  ]) {
    assert.equal(looksLikeQuestion(c), false, `"${c}" is an instruction`);
  }
});

test('the route is told to answer rather than produce another draft', () => {
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/draft+api.ts'),
    'utf8',
  );
  assert.match(route, /req\.question\?\.trim\(\)/, 'questions have their own path');
  assert.match(route, /Do not rewrite the work/);
  assert.match(route, /do not repeat it back at them: they can see it/);
  assert.match(route, /say that plainly rather than inventing a justification/);
});

test('offline, a question gets an admission rather than a fresh paragraph', () => {
  /*
   * Every other scripted branch writes something plausible, which is right for
   * a demo and wrong here: handing somebody a new paragraph when they asked why
   * a point came second is the same complaint with the stand-in doing it.
   */
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  assert.match(actions, /if \(req\.question\?\.trim\(\)\) return offlineAnswer\(req\.question\)/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Mail goes out by whichever route this deployment has');

test('Gmail wins when it is configured, because configuring it is deliberate', () => {
  /*
   * The alternative rule, "use Resend if it is configured", leaves this project
   * exactly where it started: a working Resend key that silently refuses every
   * recipient except the account holder. Nobody sets a Gmail app password by
   * accident.
   */
  const mailer = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/mailer.ts'), 'utf8');
  assert.match(mailer, /if \(gmailUser\(\) && gmailPass\(\)\) return 'gmail';/);
  const gmailAt = mailer.indexOf("return 'gmail'");
  const resendAt = mailer.indexOf("return 'resend'");
  assert.ok(gmailAt > 0 && gmailAt < resendAt, 'Gmail is checked first');
});

test('a sandbox sender is recognised as reaching nobody but the account holder', () => {
  /*
   * The failure worth naming: a configured Resend key looks identical to a
   * working one right up until somebody watches an email to their tutor not
   * arrive. resend.dev is the giveaway.
   */
  const mailer = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/mailer.ts'), 'utf8');
  assert.match(mailer, /@resend\\\.dev/, 'the sandbox sender is detected');
  assert.match(mailer, /export function canEmailAnyone/);

  const health = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/health.ts'), 'utf8');
  assert.match(health, /Aria can only email you/, 'and the app says so');
  assert.match(health, /Aria can email anyone/);

  const settings = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/(tabs)/settings.tsx'),
    'utf8',
  );
  assert.match(settings, /mailCopy\(state\)/, 'on the settings screen, before it matters');
});

test('the startup check does not nag about Resend on a Gmail deployment', () => {
  /*
   * Telling somebody to fix something they deliberately chose is how a startup
   * warning earns the right to be ignored, and then the one that matters is
   * ignored too.
   */
  const config = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/server-config.ts'),
    'utf8',
  );
  assert.match(config, /if \(gmail && \(name === 'RESEND_API_KEY' \|\| name === 'ARIA_FROM_EMAIL'\)\)/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Editing a scheduled send edits the send');

test('a task with a send waiting says so, and offers to edit that', () => {
  /*
   * Reported as the edit button on a scheduled task opening something that
   * looks like creating a task. It was: the header pencil edits the *task*, and
   * on a task that is going out on Friday the thing somebody wants to change is
   * the recipient, the subject, the message or the moment. Different object,
   * different screen.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/task/[id].tsx'),
    'utf8',
  );
  assert.match(screen, /const sending = automations\.find/, 'the task knows about its send');
  assert.match(screen, /title="Edit what goes out"/);
  assert.match(screen, /email-it\/\$\{task\.id\}/, 'and edits it where it was written');
  assert.match(screen, /title="Cancel it"/, 'with a way to call it off');
});

test('editing a scheduled send replaces it rather than adding a second', () => {
  /*
   * The bug this prevents is worse than the one reported: two rows, so the
   * essay arrives twice, once as corrected and once as it was. The old row is
   * the one the cron holds, so it is cancelled before the new one exists.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/email-it/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /const pending = useAriaStore/, 'it looks for one first');
  assert.match(screen, /if \(pending\) cancelAutomation\(pending\.id\);/, 'and retires it');
  const cancelAt = screen.indexOf('cancelAutomation(pending.id)');
  const scheduleAt = screen.indexOf('scheduleAutomation({');
  assert.ok(cancelAt > 0 && cancelAt < scheduleAt, 'cancelled before the replacement is made');
  assert.match(screen, /if \(pending\?\.body\) return pending\.body;/, 'edits are not thrown away');
  assert.match(screen, /pending \? 'Save the change' : 'Schedule it'/, 'and it says which it is');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Every way out of a screen works');

test('nothing calls router.back() directly', () => {
  /*
   * Reported as "The action 'GO_BACK' was not handled by any navigator".
   * `router.back()` assumes the screen was pushed onto something, and often it
   * was not: a notification opens a task cold, the create form ends in
   * `replace('/aria/[id]')` so the walkthrough replaced its own history, and
   * saving elsewhere calls `dismissAll` by design. The tap then did nothing and
   * threw a red box, which is worse than a dead button: it is a dead button
   * that looks like a crash.
   */
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        if (full.endsWith(path.join('lib', 'nav.ts'))) continue;
        if (readFileSync(full, 'utf8').includes('router.back()')) offenders.push(full);
      }
    }
  };
  walk(path.resolve(import.meta.dirname, '../../src'));
  assert.deepEqual(offenders, [], 'use goBack(), which knows whether there is history');
});

test('the fallback is a place, not a crash', () => {
  const nav = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/nav.ts'), 'utf8');
  assert.match(nav, /if \(router\.canGoBack\(\)\)/, 'ask the navigator');
  assert.match(nav, /router\.replace\(fallback\)/, 'and land somewhere when it says no');
  // An X that is sometimes missing is harder to learn than one that always
  // works, so the control stays put and the destination changes.
  assert.match(nav, /fallback: Href = '\/\(tabs\)'/);
});

test('dismissAll is guarded the same way', () => {
  /*
   * It throws the same error, and the optional call guards a missing method
   * rather than an empty stack. Arriving from a notification is exactly the
   * case where there is nothing to dismiss.
   */
  for (const file of ['src/app/email-it/[taskId].tsx', 'src/app/hand-in/[taskId].tsx']) {
    const src = readFileSync(path.resolve(import.meta.dirname, '../../', file), 'utf8');
    assert.match(src, /if \(router\.canGoBack\(\)\) router\.dismissAll\?\.\(\);/, file);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
section('A task remembers its own conversation');

test('the thread is stored per task, not in the screen', () => {
  /*
   * Reported as Continue starting afresh. The messages were `useState`, so they
   * died with the screen: reopening a task Aria had worked on for an hour
   * showed an empty page and everything asked and answered was gone.
   */
  const store = readFileSync(
    path.resolve(import.meta.dirname, '../../src/store/aria-store.ts'),
    'utf8',
  );
  assert.match(store, /workChats: Record<string, WorkChat>/, 'threads live in the store');
  assert.match(store, /workChats: s\.workChats/, 'and are persisted');
  assert.match(store, /slice\(-CHAT_LIMIT\)[\s\S]{0,200}\},\n          \};/, 'bounded like the main thread');

  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /if \(savedChat\?\.messages\.length\)/, 'an existing thread is the answer');
  assert.match(screen, /const EMPTY_THREAD: Msg\[\] = \[\];/, 'and a stable empty for zustand');
  assert.ok(
    !/const \[messages, setMessages\] = useState/.test(screen),
    'nothing keeps the thread in screen state any more',
  );
});

test('a thread reaches the server, and a missing table never wipes one', () => {
  /*
   * The work already synced: parts, sections, the instruction, the unfinished
   * draft. The conversation about it did not, so a second device resumed the
   * work and opened an empty chat, and the reasoning behind the work existed on
   * one handset. Migration 006 is the table; these are the rules around it.
   */
  const sync = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/sync.ts'), 'utf8');
  assert.match(sync, /from\('work_messages'\)\.upsert/, 'messages are written through');
  assert.match(sync, /workChats: Record<string, WorkChat> \| null/, 'null means could not fetch');
  assert.match(sync, /messagesRes\.error\n\s*\? null/, 'an un-migrated project degrades');

  const store = readFileSync(
    path.resolve(import.meta.dirname, '../../src/store/aria-store.ts'),
    'utf8',
  );
  assert.match(
    store,
    /data\.workChats\n\s*\? \{ \.\.\.localChats, \.\.\.data\.workChats \}\n\s*: localChats/,
    'local threads survive a failed or empty fetch',
  );
  assert.match(store, /deleteAllWorkChats\(\)/, 'and a clear-out reaches the server');
  /*
   * The tables arrived after the app did, so conversations from before them
   * exist on one phone. Shipping without a backfill would work perfectly from
   * the day it shipped and lose everything before it, which is the same bug
   * with a date on it.
   */
  assert.match(sync, /export async function backfillWorkChats/, 'older threads are handed up');
  assert.match(sync, /if \(remote\[taskId\]\?\.messages\.length\) continue;/,
    'and never over one the server already has');
});

test('a message id is a uuid, because it is now a primary key', () => {
  /*
   * The counter restarted at every mount, so a restored thread plus one new
   * message produced two called "m1": React keyed them together and the server
   * would have read the second as an edit of the first.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /id: uuidv4\(\),/);
  assert.ok(!/id: `m\$\{msgId/.test(screen), 'no per-mount counter');
});

test('the migration exists, and locks the rows to their owner', () => {
  /*
   * A student's conversation about their coursework is the most personal thing
   * in this schema, and the check is in the database rather than in a client
   * remembering to filter.
   */
  const sql = readFileSync(
    path.resolve(import.meta.dirname, '../../supabase/migrations/006_work_messages.sql'),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.work_messages/, 'safe to run twice');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = user_id/, 'your rows and nobody else\'s');
  assert.match(sql, /notify pgrst, 'reload schema'/, 'or the API keeps serving the old shape');
});

test('clearing data takes the per-task threads with it', () => {
  /*
   * A conversation about a task that no longer exists is orphaned, and after a
   * sign-out it is somebody else's.
   */
  const store = readFileSync(
    path.resolve(import.meta.dirname, '../../src/store/aria-store.ts'),
    'utf8',
  );
  assert.equal((store.match(/workChats: \{\}/g) ?? []).length, 3, 'initial state, clear, sign-out');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Work can be handled the way they asked, not only the ways Aria knows');

test('"Something else" is one of the ways work can be handled', () => {
  /*
   * Three options were three things Aria had thought of. Real coursework asks
   * for other things: turn these notes into slides, check my references against
   * the criteria, rewrite this in plain English.
   */
  // Read as text: lib/aria-actions.ts reaches the store, and anything that
  // imports it dies without a React Native runtime. Same rule as work-client.
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  assert.match(
    actions,
    /ASSIGNMENT_METHODS: TaskMethod\[\] = \['steps', 'outline', 'draft', 'other'\]/,
    'work can be handled their way',
  );
  assert.match(actions, /other: 'Something else'/);
  // Not on a reminder: there is nothing there to instruct.
  assert.match(actions, /if \(kind === 'reminder'\) return \['remind'\]/);
});

test('the instruction is kept, and kept out of the work', () => {
  /*
   * It travels as a reserved section for the same reason the working draft
   * does: sections are the part of a task that syncs. Reserved, so an
   * instruction never turns up inside an essay.
   */
  const sections = [
    { title: INSTRUCTION_SECTION, content: 'Ten slides, twenty words each.' },
    { title: 'Slide 1', content: 'a' },
  ];
  assert.equal(ownInstruction(sections), 'Ten slides, twenty words each.');
  assert.deepEqual(
    writtenSections(sections).map((s) => s.title),
    ['Slide 1'],
  );
  assert.equal(isReserved(INSTRUCTION_SECTION), true);
});

test('the card says their sentence back, not a summary of it', () => {
  /*
   * A summary is where a promise starts drifting from what was asked, and this
   * is the one option whose entire worth is being followed exactly.
   */
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  assert.match(actions, /You asked me to: “\$\{asked\}”/, 'their words, verbatim');
  assert.match(actions, /drafting: 'it, exactly as you described'/);
});

test('the route is told to obey it rather than improve on it', () => {
  /*
   * The failure to design against: a model asked to be helpful rounds an
   * unusual instruction toward a familiar one, and "ten slides, twenty words
   * each" quietly becomes an essay plan.
   */
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/draft+api.ts'),
    'utf8',
  );
  assert.match(route, /req\.ownInstruction\?\.trim\(\)/, 'their instruction is read first');
  assert.match(route, /Follow that instruction to the letter/);
  assert.match(route, /do not improve on the format/);
  assert.match(route, /ask one specific question and nothing else/, 'asks rather than guesses');

  /*
   * And there is room to actually do it.
   *
   * 1024 tokens is plenty for a card or one essay section, which is all this
   * route used to be asked for. "Ten slides, twenty words each" ran out after
   * five in testing, and a truncated answer to a precise instruction reads as
   * Aria having ignored it, which is the one failure this option cannot afford.
   * With the larger ceiling the same request came back as ten slides, eleven
   * words at the longest, no bullets, no thank-you slide.
   */
  assert.match(route, /body\.ownInstruction\?\.trim\(\) \? 4096 : 1024/, 'room to obey it');

  // And it is bounded on the way in, like every other free-text field.
  const schemas = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/api-schemas.ts'),
    'utf8',
  );
  assert.match(schemas, /ownInstruction: z\.string\(\)\.max\(2000\)\.optional\(\)/);
});

test('choosing it without saying anything cannot be saved', () => {
  /*
   * An empty instruction would have Aria guess, which is the one thing this
   * option exists to prevent.
   */
  const form = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/task/new.tsx'),
    'utf8',
  );
  assert.match(form, /const instructionMissing = ownWords && instruction\.trim\(\)\.length === 0;/);
  assert.match(form, /instructionMissing \|\|/, 'and it blocks saving');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Continuing means continuing');

test('a working draft is never part of the work', () => {
  /*
   * The unfinished draft is stored as a section, because sections are the part
   * of a task that already syncs and nobody has migrated a new column. The
   * price is that everything reading sections has to know the reserved titles:
   * a half-written paragraph appearing inside a submitted essay is the kind of
   * bug that ships silently.
   */
  const sections = [
    { title: 'Introduction', content: 'a' },
    { title: WORKING_SECTION, content: 'half a sentence' },
    { title: ASSEMBLED_SECTION, content: 'the whole thing' },
  ];
  assert.deepEqual(
    writtenSections(sections).map((s) => s.title),
    ['Introduction'],
  );
  assert.equal(workingDraft(sections)?.content, 'half a sentence');
  assert.equal(isReserved(WORKING_SECTION), true);
  assert.equal(isReserved('Introduction'), false);
});

test('nothing that hands work to a person includes the reserved sections', () => {
  /*
   * One filter, used everywhere, rather than four copies of it with one screen
   * left behind.
   */
  const consumers = [
    'src/app/assembled/[taskId].tsx',
    'src/app/hand-in/[taskId].tsx',
    'src/app/email-it/[taskId].tsx',
    'src/app/task/[id].tsx',
    'src/lib/work-runner.ts',
  ];
  for (const file of consumers) {
    const src = readFileSync(path.resolve(import.meta.dirname, '../../', file), 'utf8');
    assert.match(src, /writtenSections\(/, `${file} must filter sections through one place`);
  }
});

test('reopening a started task resumes it rather than starting again', () => {
  /*
   * Reported as Continue restarting the task. The position was right, the next
   * unfinished part, but nothing that had already happened was on screen and
   * the draft somebody left was replaced by a freshly written one, which is
   * what loses their tweaks.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /const returning = done > 0/, 'it knows whether this is a return');
  assert.match(screen, /Picking up where we left off/, 'and says so');
  assert.match(screen, /savedFor && \(!savedFor\.sub \|\| savedFor\.sub\.id === first\.id\)/,
    'a stored draft is restored only for the part still open');
  assert.match(screen, /keepWorking\(/, 'every draft shown is stored as it appears');
  assert.match(screen, /clearWorking\(\)/, 'and retired once accepted');
});

test('the offer knows the difference between starting and carrying on', () => {
  const actions = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/aria-actions.ts'),
    'utf8',
  );
  assert.match(actions, /const started = done > 0/, 'progress is what decides it');
  assert.match(actions, /started \? 'Continue'/, "and a return says Continue");
  assert.match(actions, /parts done\. Next up/, 'with where they got to');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Sending finished work asks four things');

test('the send screen asks for the address, the subject, the message, and nothing else', () => {
  /*
   * The general schedule screen has to cover texts, cards and WhatsApp, so it
   * opens with a channel picker, asks for a name and a phone number, and
   * carries a Pro pitch. All of that is noise when the button already said
   * email: a tutor does not need a first name to receive an essay.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/email-it/[taskId].tsx'),
    'utf8',
  );
  for (const field of ['label="Email address"', 'label="Subject"', 'label="Message Aria will send"']) {
    assert.ok(screen.includes(field), `the send screen must ask for ${field}`);
  }
  // One commit button, whichever word it is wearing: scheduling the first time,
  // saving the change when the task already has a send waiting.
  assert.match(screen, /pending \? 'Save the change' : 'Schedule it'/, 'and commit with one button');

  for (const absent of ['AUTO_CHANNELS', 'ContactField', 'toPhone', 'PRO_PITCH']) {
    assert.ok(!screen.includes(absent), `${absent} belongs to the general screen, not this one`);
  }
});

test('the moment it goes out is on screen even though it is not asked for', () => {
  /*
   * A scheduled send whose moment is nowhere to be seen is one people assume
   * went out immediately. It is stated as a sentence, taken from the day the
   * work is due, with the pickers folded away behind "Change" for the case
   * where the deadline is not the moment.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/email-it/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /Goes out \$\{formatFull\(date\)\}/, 'said in words');
  assert.match(screen, /changing \? 'Done' : 'Change'/, 'and changeable without being asked');
  assert.match(screen, /const past =/, 'never into the past');
});

test('the writing screen no longer offers a second calendar', () => {
  /*
   * "Schedule for later" put a hand-in date in front of somebody who had just
   * finished writing and may not know it yet. The day a piece of work is due
   * lives on the task, where it already is; what belongs at the end of the
   * writing is what happens to the writing.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  assert.ok(!screen.includes('title="Schedule for later"'), 'no scheduling CTA on the work screen');
  assert.ok(!screen.includes('Set when it goes out anyway'), 'nor its quieter twin');
  assert.match(screen, /email-it\/\$\{task\.id\}/, 'the email CTA goes to the focused screen');
});

// ───────────────────────────────────────────────────────────────────────────────
section('A toast is sized to the sentence it carries');

test('the toast text can be narrower than it wants to be', () => {
  /*
   * Reported as the reload toast running out of its container. `maxWidth` on
   * the pill bounds the pill; the Text inside kept its full intrinsic width and
   * ran straight out the side, because a flex child does not shrink unless it
   * is told it may. These toasts carry real sentences, "X is assembled, 1,203
   * words. 2 things to look at before you send it", so this is not a rare case.
   */
  const host = readFileSync(
    path.resolve(import.meta.dirname, '../../src/components/toast-host.tsx'),
    'utf8',
  );
  assert.match(host, /className="shrink font-strong/, 'the text may be smaller than its content');
  assert.match(host, /maxWidth: '90%'/, 'and the pill is still bounded');
  assert.match(host, /numberOfLines=\{2\}/, 'two lines, then an ellipsis');
  assert.doesNotMatch(host, /numberOfLines=\{1\}/, 'one line truncated the reports that matter');
  // A toast is glanced at on the way to something else, so the reports it
  // carries were shortened to fit rather than the pill grown to hold them.
  assert.match(host, /variant="small"/, 'one size down from body text');
});

test('nothing is offered to decline when the button says Done', () => {
  /*
   * Accepting a draft no longer sends or finishes anything, it asks where the
   * work should live, so a "Not now" beside it refused a question nobody asked.
   * A send keeps its refusal: "do not send this to them" is a real answer.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  const row = /<View className="flex-row gap-2">[\s\S]{0,700}?<\/View>/.exec(
    screen.slice(screen.indexOf('{/* Primary actions */}')),
  );
  assert.ok(row, 'the primary action row is still there to check');
  assert.match(row![0], /action\.needsSend \? \(/, 'the refusal is gated on there being a send');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Aria does not assume work is finished');

test('one section of a six-part project is not ready to hand in', () => {
  /*
   * Reported as Aria assuming somebody wants to schedule a project when they
   * are nowhere near done. Scheduling is the ending, and offering an ending to
   * somebody a sixth of the way through says Aria thinks they have finished. At
   * best that is noise; at worst they take it, set a date, and stop.
   */
  const r = handInReadiness({
    subtasks: [{ done: true }, ...Array.from({ length: 5 }, () => ({ done: false }))],
    draftSections: [{}],
  });
  assert.equal(r.ready, false);
  assert.equal(r.blocker, '5 of 6 steps still open', 'counted, so they know how far off they are');
});

test('every step ticked and something written is ready', () => {
  const r = handInReadiness({ subtasks: [{ done: true }, { done: true }], draftSections: [{}] });
  assert.equal(r.ready, true);
  assert.equal(r.blocker, undefined);
});

test('ticked steps with nothing written are not ready', () => {
  /*
   * A plan can be checked off by somebody working outside the app, and the
   * document that went out would then be empty. Ticks say the work happened;
   * sections say Aria has something to hand over.
   */
  const r = handInReadiness({ subtasks: [{ done: true }], draftSections: [] });
  assert.equal(r.ready, false);
  assert.equal(r.blocker, 'nothing written yet');
});

test('a piece of work with no steps at all rests on what was written', () => {
  assert.equal(handInReadiness({ draftSections: [{}] }).ready, true);
  assert.equal(handInReadiness({}).ready, false);
});

test('one step, singular; the count never reads like a template', () => {
  assert.equal(handInReadiness({ subtasks: [{ done: false }] }).blocker, '1 of 1 step still open');
});

test('unfinished work is offered the next step, not an ending', () => {
  /*
   * Aria used to follow one section of a six-part project with an ending, which
   * says it thinks they have finished. The scheduling buttons have since left
   * this screen entirely, so what remains to check is that unfinished work is
   * still answered with the work, and that the deadline question still lives on
   * the task screen, where it can be asked once and kept.
   */
  const screen = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/aria/[taskId].tsx'),
    'utf8',
  );
  assert.match(screen, /!readiness\.ready \?/, 'unfinished work is recognised');
  assert.match(screen, /Keep going: \$\{upNext\.title\}/, 'and answered with the next step');

  const task = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/task/[id].tsx'),
    'utf8',
  );
  assert.match(task, /handInReadiness\(task\)/, 'the task screen asks the same question');
  assert.match(task, /hand-in\/\$\{task\.id\}/, 'and is where a deadline is set');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Nothing offers to end a conversation that is still going');

test('the in-chat Guide offers to carry on, not to close', () => {
  /*
   * Reported as Aria adding a close button while somebody was still talking to
   * it. The Guide is a detour inside a live setup: they are halfway through
   * putting a piece of work together, they asked for directions, and they are
   * choosing between them. "Close" reads as an offer to end the exchange, and
   * nothing is being closed, the setup resumes at the question it left.
   *
   * The modal guide sheet on the task screen is deliberately not covered here:
   * that one really is a sheet, and closing it is what the button does.
   */
  const panels = readFileSync(
    path.resolve(import.meta.dirname, '../../src/components/work-panels.tsx'),
    'utf8',
  );
  assert.match(panels, /const GUIDE_EXIT = 'Carry on without it';/);
  assert.doesNotMatch(panels, /label="Close"/, 'no panel inside the conversation says Close');
  assert.doesNotMatch(panels, /Never mind/, 'and none of them says it a second way');
  // Three exits, one string: a person who learns what it does in one panel
  // should not have to relearn it in the next.
  assert.equal((panels.match(/GUIDE_EXIT/g) ?? []).length, 4, 'declared once, used three times');
});

test('leaving the Guide puts the conversation back where it was', () => {
  /*
   * The other half of the same complaint: an exit that ended the thread would
   * make "carry on" a lie. Closing re-asks the step it came from, so the flow
   * visibly continues rather than going quiet.
   */
  const chat = readFileSync(path.resolve(import.meta.dirname, '../../src/app/chat.tsx'), 'utf8');
  const fn = /function guideClose\(\)[\s\S]{0,400}?\n  \}/.exec(chat);
  assert.ok(fn, 'guideClose is still there to check');
  assert.match(fn![0], /setFlowStep\(closed\.guide!\.from\)/, 'returns to the step it left');
  assert.match(fn![0], /addChatMessage\(mkPrompt/, 'and re-asks that question out loud');
});

// ───────────────────────────────────────────────────────────────────────────────
section('A searched answer can be checked');

test('the same page cited four times is one source', () => {
  /*
   * A model cites the page it is using once per sentence, so a two-line answer
   * routinely carries four citations to one article. Listed raw, that reads as
   * four independent sources agreeing, which is the opposite of what happened.
   */
  const out = dedupeSources([
    { title: 'Fees 2026', url: 'https://uni.ac.uk/fees' },
    { title: 'Fees 2026', url: 'https://uni.ac.uk/fees#tuition' },
    { title: 'Fees', url: 'https://uni.ac.uk/fees/' },
    { title: 'Loans', url: 'https://gov.uk/loans' },
  ]);
  assert.equal(out.length, 2, 'fragments and trailing slashes are the same page');
  assert.deepEqual(
    out.map((s) => s.url),
    ['https://uni.ac.uk/fees', 'https://gov.uk/loans'],
  );
});

test('a wall of links is not evidence', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    title: `Page ${i}`,
    url: `https://example${i}.com/a`,
  }));
  assert.equal(dedupeSources(many).length, 4, 'capped');
});

test('a source with no title still shows who published it', () => {
  /*
   * Deciding whether to trust a claim is mostly deciding who said it, so a
   * missing title must never leave a blank row: the host stands in.
   */
  const [s] = dedupeSources([{ title: '', url: 'https://www.BBC.co.uk/news/x?utm=1' }]);
  assert.equal(s.title, 'bbc.co.uk');
  assert.equal(hostOf('https://www.gov.uk/student-finance'), 'gov.uk');
});

test('a blank url is dropped rather than shown', () => {
  assert.deepEqual(dedupeSources([{ title: 'Nowhere', url: '  ' }]), []);
});

test('Aria no longer apologises for being unable to search', () => {
  /*
   * The notice said "no searching the web, no reading sources" and was shown
   * before every research pass. It is now false in the ordinary case, and a
   * product that disclaims a feature it has is worse than one that never had
   * it. What replaced it is said only when no search actually ran.
   */
  // Read as text: lib/assistant.ts reaches the store, and anything importing
  // that dies without a React Native runtime. Same rule as work-client.ts.
  const lib = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/assistant.ts'), 'utf8');
  assert.doesNotMatch(lib, /No searching the web, no reading sources/i);
  assert.match(lib, /FROM_MEMORY_NOTICE[\s\S]{0,200}came from what I already know/i);
  assert.doesNotMatch(lib, /browsing live websites/i);
});

test('asking Aria to look something up is no longer refused', () => {
  /*
   * "Google it" used to return the limits notice. It is a request Aria can now
   * simply carry out, and the notice is reserved for what is still true:
   * booking, ordering, paying.
   */
  const lib = readFileSync(path.resolve(import.meta.dirname, '../../src/lib/assistant.ts'), 'utf8');
  const trigger = /return \/\\b\(([^)]+)\)\\b\/\.test\(t\);/.exec(lib);
  assert.ok(trigger, 'the real-world-action trigger list is still there to check');
  const words = trigger![1];
  for (const gone of ['browse the', 'google it', 'search the web']) {
    assert.ok(!words.includes(gone), `"${gone}" is something Aria can now do`);
  }
  for (const kept of ['book', 'order', 'pay for']) {
    assert.ok(words.includes(kept), `"${kept}" is still genuinely out of reach`);
  }
});

test('the route decides per message whether to search, and says how', () => {
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/assistant+api.ts'),
    'utf8',
  );
  assert.match(route, /lookUp/, 'the model flags what needs looking up');
  assert.match(route, /required: \['reply', 'lookUp', 'lookUpQuery', 'tasks'\]/);
  assert.match(route, /askWithSearch/, 'and the flag actually triggers a search');
});

test('only research reads the web on the draft route', () => {
  /*
   * A birthday card does not improve with citations, and a search on every
   * draft would spend money and seconds to add nothing. Research is the one
   * request on that route where being out of date is the failure.
   */
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/draft+api.ts'),
    'utf8',
  );
  assert.match(route, /if \(body\.research\) \{/, 'gated on the research flag');
  // Against the call site, not the import, which is naturally at the top.
  const gate = route.indexOf('if (body.research)');
  assert.ok(gate > 0 && gate < route.indexOf('askWithSearch(client'), 'the gate comes first');
});

test('the Guide reads the web, and gates itself when it would be pointless', () => {
  /*
   * The Guide is where being out of date costs the most: it is read against a
   * real brief with a real deadline, and a direction that ignores something
   * published last month is a week somebody spends on the wrong thing.
   *
   * It does not search every time. Run against the two shapes, an essay on the
   * causes of the English Civil War answered "NOTHING NEW" without searching,
   * and a report on current AI regulation searched and came back with four
   * sources. That gate is the model's own, and it has to stay written down or
   * the screen starts spending a search on every settled topic.
   */
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/guide+api.ts'),
    'utf8',
  );
  assert.match(route, /askWithSearch/, 'the Guide looks things up');
  assert.match(route, /NOTHING NEW/, 'and is told how to decline when it is pointless');
  assert.match(route, /current\.searched/, 'a declined search must not count as grounding');
  assert.match(route, /sources: grounding\?\.sources/, 'sources only when something was used');
});

test('a failed search costs the citations, never the answer', () => {
  /*
   * The API answers 200 with an error object inside the result block instead of
   * a list of results, so code that assumes a list loses the whole answer to a
   * crash over a search that merely did not run.
   */
  const lib = readFileSync(
    path.resolve(import.meta.dirname, '../../src/lib/web-search.ts'),
    'utf8',
  );
  assert.match(lib, /if \(!Array\.isArray\(content\)\)/, 'a non-list result is handled');
  assert.match(lib, /return null/, 'and a failed call returns null for the caller to fall back');
  assert.match(lib, /pause_turn/, 'a long answer is resumed rather than truncated');
  assert.match(lib, /max_uses/, 'with a ceiling on how many searches one answer runs');
  /*
   * The tool version is a deliberate choice, not a default left lying around.
   * The newer `_20260209` variant returns no citations at all, which was
   * measured rather than assumed, and losing them is silent: the answers go on
   * looking exactly as good with nothing behind them.
   */
  assert.match(lib, /web_search_20250305/, 'the variant that returns citations');
  assert.doesNotMatch(lib, /type: 'web_search_20260209'/, 'not the one that drops them');
});

// ───────────────────────────────────────────────────────────────────────────────
section('A question gets an answer, not a menu');

test('the offline reply never repeats itself across different questions', () => {
  /*
   * Reported as "Aria is repeating itself and cannot answer real questions".
   * The cause was one fixed sentence returned for every message that did not
   * look like a task: an invitation to add something, which is not an answer to
   * "how long should the introduction be", and identical every time, which is
   * what made an offline assistant look like a broken one.
   */
  const answers = [
    offlineAnswer('how long should the introduction be?'),
    offlineAnswer('what should I say to my tutor?'),
    offlineAnswer('is the essay meant to have a conclusion?'),
    offlineAnswer('thoughts on my structure'),
  ];
  assert.equal(new Set(answers).size, answers.length, 'four questions, four different replies');
  for (const a of answers) {
    assert.ok(a.length > 40, 'a reply short enough to be a slogan is a deflection');
    assert.doesNotMatch(a, /remind me to submit my lab report/, 'the old canned line is gone');
  }
});

test('it says it cannot answer, rather than pretending the question was a task', () => {
  /*
   * The honest failure. A scripted reply cannot answer a question; what it can
   * do is say so, which is the difference between an assistant that is
   * unavailable and one that is stupid.
   */
  const a = offlineAnswer('what is the difference between a thesis and an argument?');
  assert.match(a, /can't|cannot/i, 'it admits what is happening');
  assert.doesNotMatch(a, /^Here.s what I.ve got/, 'and never claims to have prepared a task');
});

test('the model is told to answer questions, not only to capture tasks', () => {
  /*
   * The system prompt opened "Your job in this chat is to turn what they say
   * into calendar tasks", which is what the model then did to a question. Both
   * behaviours are named now, and answering is first.
   */
  const route = readFileSync(
    path.resolve(import.meta.dirname, '../../src/app/api/assistant+api.ts'),
    'utf8',
  );
  assert.match(route, /1\. ANSWER/, 'answering is a stated job');
  assert.match(route, /2\. CAPTURE/, 'and capturing is the other');
  assert.ok(
    route.indexOf('1. ANSWER') < route.indexOf('2. CAPTURE'),
    'answering comes first, because it is what people notice',
  );
  assert.match(route, /Never repeat a previous reply/);
});

// ───────────────────────────────────────────────────────────────────────────────
section('Aria talks about one task at a time');

test('only the current task reaches the model', () => {
  /*
   * The whole thread was going, so an assignment question was answered with a
   * birthday two tasks earlier still in context. The transcript already draws
   * the seams; this is what makes them real.
   */
  const thread = [
    { text: "Sam's birthday", from: 'maya' },
    { text: 'Saved it', from: 'aria' },
    { text: 'Assignment', from: 'aria', divider: 'Assignment' },
    { text: 'History essay', from: 'maya' },
    { text: 'When is it due?', from: 'aria' },
  ];
  const scoped = currentTaskMessages(thread);
  assert.equal(scoped.length, 2, 'only what follows the last divider');
  assert.equal(scoped[0].text, 'History essay');
  assert.ok(!scoped.some((m) => m.text.includes('birthday')), 'the earlier task must not leak in');
});

test('dividers are never sent as things Aria said', () => {
  // Their text is a bare category word, which as an assistant turn reads as
  // Aria saying "Birthday" unprompted.
  const thread = [
    { text: 'Birthday', from: 'aria', divider: 'Birthday' },
    { text: 'Who for?', from: 'aria' },
  ];
  const sent = historyForModel(thread);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'Who for?');
});

test('a thread with no dividers is sent whole, up to the window', () => {
  const thread: { text: string; from: string; divider?: string }[] = Array.from(
    { length: 30 },
    (_, i) => ({ text: `m${i}`, from: 'maya' }),
  );
  assert.equal(currentTaskMessages(thread).length, 30, 'nothing to scope to');
  const sent = historyForModel(thread);
  assert.equal(sent.length, 20, 'bounded');
  assert.equal(sent[sent.length - 1].text, 'm29', 'and it keeps the most recent');
});

// ───────────────────────────────────────────────────────────────────────────────
section('Saving by asking for it');

test('a request to save is recognised, a report of saving is not', () => {
  for (const t of ['save this task', 'save it', 'can you export this plan', 'email that to me', 'share these notes']) {
    assert.equal(wantsSave(t), true, `should ask to save: ${t}`);
  }
  /*
   * False positives derail a conversation; false negatives cost nothing,
   * because the buttons are still on screen. So the bar sits high on purpose.
   */
  for (const t of ["I already saved it", "don't send that", 'email from my tutor', 'what should I do next']) {
    assert.equal(wantsSave(t), false, `should not: ${t}`);
  }
});

test('a named destination is carried out, an unnamed one is asked about', () => {
  assert.equal(saveTarget('email it to me'), 'email');
  assert.equal(saveTarget('save it as a doc'), 'doc');
  assert.equal(saveTarget('keep it as a note'), 'note');
  // "save this" alone names nothing, which is the cue to ask rather than guess.
  assert.equal(saveTarget('save this'), null);
  assert.match(SAVE_QUESTION, /note.*document.*email/i);
});

test('email wins when a sentence names two destinations', () => {
  // "email it to me as a doc" is an email with an attachment, not a file save.
  assert.equal(saveTarget('email it to me as a doc'), 'email');
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
