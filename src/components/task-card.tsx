import { router } from 'expo-router';
import { CalendarDays, FileText, ListTodo } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { useColors } from '@/lib/colors';
import { formatFull, formatRelative, formatTime } from '@/lib/dates';
import { isDueToday, isLate, useAriaStore, type Task } from '@/store/aria-store';

export function TaskCard({ task, onPress }: { task: Task; onPress?: () => void }) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const late = isLate(task, demoDate);
  const dueToday = isDueToday(task, demoDate);
  const doneCount = task.subtasks.filter((s) => s.done).length;
  const canAria = task.status === 'todo' && ariaActionFor(task) !== null;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/task/${task.id}`))}
      className="rounded-2xl border border-border bg-surface p-4 active:opacity-70">
      <View className="flex-row items-start justify-between gap-3">
        {/* Body weight rather than `subtitle`. A card title is a list item, not
            a heading — at 17px semibold every card competed with the screen
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

      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1.5">
          <CalendarDays size={15} color={late ? c.danger : dueToday ? c.warning : c.muted} />
          <Text variant="small" tone={late ? 'danger' : dueToday ? 'warning' : 'muted'}>
            {task.status === 'done' ? formatFull(task.date) : formatRelative(task.date, demoDate)}
            {task.time ? ` · ${formatTime(task.time)}` : ''}
          </Text>
        </View>
        {task.subtasks.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <ListTodo size={15} color={c.muted} />
            <Text variant="small" tone="muted">
              {doneCount}/{task.subtasks.length}
            </Text>
          </View>
        ) : null}
        {/* Aria wrote something and it's kept on the task — say so, or there's
            no way to know it exists without opening every task. */}
        {(task.draftSections?.length ?? 0) > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <FileText size={15} color={c.accent} />
            <Text variant="small" tone="accent" className="font-strong">
              Draft
            </Text>
          </View>
        ) : null}
        {canAria ? (
          <View className="ml-auto flex-row items-center gap-1">
            <AriaAvatar size={18} />
            <Text variant="caption" tone="accent" className="font-strong">
              Aria can help
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
