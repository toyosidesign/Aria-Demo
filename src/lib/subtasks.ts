import { postJson } from '@/lib/api-client';
import type { Learner } from '@/lib/learner';

export interface ChecklistRequest {
  title: string;
  description?: string;
  /** Who it's for — see lib/learner.ts. Omitted when onboarding was skipped. */
  learner?: Learner;
}

/** Ask the server to break an assignment into a topic checklist; fall back locally. */
export async function requestChecklist(req: ChecklistRequest): Promise<string[]> {
  try {
    const res = await postJson('/api/subtasks', req);
    if (!res.ok) throw new Error(`checklist failed: ${res.status}`);
    const data = (await res.json()) as { items?: string[] };
    const items = (data.items ?? []).map((s) => s.trim()).filter(Boolean);
    if (!items.length) throw new Error('empty checklist');
    return items.slice(0, 10);
  } catch {
    return localChecklist(req);
  }
}

/** Offline/no-key fallback — a solid generic essay/assignment checklist. */
export function localChecklist(req: ChecklistRequest): string[] {
  return [
    'Research the topic and gather sources',
    'Define your thesis / main argument',
    'Outline the structure',
    'Write the introduction',
    'Develop the main points with evidence',
    'Address a counterpoint',
    'Write the conclusion',
    'Proofread and add citations',
  ];
}
