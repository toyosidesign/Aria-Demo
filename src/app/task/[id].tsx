import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AlignLeft,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Gift,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  NotebookPen,
  PenLine,
  Phone,
  RotateCcw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { SubtaskRow } from '@/components/subtask-research';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { HeaderButton } from '@/components/header-button';
import { ariaActionFor, METHOD_LABELS } from '@/lib/aria-actions';
import { saveDraftToNotes } from '@/lib/draft';
import { requestChecklist } from '@/lib/subtasks';
import { useColors } from '@/lib/colors';
import { formatLong, formatRelative, formatTime } from '@/lib/dates';
import { isLate, useAriaStore, type TaskMethod } from '@/store/aria-store';

const METHOD_ICON: Record<TaskMethod, LucideIcon> = {
  sms: MessageSquare,
  email: Mail,
  card: Gift,
  call: Phone,
  steps: ListChecks,
  outline: AlignLeft,
  draft: PenLine,
  remind: Bell,
  plan: ListTodo,
};

export default function TaskDetailScreen() {
  const c = useColors();
  const { id, advanced } = useLocalSearchParams<{ id: string; advanced?: string }>();
  const arrivedFromComplete = advanced === '1';
  const allTasks = useAriaStore((s) => s.tasks);
  const task = allTasks.find((t) => t.id === id);
  const demoDate = useAriaStore((s) => s.demoDate);
  const completeTask = useAriaStore((s) => s.completeTask);
  const reopenTask = useAriaStore((s) => s.reopenTask);
  const deleteTask = useAriaStore((s) => s.deleteTask);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);
  const addSubtasks = useAriaStore((s) => s.addSubtasks);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  async function copyAll() {
    const sections = task?.draftSections ?? [];
    if (!sections.length) return;
    await Clipboard.setStringAsync(sections.map((d) => `${d.title}\n${d.content}`).join('\n\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function generateChecklist() {
    if (!task) return;
    setGenLoading(true);
    const items = await requestChecklist({ title: task.title, description: task.description });
    addSubtasks(task.id, items);
    setGenLoading(false);
  }

  if (!task) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <HeaderButton icon={ArrowLeft} onPress={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <Text tone="muted">This task no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  const action = task.status === 'todo' ? ariaActionFor(task) : null;
  const late = isLate(task, demoDate);
  const isFuture = task.date !== demoDate;
  const MethodIcon = task.method ? METHOD_ICON[task.method] : null;
  const isAssignmentKind = task.kind === 'assignment' || task.kind === 'project';
  const needsChecklist = isAssignmentKind && task.subtasks.length === 0 && task.status === 'todo';

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton
          icon={ArrowLeft}
          onPress={() => (arrivedFromComplete ? router.replace('/(tabs)/tasks') : router.back())}
        />
        <View className="flex-row items-center gap-1">
          {task.status === 'done' ? (
            <HeaderButton icon={RotateCcw} onPress={() => reopenTask(task.id)} />
          ) : null}
          <HeaderButton icon={Trash2} onPress={() => { deleteTask(task.id); router.back(); }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        {arrivedFromComplete && task.status === 'todo' ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft p-3">
            <AriaAvatar size={26} />
            <Text variant="small" className="flex-1">
              Nice — that one&apos;s done. Here&apos;s your next task.
            </Text>
            <Pressable onPress={() => router.replace('/(tabs)/tasks')} hitSlop={8}>
              <Text variant="small" tone="accent" className="font-semibold">
                All tasks
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-3 pt-1">
          <Text variant="title">{task.title}</Text>
          <View className="flex-row items-center gap-2">
            {task.status === 'done' ? (
              <StatusBadge status="done" />
            ) : late ? (
              <StatusBadge status="late" />
            ) : null}
            <PriorityBadge priority={task.priority} />
          </View>
          <View className="flex-row items-center gap-2">
            <CalendarDays size={16} color={late ? c.danger : c.muted} />
            <Text tone={late ? 'danger' : 'muted'}>
              {formatLong(task.date)}
              {task.time ? ` · ${formatTime(task.time)}` : ''}
              {task.status === 'todo' ? `  ·  ${formatRelative(task.date, demoDate)}` : ''}
            </Text>
          </View>
          {task.method && task.method !== 'remind' && MethodIcon ? (
            <View className="flex-row items-center gap-2">
              <MethodIcon size={16} color={c.muted} />
              <Text tone="muted">Aria · {METHOD_LABELS[task.method]}</Text>
            </View>
          ) : null}
          {task.contactEmail ? (
            <View className="flex-row items-center gap-2">
              <Mail size={16} color={c.muted} />
              <Text tone="muted" numberOfLines={1}>
                To {task.contactEmail}
              </Text>
            </View>
          ) : null}
        </View>

        {task.description ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Notes
            </Text>
            <Card>
              <Text className="leading-6">{task.description}</Text>
            </Card>
          </View>
        ) : null}

        {/* Aria's drafted content — kept separate from Notes, copyable */}
        {task.draftSections && task.draftSections.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Sparkles size={14} color={c.accent} />
                <Text variant="label" tone="accent">
                  Aria&apos;s draft
                </Text>
              </View>
              <Pressable
                onPress={copyAll}
                hitSlop={8}
                className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 active:opacity-70">
                {copied ? (
                  <Check size={14} color={c.success} />
                ) : (
                  <Copy size={14} color={c.muted} />
                )}
                <Text
                  variant="caption"
                  className="font-semibold"
                  style={{ color: copied ? c.success : c.muted }}>
                  {copied ? 'Copied' : 'Copy all'}
                </Text>
              </Pressable>
            </View>
            <Card className="gap-4">
              {task.draftSections.map((d, i) => (
                <View key={`${d.title}-${i}`} className="gap-1">
                  <Text variant="small" tone="accent" className="font-semibold">
                    {d.title}
                  </Text>
                  <Text className="leading-6">{d.content}</Text>
                </View>
              ))}
            </Card>
            <Button
              title="Save to Notes"
              variant="secondary"
              leftIcon={<NotebookPen size={18} color={c.ink} />}
              onPress={() => saveDraftToNotes(task)}
            />
          </View>
        ) : null}

        {/* Aria proactive offer (assignments use the checklist below instead) */}
        {action && !isAssignmentKind ? (
          <View className="gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <View className="flex-row items-center gap-2">
              <AriaAvatar size={26} />
              <Text variant="subtitle" tone="accent">
                Aria can help
              </Text>
            </View>
            <Text className="leading-6">{action.offer}</Text>
            <Button
              title={action.cta}
              leftIcon={<Sparkles size={18} color={c.accentInk} />}
              onPress={() => router.push(`/aria/${task.id}`)}
              block
            />
          </View>
        ) : null}

        {/* Checklist — tap an item for research help */}
        {task.subtasks.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                {isAssignmentKind ? 'Checklist' : 'Subtasks'}
              </Text>
              {isAssignmentKind ? (
                <View className="flex-row items-center gap-1">
                  <Sparkles size={12} color={c.faint} />
                  <Text variant="caption" tone="faint">
                    tap an item for research help
                  </Text>
                </View>
              ) : null}
            </View>
            <Card className="gap-0.5">
              {task.subtasks.map((st) => (
                <SubtaskRow key={st.id} task={task} st={st} />
              ))}
            </Card>
          </View>
        ) : needsChecklist ? (
          <View className="gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <View className="flex-row items-center gap-2">
              <AriaAvatar size={26} />
              <Text variant="subtitle" tone="accent">
                Aria can help
              </Text>
            </View>
            <Text className="leading-6">
              Want me to map out the topics to work on and turn them into a checklist? Then I can
              help you research each one.
            </Text>
            <Button
              title={genLoading ? 'Building your checklist…' : 'Generate checklist'}
              loading={genLoading}
              disabled={genLoading}
              leftIcon={!genLoading ? <ListChecks size={18} color={c.accentInk} /> : undefined}
              onPress={generateChecklist}
              block
            />
          </View>
        ) : null}

        {/* Demo helper: jump the app's "today" to this task's date */}
        {task.status === 'todo' && isFuture ? (
          <Button
            title={`Simulate ${formatRelative(task.date, demoDate).toLowerCase()} (demo)`}
            variant="ghost"
            size="sm"
            onPress={() => setDemoDate(task.date)}
          />
        ) : null}

        {/* Complete (todo only). Reopen lives as a subtle header icon for done tasks. */}
        {task.status === 'todo' ? (
          <View className="pt-2">
            <Button
              title="Mark complete"
              variant="secondary"
              block
              size="lg"
              leftIcon={<CheckCircle2 size={19} color={c.ink} />}
              onPress={() => {
                // Jump straight to the next due task; fall back to the list.
                const next = allTasks
                  .filter((t) => t.status === 'todo' && t.id !== task.id)
                  .sort((a, b) => a.date.localeCompare(b.date))[0];
                completeTask(task.id);
                if (next)
                  router.replace({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
                else router.back();
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
