/**
 * Everything Aria can actually do inside this app, in one list.
 *
 * Pure, so the check suites hold it, the server prompt is built from it, and
 * the screen that runs an action reads the same names. One list, three readers.
 *
 * ── Why a list rather than a prompt ─────────────────────────────────────────
 *
 * "Tell me what you can do" answered from a model's imagination produces a
 * confident paragraph about features this app does not have, and an offer to
 * carry one out that quietly does nothing. Everything here maps to a real
 * mutation or a real screen, the model may only name things from this list, and
 * the runner refuses anything it does not recognise. A capability that stops
 * existing breaks the build rather than the promise.
 *
 * ── Why nothing here runs on its own ────────────────────────────────────────
 *
 * Every one of these arrives as an offer with a button. Aria changing somebody's
 * theme, their name or their notification settings because a sentence sounded
 * like a request is the kind of help nobody asked for, and the tap is the
 * difference between an assistant and something rummaging through your
 * settings.
 */

export type ActionId =
  // Making things
  | 'create.assignment'
  | 'create.project'
  | 'create.event'
  | 'create.reminder'
  // Who you are
  | 'profile.name'
  | 'profile.context'
  // How the app behaves
  | 'settings.theme'
  | 'settings.notifications'
  | 'settings.haptics'
  | 'settings.proactive'
  | 'settings.dailyReview'
  | 'settings.reviewTime'
  | 'settings.sampleData'
  | 'settings.pro'
  // Where things are
  | 'open.tasks'
  | 'open.calendar'
  | 'open.activity'
  | 'open.review'
  | 'open.settings'
  | 'open.profile';

export interface Capability {
  id: ActionId;
  /** What the button says. An imperative, because it is about to happen. */
  label: string;
  /** One line for the list, in Aria's voice rather than a manual's. */
  blurb: string;
  /**
   * What the action needs from the person, if anything.
   *
   * `text` is a name or a sentence, `time` an HH:mm, `on` a switch, `theme` one
   * of the theme names. Absent means the action is complete on its own.
   */
  needs?: 'text' | 'time' | 'on' | 'theme';
  /** True for the ones that only exist on a paid account. */
  pro?: boolean;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'create.assignment',
    label: 'Set up an assignment',
    blurb: 'Set up an assignment or essay. I break it into parts and work through them with you.',
  },
  {
    id: 'create.project',
    label: 'Set up a project',
    blurb: 'Set up a project the same way, broken into parts with dates that work backwards.',
  },
  {
    id: 'create.event',
    label: 'Add an event',
    blurb: 'Put something in the calendar: a birthday, a dinner, an appointment, with an alarm.',
  },
  {
    id: 'create.reminder',
    label: 'Add a reminder',
    blurb: 'A nudge at a moment you pick, and nothing else.',
  },
  {
    id: 'profile.name',
    label: 'Change my name',
    blurb: 'Change the name I write as and sign things with.',
    needs: 'text',
  },
  {
    id: 'profile.context',
    label: 'Change what I know about you',
    blurb: 'Tell me what you study or do, so what I write sounds like you rather than like anyone.',
    needs: 'text',
  },
  {
    id: 'settings.theme',
    label: 'Change the theme',
    blurb: 'Switch how the app looks, or have it follow your device.',
    needs: 'theme',
  },
  {
    id: 'settings.notifications',
    label: 'Turn notifications on or off',
    blurb: 'Whether reminders and alarms reach you outside the app.',
    needs: 'on',
  },
  {
    id: 'settings.haptics',
    label: 'Turn haptics on or off',
    blurb: 'The small taps you feel when something is confirmed.',
    needs: 'on',
  },
  {
    id: 'settings.proactive',
    label: 'Turn my offers on or off',
    blurb: 'Whether I suggest things on your home screen or wait to be asked.',
    needs: 'on',
  },
  {
    id: 'settings.dailyReview',
    label: 'Turn the daily review on or off',
    blurb: 'The morning list you approve in one go.',
    needs: 'on',
    pro: true,
  },
  {
    id: 'settings.reviewTime',
    label: 'Change when I check in',
    blurb: 'The time the daily review arrives.',
    needs: 'time',
    pro: true,
  },
  {
    id: 'settings.sampleData',
    label: 'Show or hide the sample tasks',
    blurb: 'A worked example planner to look around, and a clean one when you are done.',
    needs: 'on',
  },
  {
    id: 'settings.pro',
    label: 'Switch Pro on or off',
    blurb: 'Working ahead, the daily review, and sending without being watched.',
    needs: 'on',
  },
  { id: 'open.tasks', label: 'Open my tasks', blurb: 'Everything on your list, in one place.' },
  { id: 'open.calendar', label: 'Open the calendar', blurb: 'The month, and what sits in it.' },
  {
    id: 'open.activity',
    label: 'Open what I have done',
    blurb: 'What I sent, what I am about to send, and what failed.',
  },
  {
    id: 'open.review',
    label: 'Open the daily review',
    blurb: "Today's list, ready to approve.",
    pro: true,
  },
  { id: 'open.settings', label: 'Open settings', blurb: 'Everything you can change about the app.' },
  { id: 'open.profile', label: 'Open my profile', blurb: 'Your name, your details, your account.' },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function capabilityFor(id: string): Capability | undefined {
  return BY_ID.get(id as ActionId);
}

/**
 * The list, as the model is allowed to see it.
 *
 * Ids and blurbs only. It is a menu the model orders from, not a description it
 * paraphrases, which is what stops "I can also sync with your university portal"
 * appearing in a sentence that reads exactly like the true ones.
 */
export function capabilityMenu(): string {
  return CAPABILITIES.map((c) => `- ${c.id}: ${c.blurb}${c.pro ? ' (Pro)' : ''}`).join('\n');
}

/**
 * Whether somebody is asking what Aria can do.
 *
 * A backstop, not the mechanism. The model is told to attach the matching
 * actions when it lists what it can help with, and against the real model it
 * did so for "make it dark" and "call me Sam" and then answered this one in
 * prose with nothing to tap. A list of things you cannot start is a menu
 * printed on the wall, and this is the one question where the buttons are the
 * whole answer.
 */
export function helpAsked(message: string): boolean {
  const t = message.trim().toLowerCase();
  return (
    /\b(what|which|anything)\b[^?]*\b(can|could|do|able)\b[^?]*\b(you|aria)\b/.test(t) ||
    /\b(help|do) (me )?with\b/.test(t) ||
    /\bwhat (are|is) (your|the) (features|capabilities|options)\b/.test(t) ||
    /*
     * The bare word only, not a sentence that opens with it.
     *
     * "help" is asking what Aria can do; "help me write the intro" is asking
     * for help with a specific thing, and answering that with a menu is the
     * most irritating possible response.
     */
    /^(help|capabilities|features|options)\W*$/.test(t)
  );
}

/**
 * A handful worth offering when somebody asks what Aria can do.
 *
 * Not all twenty. A wall of buttons is the same unhelpfulness as none, and
 * these are the ones somebody asking that question is most likely to want:
 * the two things this app is for, the thing they will want next, and the way
 * into everything else.
 */
export function defaultOffer(): ActionId[] {
  return ['create.assignment', 'create.event', 'create.reminder', 'open.tasks', 'open.settings'];
}

/** Whether an id names something this app can really do. */
export function isKnownAction(id: string): boolean {
  return BY_ID.has(id as ActionId);
}
