/**
 * Which part of the thread Aria is actually talking about.
 *
 * One conversation holds every task ever set up, and all of it was being sent
 * to the model as a single exchange. Ask about the assignment you just added
 * and Aria had the birthday, the reminder before it, and the dividers between
 * them in context as though they were the same subject. It answered about the
 * wrong one, mixed details across them, and there was nothing on screen to
 * explain why — the transcript looked correctly separated, because the
 * dividers are drawn.
 *
 * So the split that exists visually is made real: the model gets the current
 * task's stretch of conversation and nothing before it.
 *
 * Generic over the message shape, and free of React and the store, so
 * `npm run check:flow` can assert it without a runtime.
 */

/** Everything since the last divider, which is the task in hand. */
export function currentTaskMessages<T extends { divider?: string }>(messages: T[]): T[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].divider) {
      start = i + 1; // the divider itself is punctuation, not a turn
      break;
    }
  }
  return messages.slice(start);
}

/**
 * The turns worth sending: the current task, minus the dividers themselves.
 *
 * A divider's text is a bare category word ("Birthday"), which as an assistant
 * turn reads as Aria having said something odd and unprompted. They are filtered
 * even inside the current stretch, where one can still appear if the thread was
 * cleared and restarted.
 *
 * `limit` bounds what an afternoon's conversation costs to send. The most recent
 * turns are the ones that carry the subject, so the window is taken from the end.
 */
export function historyForModel<T extends { divider?: string }>(messages: T[], limit = 20): T[] {
  return currentTaskMessages(messages)
    .filter((m) => !m.divider)
    .slice(-limit);
}
