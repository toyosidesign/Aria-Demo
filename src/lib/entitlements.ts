/**
 * What Free is, what Pro is, and why the line falls where it does.
 *
 * ── The line ────────────────────────────────────────────────────────────────
 *
 * Free plans your work. Pro does it.
 *
 * Not "Free is crippled": a planner that captures anything you say, breaks it
 * down when you ask, drafts what you need and reminds you at the right moment
 * is a complete product, and most people never need more. Pro is for the person
 * who wants to stop being the one who presses the buttons.
 *
 * ── Why the line is drawn around work rather than around sending ────────────
 *
 * The obvious paid feature is "Aria sends it for you", and for one channel that
 * is exactly what happens: email leaves a server with nobody watching. For every
 * other channel it is impossible, and not for want of trying. No mobile OS lets
 * an app send a text or a WhatsApp as the user, so a tier sold on sending would
 * be sold on something that cannot be delivered, and the failure would be
 * discovered by the person who never got the message.
 *
 * What *is* unlimited is work. Reading a brief, breaking an assignment into
 * steps, researching each one, writing the draft, rebuilding a plan that has
 * fallen behind, assembling the finished document: none of that is blocked by a
 * platform, all of it takes real time, and all of it costs real money in model
 * tokens. So that is what Pro buys, and the promise is one sentence: it is done
 * before you get there.
 *
 * Pure and dependency-free: the routes read it server-side, the screens read it
 * client-side, and `check:review` holds it.
 */

export type Tier = 'free' | 'pro';

/**
 * The things an account can be entitled to.
 *
 * Deliberately capabilities rather than features: each one is a question some
 * piece of code has to ask before it acts, and every one of them is enforced
 * somewhere. Nothing is listed here that the app does not actually gate.
 */
export type Capability =
  /** The morning prompt, and the day approved in one go. */
  | 'dailyReview'
  /** Drafts, breakdowns and research prepared before you open the task. */
  | 'workAhead'
  /** A plan that re-dates itself when you fall behind, instead of going stale. */
  | 'planUpkeep'
  /** Email sent at the scheduled moment with nobody watching. */
  | 'autonomousEmail'
  /** The finished document compiled ahead of the deadline. */
  | 'assemble';

const PRO_ONLY: Capability[] = [
  'dailyReview',
  'workAhead',
  'planUpkeep',
  'autonomousEmail',
  'assemble',
];

/**
 * Can this account do this?
 *
 * One function, asked everywhere, so the tier line lives in a single place
 * rather than as `if (pro)` scattered through screens that each decide slightly
 * differently what Pro meant.
 */
export function can(tier: Tier, capability: Capability): boolean {
  if (tier === 'pro') return true;
  return !PRO_ONLY.includes(capability);
}

export function tierOf(pro: boolean): Tier {
  return pro ? 'pro' : 'free';
}

/**
 * What each tier is, in the words the app uses to sell it.
 *
 * Kept beside the capabilities on purpose. Copy that lives somewhere else drifts
 * from what the code does, which is how the old pitch came to promise scheduled
 * *messages* when only email can be scheduled.
 */
export interface TierCopy {
  label: string;
  /** The one-line difference. */
  line: string;
  /** What it does, in the order that matters to somebody deciding. */
  points: string[];
  /** The thing it deliberately does not do, said plainly. */
  limit: string;
}

export const TIERS: Record<Tier, TierCopy> = {
  free: {
    label: 'Free',
    line: 'I plan your work. You do it.',
    points: [
      'Say it in a sentence and I set it up: date, time, who it is for, how it should go out',
      'Assignments read from the brief, planned backwards from the deadline',
      'Drafts, breakdowns and research whenever you ask for them',
      'Reminders at the right moment, with the work ready to hand',
    ],
    limit: 'You press the buttons, and nothing happens while the app is closed.',
  },
  pro: {
    label: 'Pro',
    line: 'I do the work. You check it.',
    points: [
      'Your drafts, breakdowns and research done before you open the task',
      'Plans that re-date themselves when you fall behind, instead of going stale',
      'One review each morning: approve the day and I get on with it',
      'Emails sent at the moment you agreed, with a report back',
      'The finished document assembled a day before the deadline, ready to check',
    ],
    /*
     * The limit is stated in the pitch, not buried in a footnote.
     *
     * It is the one thing somebody could otherwise buy Pro believing, and the
     * disappointment would arrive as a message their friend never received.
     */
    limit: 'Texts and WhatsApp still need your tap. No app is allowed to send those for you.',
  },
};

/** The sentence the tiers are chosen between. */
export const TIER_QUESTION = 'How much of it should I do?';
