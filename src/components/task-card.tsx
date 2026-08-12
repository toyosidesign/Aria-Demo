import { router } from 'expo-router';
import { CalendarDays, FileText, ListTodo } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { isWorkKind } from '@/lib/task-flow';
import { useColors } from '@/lib/colors';
import { formatFull, formatRelative, formatTime } from '@/lib/dates';
import { isDueToday, isLate, useAriaStore, type Task } from '@/store/aria-store';

export function TaskCard({ task, onPress }: { task: Task; onPress?: () => void }) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const late = isLate(task, demoDate);
  const dueToday = isDueToday(task, demoDate);
  const doneCount = task.subtasks.filter((s) => s.done).length;
  /*
   * "Aria can help" is an offer, so it stops once the help has happened.
   *
   * A birthday whose card is already written does not need Aria to write it;
   * what is left is sending it, and the task already says so through its own
   * status. Leaving the offer up reads as though the message were still
   * outstanding, and invites a second pass over something finished.
   *
   * `readyToSend` is the marker for exactly that state: the work is done and
   * the only remaining step is the send.
   */
  const ariaAction = task.status === 'todo' ? ariaActionFor(task) : null;
  const canAria = ariaAction !== null && !ariaAction.readyToSend;

  /*
   * Only work gets a progress bar, and only while it is still work.
   *
   * A birthday with two subtasks is not "40% complete" in any sense a person
   * would recognise; an assignment with two of five steps done is exactly that.
   * Keyed off the kind rather than off having subtasks, for that reason.
   */
  const inProgress =
    task.status === 'todo' && isWorkKind(task.kind) && task.subtasks.length > 0;
  const nextStep = inProgress ? task.subtasks.find((s) => !s.done) : undefined;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/task/${task.id}`))}
      className="rounded-2xl border border-border bg-surface p-4 active:opacity-70">
      <View className="flex-row items-start justify-between gap-3">
        {/* Body weight rather than `subtitle`. A card title is a list item, not
            a heading, at 17px semibold every card competed with the screen
            title above it, and a column of them read as a stack of headlines. */}
        <Text
          className="flex-1 font-strong"
          tone={task.status === 'done' ? 'muted' : 'default'}>
          {task.title}
        </Text>
        {/* One label, most-urgent first. Priority is the fallback: it only
            matters once the task isn't shouting about its own timing. */}
        {task.status === 'done' ? (
          <StatusBadge status="done" />
        ) : late ? (
          <StatusBadge status="late" />
        ) : dueToday ? (
          <StatusBadge status="due" />
        ) : (
          <PriorityBadge priority={task.priority} />
        )}
      </View>

      {/*
        Wraps, and every part of it can shrink.

        This row can hold four things at once: the date and time, the step
        count, a draft marker and Aria's offer. On a narrow phone that is wider
        than the card, and as a single non-wrapping row with `ml-auto` on the
        last item it did not clip, it overflowed, so "Aria can help" sat outside
        the rounded border. A fourth item now drops to a second line instead.
      */}
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
        <View className="min-w-0 shrink flex-row items-center gap-1.5">
          <CalendarDays size={15} color={late ? c.danger : dueToday ? c.warning : c.muted} />
          <Text
            variant="small"
            tone={late ? 'danger' : dueToday ? 'warning' : 'muted'}
            numberOfLines={1}
            className="shrink">
            {task.status === 'done' ? formatFull(task.date) : formatRelative(task.date, demoDate)}
            {task.time ? ` · ${formatTime(task.time)}` : ''}
          </Text>
        </View>
        {task.subtasks.length > 0 ? (
          <View className="shrink-0 flex-row items-center gap-1.5">
            <ListTodo size={15} color={c.muted} />
            <Text variant="small" tone="muted">
              {doneCount}/{task.subtasks.length}
            </Text>
          </View>
        ) : null}
        {/* Aria wrote something and it's kept on the task, say so, or there's
            no way to know it exists without opening every task. */}
        {(task.draftSections?.length ?? 0) > 0 ? (
          <View className="shrink-0 flex-row items-center gap-1.5">
            <FileText size={15} color={c.accent} />
            <Text variant="small" tone="accent" className="font-strong">
              Draft
            </Text>
          </View>
        ) : null}
        {canAria ? (
          <View className="ml-auto shrink-0 flex-row items-center gap-1">
            <AriaAvatar size={18} />
            <Text variant="caption" tone="accent" className="font-strong">
              Aria can help
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        Work in progress looks different from a task that has not started.

        An assignment runs for days and ends in a document, so the row that
        serves an event serves it badly: a title and a date is exactly what a
        finished piece of work looks like too. The bar says how far along it is
        and the line under it names the one step that is next, which is the
        difference between a list entry and something being worked on.
      */}
      {inProgress ? (
        <View className="mt-3 gap-1.5">
          <View className="h-1.5 overflow-hidden rounded-full bg-border">
            <View
              className="h-full rounded-full bg-accent"
              // Never zero-width: a bar with nothing in it reads as a rendering
              // fault rather than as "nothing done yet".
              style={{ width: `${Math.max(4, Math.round((doneCount / task.subtasks.length) * 100))}%` }}
            />
          </View>
          {nextStep ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              Next: {nextStep.title}
              {nextStep.due ? ` · ${formatRelative(nextStep.due, demoDate)}` : ''}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
