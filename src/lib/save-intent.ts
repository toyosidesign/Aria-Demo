/**
 * Reading "save this" out of ordinary conversation.
 *
 * The guided flow ends with buttons, which is fine when you are already in it.
 * Asked for in a sentence — "save this task", "email that to me" — there is
 * nothing to tap, and Aria used to answer as though it were a general question.
 *
 * Deliberately a small, local matcher rather than another round trip to the
 * model. Two reasons: it has to work when the API is unreachable, which is the
 * exact moment the fallback would otherwise swallow the request; and "save
 * this" needs to feel instant, not like waiting for a reply.
 *
 * Kept pure and free of React so `npm run check:flow` can assert the phrasings
 * that matter without a device.
 */

export type SaveTarget = 'note' | 'doc' | 'email';

/**
 * Does this sentence ask for the work to be kept?
 *
 * Requires both a verb and something to act on, so "I saved the file already"
 * and "email from my tutor" don't trigger it. False negatives are cheap here —
 * the buttons are still on screen — and a false positive derails a
 * conversation, so the bar is deliberately on the high side.
 */
export function wantsSave(text: string): boolean {
  const t = text.toLowerCase();
  const verb = /\b(save|export|send|share|keep|email|mail)\b/.test(t);
  if (!verb) return false;
  const object = /\b(this|that|it|these|task|tasks|list|plan|notes?|doc|document|answers?|work)\b/.test(t);
  if (!object) return false;
  // "I already saved it", "don't send that" — a request, not a report.
  if (/\b(already|don'?t|do not|didn'?t|no need|stop)\b/.test(t)) return false;
  return true;
}

/**
 * Which destination a sentence names, if any.
 *
 * Returns null when the request is just "save this", which is the cue to ask
 * rather than to guess. Checked before `wantsSave` matters, so a bare "email"
 * answers a question Aria has already asked.
 */
export function saveTarget(text: string): SaveTarget | null {
  const t = text.toLowerCase();
  // Email first: "email it to me as a doc" is still an email.
  if (/\b(email|mail|send it to me|send to my inbox)\b/.test(t)) return 'email';
  if (/\b(doc|document|file|pdf|word|google doc|share sheet|share)\b/.test(t)) return 'doc';
  if (/\b(notes?|notepad|keep it here|on the task)\b/.test(t)) return 'note';
  return null;
}

/** What Aria asks when the destination wasn't named. */
export const SAVE_QUESTION =
  'Sure. Where do you want it: a note on the task, a document you can share, or an email?';

/** What Aria says once it has done it. */
export function saveConfirmation(target: SaveTarget, title: string): string {
  switch (target) {
    case 'note':
      return `Saved to "${title}" as a note. You'll find it on the task.`;
    case 'doc':
      return `Here it is as a document, pick where it should go.`;
    case 'email':
      return `I've opened an email with it ready to send.`;
  }
}
