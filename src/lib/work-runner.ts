import { requestDraft } from '@/lib/aria-actions';
import { catchUp } from '@/lib/plan';
import { requestChecklist } from '@/lib/subtasks';
import { workAhead, workAheadReport, type WorkItem } from '@/lib/work-ahead';
import { useAriaStore } from '@/store/aria-store';

/**
 * Doing the work Pro pays for.
 *
 * `work-ahead.ts` decides *what* is worth preparing and `plan.ts` decides how a
 * slipped plan is re-dated; this is the part that spends the money and writes
 * the results back. Kept apart from both so the rules stay testable without a
 * network.
 *
 * ── Where this runs, and what the copy may therefore claim ──────────────────
 *
 * On the device, when the app becomes active. Not on a server, and not while
 * the phone is in a drawer.
 *
 * That is a real limit and the wording respects it: Pro says the work is done
 * *before you get there*, which is true, rather than *while you sleep*, which
 * would not be. Moving it server-side is a queue table and an Edge Function
 * that already has a sibling in `run-automations`, and nothing here would
 * change: the rules are pure and the writes go through the same store actions.
 *
 * ── Why it cannot run twice at once ─────────────────────────────────────────
 *
 * Two passes over the same queue would draft the same card twice and bill for
 * both, and the second would overwrite the first. `running` is module-level
 * because the trigger is too: an app can be foregrounded twice in a second.
 */

let running = false;

export interface WorkPass {
  prepared: WorkItem[];
  /** Plans that had fallen behind and were re-dated. */
  replanned: { taskId: string; title: string; moved: number; tight: boolean }[];
}

const EMPTY: WorkPass = { prepared: [], replanned: [] };

/**
 * Prepare what is worth preparing, and re-date what has slipped.
 *
 * Never throws: this runs unattended, and a failed pass has to leave the app
 * exactly as it was rather than surfacing a network error somebody did not ask
 * for. What it could not do it simply has not done, and the next pass tries
 * again.
 */
export async function runWorkAhead(): Promise<WorkPass> {
  if (running) return EMPTY;
  const store = useAriaStore.getState();
  // Pro only, checked here as well as at the call site: this is the one
  // function that spends money without anybody asking it to.
  if (!store.pro) return EMPTY;

  running = true;
  const pass: WorkPass = { prepared: [], replanned: [] };
  try {
    const today = store.demoDate;
    const queue = workAhead(store.tasks, today);

    for (const item of queue) {
      // Re-read each time: a pass takes seconds, and the task may have been
      // edited, finished or deleted while the previous item was in flight.
      const task = useAriaStore.getState().tasks.find((t) => t.id === item.taskId);
      if (!task || task.status !== 'todo') continue;

      if (item.kind === 'draft') {
        if (task.description?.trim()) continue; // written in the meantime
        const res = await requestDraft({
          title: task.title,
          kind: task.kind,
          method: task.method,
          contactName: task.contactName,
          senderName: store.profile.name,
          senderContext: store.profile.context,
        });
        if (res.message?.trim()) {
          useAriaStore.getState().updateTask(task.id, { description: res.message.trim() });
          pass.prepared.push(item);
        }
        continue;
      }

      if (useAriaStore.getState().tasks.find((t) => t.id === task.id)?.subtasks.length) continue;
      const steps = await requestChecklist({
        title: task.title,
        description: task.description,
        learner: {
          role: store.profile.role,
          studying: store.profile.studying,
          level: store.profile.level,
          interests: store.profile.interests,
          explainStyle: store.profile.explainStyle,
        },
      });
      if (steps.length) {
        useAriaStore.getState().addSubtasks(task.id, steps);
        pass.prepared.push(item);
      }
    }

    /*
     * Then the plans that have fallen behind.
     *
     * Second, and deliberately: a breakdown created a moment ago has dates that
     * are already correct, and re-dating it in the same pass would count steps
     * as rolled over on the day they were written.
     */
    for (const task of useAriaStore.getState().tasks) {
      if (task.status !== 'todo' || !task.subtasks.length) continue;
      const result = catchUp(task.subtasks, today, task.date);
      if (!result.moved) continue;
      useAriaStore.getState().updateTask(task.id, { subtasks: result.steps });
      pass.replanned.push({
        taskId: task.id,
        title: task.title,
        moved: result.moved,
        tight: result.tight,
      });
    }
  } catch {
    // Unattended work fails quietly and tries again next time. The alternative
    // is an error toast for something nobody asked for.
  } finally {
    running = false;
  }
  return pass;
}

/**
 * One line for what a pass did, or nothing.
 *
 * Silence when nothing happened. A notification saying "I checked and there was
 * nothing to do" is the app asking for credit, and it is the fastest way to
 * make somebody turn the feature off.
 */
export function workPassReport(pass: WorkPass): string | null {
  const prepared = workAheadReport(pass.prepared);
  if (!pass.replanned.length) return prepared;
  const behind = pass.replanned.reduce((n, r) => n + r.moved, 0);
  const tight = pass.replanned.some((r) => r.tight);
  const replan =
    `${behind} ${behind === 1 ? 'step' : 'steps'} had slipped, so I moved ${behind === 1 ? 'it' : 'them'}` +
    (tight ? ", and one plan no longer fits before its deadline." : '.');
  return prepared ? `${prepared} ${replan}` : `Done while you were away: ${replan}`;
}
