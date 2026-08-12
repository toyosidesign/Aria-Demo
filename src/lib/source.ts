/**
 * Where an answer came from.
 *
 * Pure, and with no import that reaches React Native or the Anthropic SDK, so
 * the phone, the API routes, and the check suites can all hold the same shape.
 * See the note at the top of `lib/offline-answer.ts` for why that matters.
 *
 * ── Why sources are a first-class thing here ────────────────────────────────
 *
 * Once Aria can read the web, a plausible sentence and a true one look exactly
 * alike on a phone screen. A student who hands in a claim Aria half-remembered
 * loses marks; one who can tap through to where it came from does not. So a
 * searched answer travels with its sources or it does not travel.
 */

export interface Source {
  /** The page's own title, as the search returned it. */
  title: string;
  url: string;
}

/**
 * The readable part of a URL, for the line under a source.
 *
 * A student deciding whether to trust a claim looks at who published it, and
 * "bbc.co.uk" answers that in a glance where the full URL does not. Falls back
 * to the raw string rather than throwing: a source with an odd URL is still a
 * source, and losing it would be worse than showing it plainly.
 */
export function hostOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : url.trim();
}

/**
 * One entry per page, in the order they were first cited, capped.
 *
 * The same page is commonly cited three or four times in one answer, and a
 * list that repeats it reads as four separate corroborating sources, which is
 * the opposite of the truth. The cap is there because a wall of links under a
 * two-sentence answer is not evidence, it is noise.
 */
export function dedupeSources(sources: Source[], max = 4): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const url = s.url?.trim();
    if (!url) continue;
    // Keyed on the URL rather than the title: the same page reached twice can
    // carry two titles, and the same title can sit on two different pages.
    const key = url.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: s.title?.trim() || hostOf(url), url });
    if (out.length >= max) break;
  }
  return out;
}
