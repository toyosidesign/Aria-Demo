/**
 * The two network calls behind an assignment and a project.
 *
 * ── Why they are not in `brief.ts` and `guide.ts` ───────────────────────────
 *
 * Those two modules are pure, and have to stay that way. `lib/task-flow.ts`
 * imports both — for the slot list, the gap rules, the narrowing question — and
 * `npm run check:flow` imports *that* without a React Native runtime. One
 * `import { postJson } from '@/lib/api-client'` in either of them pulls in
 * expo-constants, which pulls in `expo-modules-core`, and the whole suite stops
 * running with an error about stripping types in node_modules.
 *
 * That is exactly how it broke the first time. So the rules, the shapes and the
 * offline fallbacks live in the pure modules where they can be tested, and the
 * network lives here, where only screens import it.
 */

import { postJson } from '@/lib/api-client';
import { localBrief, type BriefRequest, type BriefResponse } from '@/lib/brief';
import { localGuide, needsMore, type GuideRequest, type GuideResult } from '@/lib/guide';

/**
 * Read a brief. Never throws: a failed read degrades to the local reader.
 *
 * The local one is deliberately literal — it finds dates, percentages and word
 * counts and claims low confidence for all of them. That is a worse extraction
 * and an honest one, which matters here more than usual: this screen exists to
 * be trusted with the deadline.
 */
export async function requestBrief(req: BriefRequest): Promise<BriefResponse> {
  try {
    const res = await postJson('/api/brief', req);
    if (!res.ok) throw new Error(`brief failed: ${res.status}`);
    const data = (await res.json()) as BriefResponse;
    if (!data?.facts) throw new Error('empty extraction');
    return data;
  } catch {
    return { facts: localBrief(req), fallback: true };
  }
}

/** Ask for directions. Never throws; a failure degrades to the local guide. */
export async function requestGuide(req: GuideRequest): Promise<GuideResult> {
  /*
   * The refusal happens before the call, as well as at the route.
   *
   * With only a title there is nothing specific to generate from, and four
   * generic directions are worse than an admission — so the device does not
   * spend the request at all, and says which single thing would change that.
   */
  const missing = needsMore(req);
  if (missing) return { kind: 'needs', ask: missing };
  try {
    const res = await postJson('/api/guide', req);
    if (!res.ok) throw new Error(`guide failed: ${res.status}`);
    const data = (await res.json()) as GuideResult;
    if (data.kind === 'needs' && data.ask) return data;
    if (data.kind === 'directions' && data.directions?.length) return data;
    throw new Error('empty guide');
  } catch {
    return { kind: 'directions', directions: localGuide(req), fallback: true };
  }
}
