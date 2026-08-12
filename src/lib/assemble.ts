/**
 * Compiling the finished document, a day before it is due.
 *
 * The moment the whole product is for. It is the night before a deadline, and
 * the thing somebody has been dreading is already written out, named the way a
 * marker expects, with a cover sheet on the front.
 *
 * ── Nothing here is written by a model ──────────────────────────────────────
 *
 * Every word this produces was already on the task: the sections Aria drafted
 * as the work went along, the notes from the guide, the brief it read at the
 * start. Assembly is arrangement, not authorship. That matters for two reasons.
 * It is instant and free, so it can run for every piece of work without anybody
 * paying for it twice. And a student can point at any paragraph and say when it
 * was written, which they cannot do about something that appeared overnight.
 *
 * ── What it refuses to do ───────────────────────────────────────────────────
 *
 * It never invents a section to fill a gap, and it never claims a word count it
 * has not got. An assembled document that quietly pads itself to look finished
 * is worse than a short one, because the short one is obvious at a glance and
 * the padded one is discovered by a marker.
 *
 * Pure, so `check:review` can walk every shape of it.
 */

import { formatFull } from '@/lib/dates';
import type { BriefFacts } from '@/lib/brief';

export interface AssembleInput {
  title: string;
  /** Who is handing it in, for the cover sheet. */
  author?: string;
  /** Their course or field, when onboarding collected one. */
  context?: string;
  deadline: string;
  /** What Aria read out of the brief at the start. */
  facts?: BriefFacts;
  /** Everything written along the way, in the order it was written. */
  sections: { title: string; content: string }[];
  /** The plan, so the cover sheet can say what is finished and what is not. */
  steps?: { title: string; done: boolean }[];
}

export interface Assembled {
  /** The file name, as a marker would expect to receive it. */
  filename: string;
  /** The whole document, cover sheet included. */
  body: string;
  /** How many words of actual work, excluding the cover sheet. */
  words: number;
  /** The target from the brief, when it stated one. */
  targetWords?: number;
  /**
   * What a person should look at before this goes anywhere.
   *
   * Never a blocker. The document assembles whatever state the work is in,
   * because a student at 11pm needs what exists rather than a refusal, and the
   * warnings are what turn "here is your document" into something checkable.
   */
  warnings: string[];
}

/** Sections that are working notes rather than the document itself. */
const NOT_THE_WORK = ['the brief', 'how i', 'the direction i', 'worked out with aria'];

function isWorkSection(title: string): boolean {
  const t = title.trim().toLowerCase();
  return !NOT_THE_WORK.some((prefix) => t.startsWith(prefix));
}

export function countWords(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

/**
 * The word count the brief asked for, when it gave one.
 *
 * Read from the deliverable, which is where it is always stated: "2,000-word
 * essay", "1500 words". Commas are stripped first, because "2,000" is one
 * number and every naive parser reads it as two.
 */
export function targetWordCount(facts: BriefFacts | undefined): number | undefined {
  const text = facts?.deliverable?.value;
  if (!text) return undefined;
  const match = text.replace(/,/g, '').match(/(\d{2,6})\s*(?:-|\s)?\s*word/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * A file name a marker will recognise a week later.
 *
 * Author first, because a folder of forty files called "Essay.pdf" is the
 * problem this is solving. Punctuation is stripped rather than escaped: a
 * stray slash or colon in a title is a path separator on at least one of the
 * two platforms somebody will open this on.
 */
export function assembledFilename(title: string, author?: string, ext = 'txt'): string {
  const clean = (s: string) =>
    s
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const parts = [clean(author ?? ''), clean(title) || 'Assignment'].filter(Boolean);
  return `${parts.join(' - ').slice(0, 80)}.${ext}`;
}

/** The cover sheet: who, what, for when, and what it is marked on. */
function coverSheet(input: AssembleInput, words: number, target?: number): string {
  const lines = [input.title];
  if (input.author) lines.push(input.author);
  if (input.context) lines.push(input.context);
  lines.push(`Due ${formatFull(input.deadline)}`);
  if (input.facts?.weighting?.value) lines.push(`Worth ${input.facts.weighting.value}`);
  lines.push(target ? `${words} words of ${target}` : `${words} words`);

  const criteria = input.facts?.criteria?.items ?? [];
  if (criteria.length) {
    lines.push(
      `Marked on: ${criteria
        .map((c) => (c.weight ? `${c.label} (${c.weight}%)` : c.label))
        .join(' · ')}`,
    );
  }
  if (input.facts?.format?.value) lines.push(`Format: ${input.facts.format.value}`);
  return lines.join('\n');
}

/**
 * Put the document together.
 *
 * The order is the order the work was done in, which is also the order the
 * plan put it in, so the argument arrives before the conclusion without
 * anything here having to understand either.
 */
export function assemble(input: AssembleInput): Assembled {
  const work = input.sections.filter((s) => isWorkSection(s.title) && s.content.trim());
  const body = work.map((s) => `${s.title}\n\n${s.content.trim()}`).join('\n\n\n');
  const words = countWords(body);
  const target = targetWordCount(input.facts);

  const warnings: string[] = [];
  if (!work.length) {
    warnings.push('There is nothing written yet, so this is a cover sheet and no more.');
  }
  if (target && words < target * 0.8) {
    // Stated as the gap rather than as a percentage: "480 words short" is a
    // number somebody can act on tonight.
    warnings.push(`${target - words} words short of the ${target} the brief asks for.`);
  }
  const undone = (input.steps ?? []).filter((s) => !s.done);
  if (undone.length) {
    warnings.push(
      undone.length === 1
        ? `One step is still open: ${undone[0].title}.`
        : `${undone.length} steps are still open, starting with ${undone[0].title}.`,
    );
  }
  if (!input.facts?.format?.value) {
    warnings.push('No format rules were in the brief, so check referencing and file type yourself.');
  }

  const cover = coverSheet(input, words, target);
  return {
    filename: assembledFilename(input.title, input.author),
    body: body ? `${cover}\n\n\n${body}\n` : `${cover}\n`,
    words,
    targetWords: target,
    warnings,
  };
}

/**
 * Read the brief back off the task.
 *
 * The facts are written onto the task at setup as the readable summary
 * `briefSummary` produces, one "Label: value" per line, rather than as
 * structured data: there is no column for them, and inventing one would be a
 * migration against a live database for a handful of strings.
 *
 * So assembly parses that same summary back. It is a small amount of
 * indignity for a large saving, and it is safe in the one way that matters:
 * anything it fails to recognise comes back undefined, which the cover sheet
 * simply omits. Nothing here can produce a wrong deadline or an invented
 * weighting, only a missing one.
 */
export function factsFromSections(
  sections: { title: string; content: string }[] | undefined,
): BriefFacts | undefined {
  const brief = (sections ?? []).find((s) => s.title.trim().toLowerCase() === 'the brief');
  if (!brief) return undefined;

  const facts: BriefFacts = {};
  for (const line of brief.content.split('\n')) {
    const [rawLabel, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!value) continue;
    switch (rawLabel.trim().toLowerCase()) {
      case 'deliverable':
        facts.deliverable = { value, confidence: 'medium' };
        break;
      case 'deadline':
        facts.deadline = { value, confidence: 'medium' };
        break;
      case 'weighting':
        facts.weighting = { value, confidence: 'medium' };
        break;
      case 'format rules':
      case 'format':
        facts.format = { value, confidence: 'medium' };
        break;
      case 'marked on':
      case 'criteria':
        facts.criteria = {
          items: value.split(',').map((part) => {
            const m = part.trim().match(/^(.*?)\s*\((\d{1,3})%\)$/);
            return m ? { label: m[1], weight: Number(m[2]) } : { label: part.trim() };
          }),
          confidence: 'medium',
        };
        break;
    }
  }
  return Object.keys(facts).length ? facts : undefined;
}

/**
 * How long before the deadline the document is put together.
 *
 * A day, which is the point of it: enough time to read what Aria assembled,
 * fix what is wrong and still submit without a panic. Assembling on the
 * morning it is due would be technically the same document and no use to
 * anybody.
 */
export const ASSEMBLE_LEAD_DAYS = 1;

/** Is this the day to assemble? True from the lead time until the deadline. */
export function readyToAssemble(deadline: string, today: string): boolean {
  if (today > deadline) return false;
  const due = new Date(`${deadline}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  return days <= ASSEMBLE_LEAD_DAYS;
}

/** What Aria says when it hands the document over. */
export function assembleReport(a: Assembled): string {
  const size = a.targetWords ? `${a.words} of ${a.targetWords} words` : `${a.words} words`;
  return a.warnings.length
    ? `Your document is ready, ${size}. ${a.warnings.length} thing${a.warnings.length === 1 ? '' : 's'} to look at.`
    : `Your document is ready, ${size}. Nothing looks missing.`;
}
