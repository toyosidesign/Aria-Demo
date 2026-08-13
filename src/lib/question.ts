/**
 * Telling a question apart from an instruction, in a chat about a draft.
 *
 * Pure, so `check:flow` can hold the rule. See lib/offline-answer.ts for why
 * that matters.
 *
 * ── The failure this fixes ──────────────────────────────────────────────────
 *
 * Everything typed under a draft was treated as "change it". So "why did you
 * put the Berlin example second?" produced another draft, and "what does
 * 'equal consideration' mean?" produced another draft. Aria looked like it was
 * repeating itself, when really it was answering a question nobody had asked
 * and ignoring the one that was.
 *
 * ── Why politeness is the hard part ─────────────────────────────────────────
 *
 * "Can you make it shorter?" is question-shaped and is plainly an instruction.
 * People ask for changes politely, in question form, constantly. So the verb
 * decides first and the shape only decides when there is no verb: anything
 * asking for the draft to be different is an instruction however it is phrased,
 * and what is left, the who/why/what/how of the work itself, is a question.
 */

/** Asking for the draft to change. Checked first, whatever the phrasing. */
const CHANGE = [
  'rewrite',
  'redo',
  'shorten',
  'lengthen',
  'expand',
  'condense',
  'trim',
  'cut',
  'add',
  'remove',
  'delete',
  'replace',
  'change',
  'edit',
  'fix',
  'tweak',
  'simplify',
  'reword',
  'rephrase',
  'translate',
  'turn it',
  'turn this',
  'make it',
  'make this',
  'take out',
  'put in',
  'more formal',
  'less formal',
  'more casual',
];

/** Asking about it. Only consulted once the sentence is not asking for a change. */
const ASKING =
  /^(what|why|how|when|where|who|whose|which|is|are|was|were|do|does|did|can|could|should|would|will|explain|tell me|any\b)/;

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  /*
   * A change asked for politely is still a change.
   *
   * "Can you make it shorter?" ends in a question mark and starts with a
   * question word, and answering it with a paragraph about brevity instead of a
   * shorter draft would be the same bug pointing the other way.
   */
  if (CHANGE.some((verb) => t.includes(verb))) return false;

  return t.endsWith('?') || ASKING.test(t);
}
