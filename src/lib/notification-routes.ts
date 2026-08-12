/**
 * What a notification is about, and where tapping it should land.
 *
 * ── The bug this exists to fix ──────────────────────────────────────────────
 *
 * Every notification the app sends is *about* something, and until now only two
 * of the three said so. A task alarm carried no data at all, so a tap could do
 * nothing but launch the app, and the app went wherever its own startup logic
 * sent it: the sign-in screen from cold, or whichever tab was last open. People
 * tapped a reminder and arrived at "Get started", or at "No finished tasks
 * yet", which reads as the app having lost the thing it just reminded them of.
 *
 * ── Why the kinds live here ─────────────────────────────────────────────────
 *
 * Two modules schedule notifications and a third routes them, so the vocabulary
 * has to be somewhere all three can reach without any of them importing the
 * others. Here, in a module with no React Native import at all, which is also
 * what lets `check:review` hold the mapping: one `import { Platform }` and the
 * suites die with a Flow syntax error out of react-native's index. The native
 * half is `lib/launch-route.ts`, for exactly that reason.
 */

/** An alarm on a task: the reminder somebody set for a specific thing. */
export const TASK_ALARM_KIND = 'task-alarm';
/** The Pro morning prompt. */
export const DAILY_REVIEW_KIND = 'daily-review';
/** Something Aria scheduled to send, now due. */
export const AUTOMATION_KIND = 'automation';

export type NotificationData =
  | { kind?: string; taskId?: string; automationId?: string }
  | undefined;

/**
 * The route for a payload, or null when it means nothing to this app.
 *
 * Null rather than a fallback route on purpose: sending an unrecognised
 * notification to the home screen looks identical to a tap that did nothing,
 * and it hides the fact that something is scheduled which this build no longer
 * understands. Half a payload is treated the same way, because a task alarm
 * with no task cannot open a task and guessing one would open somebody else's.
 */
export function routeForNotification(data: NotificationData): string | null {
  if (!data?.kind) return null;
  if (data.kind === TASK_ALARM_KIND && data.taskId) return `/task/${data.taskId}`;
  if (data.kind === DAILY_REVIEW_KIND) return '/review';
  // The run screen finds the due automation itself, so the id is not in the path.
  if (data.kind === AUTOMATION_KIND && data.automationId) return '/aria/run';
  return null;
}
