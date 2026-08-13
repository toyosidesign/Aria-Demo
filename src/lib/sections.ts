/**
 * The three kinds of thing kept in `draftSections`, and how to tell them apart.
 *
 * Pure, so the check suites can hold the rule without a React Native runtime,
 * and so every screen that consumes sections agrees on what they are.
 *
 * ── Why a working draft lives here at all ───────────────────────────────────
 *
 * Somebody writes half a section, closes the app, and signs back in on another
 * day. Everything they accepted survived, because accepted work is a section
 * and sections sync. The half-written one did not: it lived in screen state and
 * died with the screen, so "Continue" produced a *different* draft and their
 * tweaks were gone. Reported as Continue restarting the task, and that is
 * exactly what it did.
 *
 * Sections are the one part of a task that already syncs, so an unfinished
 * draft is kept as a section with a reserved title rather than as a new column
 * nobody has migrated. The price is that everything reading sections has to
 * know the reserved titles, which is what this file is for: nothing that goes
 * into a document, a word count or an email may include a working draft, and
 * "the filter was copied to four screens and one of them was missed" is a bug
 * that ships silently, with a half-sentence in the middle of an essay.
 */

export interface Section {
  title: string;
  content: string;
}

/** The compiled document, written by the assemble pass. */
export const ASSEMBLED_SECTION = 'Assembled document';

/** Where Aria got to, unfinished and unaccepted. Never part of the work. */
export const WORKING_SECTION = 'Working draft';

const RESERVED = new Set<string>([ASSEMBLED_SECTION, WORKING_SECTION]);

/** True for the bookkeeping sections, which are about the work, not of it. */
export function isReserved(title: string): boolean {
  return RESERVED.has(title);
}

/**
 * The written work, and nothing else.
 *
 * Use this anywhere sections become a document, a word count, an email body or
 * an export. The two reserved titles are excluded together so a screen cannot
 * remember one and forget the other.
 */
export function writtenSections<T extends Section>(sections: T[] | undefined): T[] {
  return (sections ?? []).filter((s) => !isReserved(s.title));
}

/** The unfinished draft, if one was left behind. */
export function workingDraft<T extends Section>(sections: T[] | undefined): T | undefined {
  return (sections ?? []).find((s) => s.title === WORKING_SECTION);
}
