/**
 * What a brief actually says, and how sure Aria is about each part of it.
 *
 * An assignment is not a title and a date. It is a deliverable, a deadline, a
 * weighting, the criteria it is marked against and the format rules it has to
 * obey — and every one of those is written down in a document the student
 * already has. Typing them back into a form is transcription, which is exactly
 * the work an assistant should be doing.
 *
 * ── Why confidence travels with every field ────────────────────────────────
 *
 * Extraction is a guess. A model reading a PDF will find "2,000 words" and be
 * right, and find "week 9" and be guessing at a date. A field with no
 * confidence attached invites the student to trust both equally, and the one it
 * gets wrong is the one that costs a grade. So confidence is part of the value,
 * shown as a chip, and a low one reads as "check this" rather than as a fact.
 *
 * A missing field is not a low-confidence field. It is a gap, and gaps get
 * actions rather than chips — see `GAP_ACTIONS`.
 */

export type Confidence = 'high' | 'medium' | 'low';

/** One extracted fact, and how sure Aria is of it. */
export interface BriefField {
  value: string;
  confidence: Confidence;
}

/** One thing the work is marked on, and what it is worth. */
export interface Criterion {
  label: string;
  /** Percentage of the mark, when the brief says. Undefined when it doesn't. */
  weight?: number;
}

export interface BriefCriteria {
  items: Criterion[];
  confidence: Confidence;
}

export interface BriefFacts {
  /** What has to be handed in: "2,000-word essay", "10-slide deck". */
  deliverable?: BriefField;
  /** The deadline. `value` is yyyy-MM-dd when it could be resolved to one. */
  deadline?: BriefField;
  /** What it is worth: "40% of the module". */
  weighting?: BriefField;
  criteria?: BriefCriteria;
  /** Referencing style, file type, font — the rules that lose marks quietly. */
  format?: BriefField;
}

export type BriefSlot = 'deliverable' | 'deadline' | 'weighting' | 'criteria' | 'format';

/** The five, in the order the card shows them. Deliverable and deadline first
 *  because they are the two that decide whether a plan can be built at all. */
export const BRIEF_SLOTS: { slot: BriefSlot; label: string }[] = [
  { slot: 'deliverable', label: 'Deliverable' },
  { slot: 'deadline', label: 'Deadline' },
  { slot: 'weighting', label: 'Weighting' },
  { slot: 'criteria', label: 'Marked on' },
  { slot: 'format', label: 'Format rules' },
];

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Clear in the brief',
  medium: 'Probably',
  low: 'Worth checking',
};

/**
 * What to do about a fact the brief does not contain.
 *
 * Three buttons rather than a text box, because a gap is not usually something
 * the student knows and hasn't typed — it is something nobody has told them.
 * "Ask tutor" writes the question, "Upload handbook" looks somewhere else it
 * might be written down, and "I know this" is for the case where they do.
 */
export type GapAction = 'ask-tutor' | 'upload-handbook' | 'i-know-this';

export const GAP_ACTIONS: { action: GapAction; label: string }[] = [
  { action: 'ask-tutor', label: 'Ask tutor' },
  { action: 'upload-handbook', label: 'Upload handbook' },
  { action: 'i-know-this', label: 'I know this' },
];

/** Is there a value for this slot at all? */
export function hasSlot(facts: BriefFacts | undefined, slot: BriefSlot): boolean {
  if (!facts) return false;
  if (slot === 'criteria') return (facts.criteria?.items.length ?? 0) > 0;
  return Boolean(facts[slot]?.value?.trim());
}

/** The slots the brief did not answer, in card order. */
export function briefGaps(facts: BriefFacts | undefined): BriefSlot[] {
  return BRIEF_SLOTS.filter((s) => !hasSlot(facts, s.slot)).map((s) => s.slot);
}

/** How a slot reads back in a sentence — used by the tutor question. */
const SLOT_QUESTION: Record<BriefSlot, string> = {
  deliverable: 'what exactly we need to hand in',
  deadline: 'when it is due',
  weighting: 'how much it counts towards the module',
  criteria: 'what it is marked on',
  format: 'the formatting and referencing rules',
};

/**
 * The message that goes to the tutor, written so it can be sent as it stands.
 *
 * One question, named politely, with the assignment it refers to — the thing a
 * student stalls on is not the asking, it is the wording. Several gaps become
 * one message rather than several, because three emails about one brief is
 * worse for the tutor and less likely to be sent.
 */
export function tutorQuestion(slots: BriefSlot[], title: string): string {
  const asks = slots.map((s) => SLOT_QUESTION[s]);
  const list =
    asks.length === 1
      ? asks[0]
      : `${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}`;
  return [
    `Hello,`,
    ``,
    `I'm working on ${title.trim() || 'the assignment'} and I couldn't find ${list} in the brief. Could you confirm?`,
    ``,
    `Thank you.`,
  ].join('\n');
}

/**
 * Priority from what the work is worth, rather than from a question.
 *
 * The flow does not ask an assignment how much it matters — the brief already
 * said, in the one number the student cares about. A dissertation at 60% is not
 * the same job as a 5% problem sheet, and asking would be asking them to repeat
 * something they just uploaded.
 */
export function priorityFromWeighting(facts: BriefFacts | undefined): 'low' | 'medium' | 'high' {
  const pct = Number(facts?.weighting?.value?.match(/(\d{1,3})\s*%/)?.[1]);
  if (!Number.isFinite(pct)) return 'medium';
  if (pct >= 30) return 'high';
  if (pct <= 10) return 'low';
  return 'medium';
}

/** A short readable summary of the brief, for the copy kept on the task. */
export function briefSummary(facts: BriefFacts | undefined): string {
  if (!facts) return '';
  const lines: string[] = [];
  for (const { slot, label } of BRIEF_SLOTS) {
    if (!hasSlot(facts, slot)) continue;
    if (slot === 'criteria') {
      const items = facts.criteria!.items
        .map((c) => (c.weight ? `${c.label} (${c.weight}%)` : c.label))
        .join(', ');
      lines.push(`${label}: ${items}`);
      continue;
    }
    lines.push(`${label}: ${facts[slot]!.value}`);
  }
  return lines.join('\n');
}

// ── The shapes the client and the route agree on ─────────────────────────────

export interface BriefRequest {
  /** The brief as text, when it was pasted or typed. */
  text?: string;
  /** The brief as a file, when it was uploaded. Base64, no data: prefix. */
  file?: { data: string; mediaType: string; name?: string };
  /** Today, so "week 9" and "next Friday" can become a date. */
  today: string;
  /** Anything already known, so a handbook can fill gaps without overwriting. */
  known?: BriefFacts;
}

export interface BriefResponse {
  facts: BriefFacts;
  /** Aria's own title for the work, when the brief named one. */
  title?: string;
  /** True when this came from the local reader rather than the model. */
  fallback?: boolean;
}

/**
 * What can be read out of a brief without a model.
 *
 * Only from text — an uploaded PDF is bytes to this reader, so an upload with
 * no key reaches the card with everything as a gap. That is the correct
 * outcome: five "Ask tutor" buttons is a usable screen, and five invented
 * facts is not.
 */
export function localBrief(req: BriefRequest): BriefFacts {
  const text = req.text?.trim();
  if (!text) return req.known ?? {};
  const facts: BriefFacts = { ...req.known };

  const words = text.match(/([\d,]{3,6})\s*words?/i)?.[1];
  if (words && !facts.deliverable) {
    facts.deliverable = { value: `${words} words`, confidence: 'low' };
  }

  // ISO first because it needs no interpretation; then the two written forms
  // people actually use. Anything vaguer ("week 9") is left as a gap on
  // purpose — a guessed deadline is the one mistake this cannot make.
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const written = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  );
  if (!facts.deadline && (iso || written)) {
    facts.deadline = {
      value: iso ?? `${written![1]} ${written![2]} ${written![3]}`,
      confidence: 'low',
    };
  }

  const pct = text.match(/(\d{1,3})\s*%/)?.[1];
  if (pct && !facts.weighting) {
    facts.weighting = { value: `${pct}% of the module`, confidence: 'low' };
  }

  const style = text.match(/\b(Harvard|APA|MLA|Chicago|Vancouver|IEEE|OSCOLA)\b/i)?.[1];
  if (style && !facts.format) {
    facts.format = { value: `${style} referencing`, confidence: 'low' };
  }

  return facts;
}
