/**
 * Turning onboarding answers into something a prompt can use.
 *
 * Kept dependency-free on purpose: the API routes import this server-side, and
 * anything reaching into the store or react-native would make it unloadable
 * there (and untestable in plain Node).
 */

/** What onboarding collected. Every field optional, every question skips. */
export interface Learner {
  /** Studying, employed, or running their own thing. */
  role?: 'student' | 'employed' | 'independent';
  /** Their subject or their field. `role` says how to read it. */
  studying?: string;
  /** How far in. Students only. */
  level?: string;
  interests?: string[];
  /**
   * How they asked to be taught.
   *
   * No longer collected, onboarding dropped the question. Kept because
   * accounts that answered it before still carry the value, and throwing away
   * a stated preference to tidy a type would be a worse trade than an unused
   * branch.
   */
  explainStyle?: 'direct' | 'examples' | 'stepwise';
}

/**
 * How many interests to name in a prompt.
 *
 * Someone can tap a dozen chips. Listing all of them buries the useful signal
 * and invites the model to shoehorn every one into a single explanation; the
 * first few are enough to reach for.
 */
const MAX_INTERESTS = 4;

const STYLE_GUIDANCE: Record<NonNullable<Learner['explainStyle']>, string> = {
  examples:
    'When something is abstract, ground it in one of their interests, a concrete analogy from something they already understand well. One analogy, carried through; not a list of them.',
  direct: 'Be direct. Give the answer first and skip the warm-up.',
  stepwise:
    'Go one step at a time, in small pieces, and make each step land before moving on.',
};

/**
 * A sentence or two about who this is, for a system prompt.
 *
 * Returns an empty string when nothing is known, so a caller can concatenate it
 * unconditionally: an empty profile has to read as Aria knowing nothing, never
 * as a half-built sentence about a person who doesn't exist.
 */
export function describeLearner(l: Learner | undefined): string {
  if (!l) return '';
  const lines: string[] = [];

  /*
   * Who they are, in the terms they gave.
   *
   * Every branch used to open "You are helping a student", because the only
   * question asked was what they were studying. A freelancer got their work
   * broken down as though it were coursework, and the vocabulary pitched at
   * someone being taught, which is the wrong register for the person who is
   * the expert in the room.
   */
  const field = l.studying?.trim();
  if (l.role === 'employed' && field) {
    lines.push(
      `You are helping someone who works in ${field}. They know their field; pitch it as a colleague would, not as a teacher.`,
    );
  } else if (l.role === 'independent' && field) {
    lines.push(
      `You are helping someone running their own thing: ${field}. Their time is the scarce resource, so be concrete about effort and trade-offs.`,
    );
  } else {
    const who = [l.level, field && `studying ${field}`].filter(Boolean).join(' ');
    if (who) {
      lines.push(
        `You are helping a student: ${who}. Pitch the depth and vocabulary at that level, not below it, and not at a specialist.`,
      );
    }
  }

  const interests = (l.interests ?? []).map((i) => i.trim()).filter(Boolean);
  if (interests.length) {
    lines.push(
      `They're into ${listPhrase(interests.slice(0, MAX_INTERESTS))}. Use these when an idea is hard to picture, never force one in where a plain explanation is already clear.`,
    );
  }

  if (l.explainStyle) lines.push(STYLE_GUIDANCE[l.explainStyle]);

  return lines.join(' ');
}

/** "basketball, music and cooking" */
function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
