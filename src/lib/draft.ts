import { Share } from 'react-native';

import type { Task } from '@/store/aria-store';

/** Assemble all of Aria's drafted sections into one clean, copyable document. */
export function compileDraftText(task: Task): string {
  const sections = task.draftSections ?? [];
  if (!sections.length) return '';
  const body = sections.map((d) => `${d.title}\n${d.content}`).join('\n\n');
  return `${task.title}\n\n${body}`.trim();
}

/**
 * Open the OS share sheet with the compiled draft so Maya can save it to the
 * Notes app (or anywhere). Returns true if she completed the share.
 */
export async function saveDraftToNotes(task: Task): Promise<boolean> {
  const text = compileDraftText(task);
  if (!text) return false;
  try {
    const res = await Share.share({ message: text, title: task.title });
    return res.action === Share.sharedAction;
  } catch {
    return false;
  }
}
