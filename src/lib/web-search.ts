import Anthropic from '@anthropic-ai/sdk';

import { dedupeSources, type Source } from '@/lib/source';

/**
 * Letting Aria read the web, on the server, with the sources kept.
 *
 * Until now every answer came out of the model's memory, which has a cutoff and
 * no idea it has one. That is the worst shape for a study assistant: it is most
 * confident exactly where it is most likely to be stale, and a student cannot
 * tell the difference. Search fixes the staleness; carrying the sources back is
 * what makes the fix checkable.
 *
 * ── Server side, and why that is the whole point ────────────────────────────
 *
 * The search runs on Anthropic's infrastructure, not on the phone and not on
 * this server: the tool is declared and the results arrive in the same
 * response. So there is no crawler to run, no keys to hold, no new host for the
 * app to talk to, and the rate limiting and authentication already wrapped
 * around these routes cover it unchanged.
 *
 * ── Why it is not simply on for everything ──────────────────────────────────
 *
 * A search costs money and seconds, and most of what Aria is asked does not
 * need one: a birthday card does not improve with citations. So the caller
 * decides, and for the chat the model itself decides, see `lookUp` in
 * api/assistant+api.ts.
 */

/**
 * The tool, deliberately the older version, with a ceiling on searches.
 *
 * ── Why not the newer variant ───────────────────────────────────────────────
 *
 * `web_search_20260209` filters results through code execution before they
 * reach the model, which is cheaper and usually sharper. It also returns **no
 * citations**: both variants were run against the same questions here, and the
 * newer one produced a good answer with zero citation blocks while this one
 * produced three, each carrying the sentence it was drawn from.
 *
 * For a student that difference is the entire feature. An answer they cannot
 * trace is one they cannot use in anything that gets marked, so the older
 * variant wins on the only axis that matters here. Revisit if citations arrive
 * on the newer one, and check them before switching, because losing them is
 * silent: the answers keep looking exactly as good.
 *
 * Three searches is enough to check a claim in more than one place and far
 * short of the runaway case, where a hard question keeps searching and somebody
 * watching a spinner cannot tell thinking from lost.
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
} as const;

export interface Grounded {
  text: string;
  sources: Source[];
  /** False when the model answered from memory without running a search. */
  searched: boolean;
  /**
   * Whether those pages were cited by the answer or merely read.
   *
   * Not a detail. "Sources" claims the answer rests on these pages; a model
   * that searched and cited nothing has given us the pages it looked at, which
   * is a weaker and different claim. Calling the second one sources would be a
   * small lie told under every researched answer, so the screen says which it
   * has and the wording changes with it.
   */
  cited: boolean;
}

/**
 * A long answer is allowed to pause; three resumes is the ceiling.
 *
 * The API stops a turn with `pause_turn` when its own tool loop runs long, and
 * the turn continues only if the conversation is sent back. Without this the
 * answer arrives cut off mid-sentence and looks like a bug in this app.
 */
const MAX_RESUMES = 3;

const MODEL = 'claude-opus-4-8';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every text block, in order, across the original turn and any resumes. */
function textOf(blocks: any[]): string {
  return blocks
    .filter((b) => b?.type === 'text')
    .map((b) => b.text as string)
    .join('')
    .trim();
}

/**
 * The pages behind the answer, taken from citations first.
 *
 * Citations are attached to the sentences that actually used a page, so they
 * are the honest list. The search results themselves are the fallback: when a
 * model searched and then wrote without citing, showing what it read is still
 * better than showing nothing, and the alternative is a claim with no provenance
 * at all.
 */
function sourcesOf(blocks: any[]): { sources: Source[]; cited: boolean } {
  const cited: Source[] = [];
  const returned: Source[] = [];

  for (const block of blocks) {
    if (block?.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url) cited.push({ title: c.title ?? '', url: c.url });
      }
    }

    if (block?.type === 'web_search_tool_result') {
      /*
       * A failed search is an object here, not a list.
       *
       * The API answers 200 with an error code inside the result block rather
       * than throwing, so code that assumes a list gets `undefined.length` and
       * the whole answer is lost to a crash over a search that merely did not
       * run. The answer itself is usually still fine, so it carries on.
       */
      const content = block.content;
      if (!Array.isArray(content)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[aria] web search failed: ${content?.error_code ?? 'unknown'}`);
        }
        continue;
      }
      for (const r of content) {
        if (r?.url) returned.push({ title: r.title ?? '', url: r.url });
      }
    }
  }

  return cited.length
    ? { sources: dedupeSources(cited), cited: true }
    : { sources: dedupeSources(returned), cited: false };
}

/** Whether a search actually ran, as opposed to being merely offered. */
function didSearch(blocks: any[]): boolean {
  return blocks.some(
    (b) =>
      b?.type === 'web_search_tool_result' ||
      (b?.type === 'server_tool_use' && b.name === 'web_search'),
  );
}

/**
 * Ask, with the web available, and return the answer plus where it came from.
 *
 * Returns null rather than throwing so every caller keeps the shape it already
 * has: a search that fails should cost the citations, never the answer. The
 * callers all fall back to their existing un-searched path.
 */
export async function askWithSearch(
  client: Anthropic,
  opts: { system: string; prompt: string; maxTokens?: number },
): Promise<Grounded | null> {
  const messages: any[] = [{ role: 'user', content: opts.prompt }];
  const blocks: any[] = [];

  try {
    for (let resume = 0; resume <= MAX_RESUMES; resume++) {
      const msg = (await client.messages.create({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: opts.system,
        tools: [WEB_SEARCH_TOOL],
        messages,
      } as any)) as Anthropic.Message;

      if (msg.stop_reason === 'refusal') return null;
      blocks.push(...(msg.content as any[]));

      if (msg.stop_reason !== 'pause_turn') break;
      // Resuming is the same conversation with the paused turn appended. No
      // "carry on" message: the API sees the trailing tool use and continues.
      messages.push({ role: 'assistant', content: msg.content });
    }
  } catch (err) {
    console.error('[aria] web search call failed:', err);
    return null;
  }

  const text = textOf(blocks);
  if (!text) return null;
  const { sources, cited } = sourcesOf(blocks);
  return { text, sources, cited, searched: didSearch(blocks) };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
