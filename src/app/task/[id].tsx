import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AlarmClock,
  AlignLeft,
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Lock,
  Gift,
  Home,
  Image as ImageIcon,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  PenLine,
  Phone,
  RotateCcw,
  SearchX,
  Share2,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { SendCardSheet } from '@/components/send-card-sheet';
import { ReminderActions } from '@/components/reminder-actions';
import { SendPhotoSheet } from '@/components/send-photo-sheet';
import { SubtaskRow } from '@/components/subtask-research';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { HeaderButton } from '@/components/header-button';
import { ensureAlarmPermission, runPreview } from '@/lib/alarms';
import { ariaActionFor, METHOD_LABELS } from '@/lib/aria-actions';
import { exportWork, sectionsToText } from '@/lib/export';
import { hapticTap } from '@/lib/haptics';
import { openCall } from '@/lib/send';
import { showToast } from '@/lib/toast';
import { requestChecklist } from '@/lib/subtasks';
import { useColors } from '@/lib/colors';
import { formatLong, formatRelative, formatTime, isPastMoment } from '@/lib/dates';
import {
  isLate,
  hasReminderFired,
  isReminderOnly,
  selectNextDue,
  useAriaStore,
  type TaskMethod,
} from '@/store/aria-store';

const METHOD_ICON: Record<TaskMethod, LucideIcon> = {
  sms: MessageSquare,
  email: Mail,
  card: Gift,
  photo: ImageIcon,
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
  const updateTask = useAriaStore((s) => s.updateTask);
  const addSubtasks = useAriaStore((s) => s.addSubtasks);
  const pro = useAriaStore((s) => s.pro);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [sendCardOpen, setSendCardOpen] = useState(false);

  async function copyAll() {
    const sections = task?.draftSections ?? [];
    if (!sections.length) return;
    await Clipboard.setStringAsync(sections.map((d) => `${d.title}\n${d.content}`).join('\n\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Hand the whole draft to Notes, Docs, Drive, Files or Mail. */
  function exportAll() {
    const sections = task?.draftSections ?? [];
    if (!sections.length) return;
    hapticTap();
    void exportWork(task!.title, sectionsToText(sections));
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
        <View className="flex-1 items-center justify-center gap-5 px-6">
          <SearchX size={30} color={c.faint} />
          <Text tone="muted" className="text-center leading-6">
            This task no longer exists. It may have been completed or deleted.
          </Text>
          {/* replace, not back: the stack behind this can be stale too */}
          <View className="w-full gap-2">
            <Button title="Back to my tasks" block onPress={() => router.replace('/(tabs)/tasks')} />
            <Button
              title="Go home"
              variant="secondary"
              block
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
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
  // The next thing that actually needs attention, for "carry on" after finishing
  // this one. Due or overdue only.
  const nextTask = selectNextDue(allTasks, demoDate, task.id);

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        {arrivedFromComplete ? (
          <View className="h-10 w-10" />
        ) : (
          <HeaderButton icon={ArrowLeft} onPress={() => router.back()} />
        )}
        <View className="flex-row items-center gap-1">
          {task.status === 'done' ? (
            <HeaderButton icon={RotateCcw} onPress={() => reopenTask(task.id)} />
          ) : null}
          <HeaderButton icon={PenLine} onPress={() => router.push(`/task/new?editId=${task.id}`)} />
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
              Nice, that one&apos;s done. Here&apos;s your next task.
            </Text>
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
          {task.contactPhone ? (
            <View className="flex-row items-center gap-2">
              <Phone size={16} color={c.muted} />
              <Text tone="muted" numberOfLines={1}>
                {task.contactPhone}
              </Text>
            </View>
          ) : null}
        </View>

        {task.time && task.status === 'todo' ? (
          <View className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
            <View className="flex-row items-center gap-2.5">
              <AlarmClock size={18} color={task.alarm ? c.accent : c.muted} />
              <View>
                <Text variant="label" tone={task.alarm ? 'accent' : 'muted'}>
                  Alarm
                </Text>
                <Text variant="caption" tone="faint">
                  {task.alarm ? `Chimes at ${formatTime(task.time)}` : 'Off'}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              {task.alarm ? (
                <Pressable
                  onPress={() => runPreview(task.title)}
                  hitSlop={8}
                  className="active:opacity-60">
                  <Text variant="caption" tone="accent" className="font-semibold">
                    Preview
                  </Text>
                </Pressable>
              ) : null}
              <Switch
                value={!!task.alarm}
                onValueChange={async (v) => {
                  if (v && isPastMoment(task.date, task.time)) {
                    Alert.alert(
                      'That time has passed',
                      `${formatTime(task.time!)} on ${formatLong(task.date)} has already gone, so an alarm can’t ring for it. Snooze the task or move it to a new time first.`,
                    );
                    return;
                  }
                  if (v && !(await ensureAlarmPermission())) {
                    Alert.alert(
                      'Notifications are off',
                      'Aria needs notification permission to chime. Turn it on for this app in your device Settings, then switch the alarm back on.',
                    );
                    return;
                  }
                  updateTask(task.id, { alarm: v || undefined });
                  showToast(v ? 'Alarm on' : 'Alarm off', 'alarm');
                }}
              />
            </View>
          </View>
        ) : null}

        {task.description ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Notes
            </Text>
            <Card>
              <Text className="text-[14px] leading-[20px]">{task.description}</Text>
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
            </View>
            <Card className="gap-4">
              {task.draftSections.map((d, i) => (
                <View key={`${d.title}-${i}`} className="gap-1">
                  <Text variant="small" tone="accent" className="font-semibold">
                    {d.title}
                  </Text>
                  <Text className="text-[14px] leading-[20px]">{d.content}</Text>
                </View>
              ))}
            </Card>
            {/* Below the draft rather than beside the heading: these act on what
                you've just read, so they belong at the end of it. "Save to
                Notes" is gone because the share sheet it opened is what "Save
                to…" already does, only that one also writes a real file. */}
            <View className="flex-row gap-2">
              <Button
                title={copied ? 'Copied' : 'Copy all'}
                variant="secondary"
                className="flex-1"
                leftIcon={
                  copied ? (
                    <Check size={17} color={c.success} />
                  ) : (
                    <Copy size={17} color={c.ink} />
                  )
                }
                onPress={copyAll}
              />
              <Button
                title="Save to…"
                variant="secondary"
                className="flex-1"
                leftIcon={<Share2 size={17} color={c.ink} />}
                onPress={exportAll}
              />
            </View>
          </View>
        ) : null}

        {/* A call is a reminder: nothing to draft, and Aria can't dial for you.
            All it can usefully do is save you hunting for the number. */}
        {task.status === 'todo' && task.method === 'call' ? (
          <View className="gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <View className="flex-row items-center gap-2">
              <AriaAvatar size={26} />
              <Text variant="subtitle" tone="accent" className="text-[16px] leading-[22px]">
                Aria will remind you
              </Text>
            </View>
            <Text className="text-[14px] leading-[20px]">
              Give {task.contactName ?? 'them'} a ring
              {task.time ? ` at ${formatTime(task.time)}` : ''}. I&apos;ll nudge you when it&apos;s
              time. Placing the call is yours.
            </Text>
            {task.contactPhone ? (
              <Button
                title={`Call ${task.contactName ?? 'them'}`}
                leftIcon={<Phone size={18} color={c.accentInk} />}
                block
                onPress={() => void openCall({ phone: task.contactPhone, notes: task.title })}
              />
            ) : null}
          </View>
        ) : null}

        {/* Aria proactive offer (assignments use the checklist below instead) */}
        {action && !isAssignmentKind ? (
          <View className="gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <View className="flex-row items-center gap-2">
              <AriaAvatar size={26} />
              <Text variant="subtitle" tone="accent" className="text-[16px] leading-[22px]">
                Aria can help
              </Text>
            </View>
            <Text className="text-[14px] leading-[20px]">{action.offer}</Text>
            <Button
              title={action.cta}
              leftIcon={<Sparkles size={18} color={c.accentInk} />}
              onPress={() =>
                action.readyToSend ? setSendCardOpen(true) : router.push(`/aria/${task.id}`)
              }
              block
            />
            {/* Or hand it over entirely and let Aria act at a chosen moment. */}
            {action.needsSend ? (
              <Button
                title={pro ? 'Let Aria send this for you' : 'Let Aria send this for you · Pro'}
                variant="ghost"
                size="sm"
                block
                leftIcon={
                  pro ? <CalendarClock size={16} color={c.accent} /> : <Lock size={14} color={c.accent} />
                }
                onPress={() =>
                  router.push({
                    pathname: '/schedule',
                    params: {
                      taskId: task.id,
                      channel: task.method === 'email' ? 'email' : 'sms',
                    },
                  })
                }
              />
            ) : null}
            {action.needsSend ? (
              <Text variant="caption" tone="muted" className="text-center">
                Pick a date and time, and Aria takes it from there
              </Text>
            ) : null}
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
              <Text variant="subtitle" tone="accent" className="text-[16px] leading-[22px]">
                Aria can help
              </Text>
            </View>
            <Text className="text-[14px] leading-[20px]">
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

        {/* Complete (todo only). Reopen lives as a subtle header icon for done tasks. */}
        {/* A reminder has nothing to complete — you've either taken it in or
            you want it again shortly. Those two answers only make sense once
            it has actually gone off, so until then Aria just says when. */}
        {task.status === 'todo' && isReminderOnly(task) ? (
          hasReminderFired(task, demoDate) ? (
            <View className="pt-2">
              <ReminderActions
                task={task}
                onDone={() =>
                  nextTask
                    ? router.replace({
                        pathname: '/task/[id]',
                        params: { id: nextTask.id, advanced: '1' },
                      })
                    : router.replace('/(tabs)')
                }
              />
            </View>
          ) : (
            <View className="gap-2 rounded-2xl border border-accent/30 bg-accent-soft p-4">
              <View className="flex-row items-center gap-2">
                <AriaAvatar size={26} />
                <Text variant="subtitle" tone="accent" className="text-[16px] leading-[22px]">
                  {task.alarm && task.time ? 'Aria will remind you' : 'Saved for later'}
                </Text>
              </View>
              {/* Only promise a chime when an alarm is actually set — claiming
                  a nudge that never comes is how a reminder gets missed. */}
              <Text className="text-[14px] leading-[20px]">
                {task.alarm && task.time
                  ? `I'll chime at ${formatTime(task.time)} on ${formatLong(task.date)}.`
                  : `Set for ${task.time ? `${formatTime(task.time)} on ` : ''}${formatLong(task.date)}. No alarm is on, so nothing will sound.`}{' '}
                Nothing to answer until then.
              </Text>
            </View>
          )
        ) : null}

        {task.status === 'todo' && !isReminderOnly(task) ? (
          <View className="gap-2 pt-2">
            <Button
              title="Mark complete"
              variant="secondary"
              block
              size="lg"
              leftIcon={<CheckCircle2 size={19} color={c.ink} />}
              onPress={() => {
                completeTask(task.id);
                if (nextTask)
                  router.replace({
                    pathname: '/task/[id]',
                    params: { id: nextTask.id, advanced: '1' },
                  });
                else router.replace('/(tabs)/tasks');
              }}
            />

            {/* Working through a run of tasks: skip on, or stop here. */}
            {arrivedFromComplete ? (
              <View className="flex-row gap-2">
                {nextTask ? (
                  <Button
                    title="Next task"
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    leftIcon={<ChevronRight size={16} color={c.accent} />}
                    onPress={() =>
                      router.replace({
                        pathname: '/task/[id]',
                        params: { id: nextTask.id, advanced: '1' },
                      })
                    }
                  />
                ) : null}
                <Button
                  title="Finish for now"
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  leftIcon={<Home size={16} color={c.accent} />}
                  onPress={() => router.replace('/(tabs)')}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {action?.readyToSend ? (
        task.method === 'photo' ? (
          <SendPhotoSheet task={task} visible={sendCardOpen} onClose={() => setSendCardOpen(false)} />
        ) : (
          <SendCardSheet task={task} visible={sendCardOpen} onClose={() => setSendCardOpen(false)} />
        )
      ) : null}
    </Screen>
  );
}
