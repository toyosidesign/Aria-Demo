import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, type Href } from 'expo-router';
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
  FileText,
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
  Send,
  Phone,
  Repeat2,
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
import { GuideSheet } from '@/components/guide-sheet';
import { GuideButton } from '@/components/work-panels';
import { formatRunAt, isPending } from '@/lib/automations';
import { goBack } from '@/lib/nav';
import { rolloverVerdict } from '@/lib/plan';
import { handInReadiness } from '@/lib/ready';
import { writtenSections } from '@/lib/sections';
import { isWorkKind } from '@/lib/task-flow';
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
import type { Learner } from '@/lib/learner';
import { requestChecklist } from '@/lib/subtasks';
import { useColors } from '@/lib/colors';
import { REPEAT_LABEL, formatFull, formatLong, formatRelative, formatTime, isPastMoment } from '@/lib/dates';
import {
  isDueToday,
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
  other: PenLine,
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
  const automations = useAriaStore((s) => s.automations);
  const cancelAutomation = useAriaStore((s) => s.cancelAutomation);
  const updateTask = useAriaStore((s) => s.updateTask);
  const addSubtasks = useAriaStore((s) => s.addSubtasks);
  /*
   * Selected one field at a time, not as an object.
   *
   * A selector returning `{...}` builds a new object on every call, and zustand
   * compares snapshots with Object.is, so it would never match, and this
   * screen would re-render on every store change. Primitives (and the interests
   * array, whose reference is stable until it's actually replaced) compare
   * correctly. They're assembled into a Learner at the call site instead.
   *
   * Picked field by field rather than passing the whole profile for a second
   * reason too: name, email and avatar have no business in a system prompt
   * about coursework.
   */
  const studying = useAriaStore((s) => s.profile.studying);
  const level = useAriaStore((s) => s.profile.level);
  const interests = useAriaStore((s) => s.profile.interests);
  const explainStyle = useAriaStore((s) => s.profile.explainStyle);
  const pro = useAriaStore((s) => s.pro);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [sendCardOpen, setSendCardOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  async function copyAll() {
    // Copying or exporting hands somebody the work, so it is the work only.
    const sections = writtenSections(task?.draftSections);
    if (!sections.length) return;
    await Clipboard.setStringAsync(sections.map((d) => `${d.title}\n${d.content}`).join('\n\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Hand the whole draft to Notes, Docs, Drive, Files or Mail. */
  function exportAll() {
    const sections = writtenSections(task?.draftSections);
    if (!sections.length) return;
    hapticTap();
    void exportWork(task!.title, sectionsToText(sections));
  }

  async function generateChecklist() {
    if (!task) return;
    setGenLoading(true);
    const items = await requestChecklist({
      title: task.title,
      description: task.description,
      learner: { studying, level, interests, explainStyle } satisfies Learner,
    });
    addSubtasks(task.id, items);
    setGenLoading(false);
  }

  if (!task) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <HeaderButton icon={ArrowLeft} onPress={() => goBack('/(tabs)/tasks')} />
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
  const dueToday = isDueToday(task, demoDate);
  const isFuture = task.date !== demoDate;
  const MethodIcon = task.method ? METHOD_ICON[task.method] : null;
  const isAssignmentKind = task.kind === 'assignment' || task.kind === 'project';
  /** Whether the work is actually finished enough to hand in. See lib/ready.ts. */
  const handIn = handInReadiness(task);
  /** The send this task already has waiting, if any. */
  const sending = automations.find((a) => a.taskId === task.id && isPending(a));
  const needsChecklist = isAssignmentKind && task.subtasks.length === 0 && task.status === 'todo';
  /*
   * The step the plan says is next, and how much it has been avoided.
   *
   * `pinned` is simply the first one not done, the plan is already in order,
   * so the next live row is the next thing. `rolloverVerdict` turns the count
   * of times it has been pushed into the two decisions that follow from it.
   */
  const pinned =
    isAssignmentKind && task.status === 'todo'
      ? task.subtasks.find((s) => !s.done)
      : undefined;
  const rollover = rolloverVerdict(pinned?.rollovers ?? 0);
  // The next thing that actually needs attention, for "carry on" after finishing
  // this one. Due or overdue only.
  const nextTask = selectNextDue(allTasks, demoDate, task.id);

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        {arrivedFromComplete ? (
          <View className="h-10 w-10" />
        ) : (
          <HeaderButton icon={ArrowLeft} onPress={() => goBack('/(tabs)/tasks')} />
        )}
        <View className="flex-row items-center gap-1">
          {task.status === 'done' ? (
            <HeaderButton icon={RotateCcw} onPress={() => reopenTask(task.id)} />
          ) : null}
          <HeaderButton icon={PenLine} onPress={() => router.push(`/task/new?editId=${task.id}`)} />
          <HeaderButton icon={Trash2} onPress={() => { deleteTask(task.id); goBack('/(tabs)/tasks'); }} />
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
            ) : dueToday ? (
              <StatusBadge status="due" />
            ) : null}
            <PriorityBadge priority={task.priority} />
          </View>
          <View className="flex-row items-center gap-2">
            <CalendarDays size={16} color={late ? c.danger : dueToday ? c.warning : c.muted} />
            <Text tone={late ? 'danger' : dueToday ? 'warning' : 'muted'}>
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

        {/* Says the task will come back, and when, otherwise the only clue is
            a new copy appearing after it's ticked off. */}
        {task.repeat ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3">
            <Repeat2 size={18} color={c.accent} />
            <View className="flex-1">
              <Text variant="label" tone="accent">
                Repeats
              </Text>
              <Text variant="caption" tone="faint">
                {REPEAT_LABEL[task.repeat]}
                {task.status === 'todo'
                  ? `. Next one appears when you tick this off.`
                  : `. The next one is already on your list.`}
              </Text>
            </View>
          </View>
        ) : null}

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
                  <Text variant="caption" tone="accent" className="font-strong">
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

        {/*
          What is actually going out, and how to change it.

          The header pencil edits the *task*: its title, its date, its notes. On
          a task with a send already scheduled that is the wrong thing to reach
          for, and reaching for it landed somebody in a form that looks like
          creating a task, which is what was reported. The recipient, the
          subject, the message and the moment are a different object with a
          different screen, so they get their own card and their own edit.
        */}
        {sending ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-1.5">
              <Send size={14} color={c.accent} />
              <Text variant="label" tone="accent">
                Going out
              </Text>
            </View>
            <Card className="gap-3">
              <Text className="text-[14px] leading-[20px]">
                {`To ${sending.toEmail ?? sending.toPhone ?? 'them'}, ${formatRunAt(sending.runAt)}.`}
              </Text>
              {sending.subject ? (
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {sending.subject}
                </Text>
              ) : null}
              <View className="flex-row gap-2">
                <Button
                  title="Edit what goes out"
                  className="flex-1"
                  leftIcon={<PenLine size={16} color={c.accentInk} />}
                  onPress={() => router.push(`/email-it/${task.id}` as Href)}
                />
                <Button
                  title="Cancel it"
                  variant="secondary"
                  onPress={() => cancelAutomation(sending.id)}
                />
              </View>
            </Card>
          </View>
        ) : null}

        {/*
          The plan comes before the step it produces.

          It used to sit under Aria's drafts, the send, the notes and the
          proactive offer, which put it below the fold on every assignment. That
          was survivable while it was only a progress display, and stopped being
          survivable when finishing the plan became the thing that unlocks
          sending: "Change the plan" arrived at the top of a screen whose plan
          was six scrolls down.

          It is also simply the more important object. The checklist is what the
          work *is*; the card under it is only what to do next about it.
        */}
        {/* Checklist, tap an item for research help */}
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


        {/*
          ── The end of the checklist, and nothing before it ─────────────────

          The list above is the progress display: it says which parts are done,
          which are next and how many are left, item by item, which a card
          summarising the same thing can only repeat less precisely. So there is
          no card until the list is finished.

          When it is, there are exactly two things anybody wants, and they are
          different acts rather than two names for one. Send it, which needs a
          recipient and a moment and therefore a form. Or keep it, which needs
          nothing and happens on the tap.
        */}
        {isWorkKind(task.kind) && task.status === 'todo' && handIn.ready ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-1.5">
              <CheckCircle2 size={14} color={c.accent} />
              <Text variant="label" tone="accent">
                Every part is done
              </Text>
            </View>
            <Card className="gap-3">
              <Text className="text-[14px] leading-[20px]">
                I have put all of it into one document, named the way a marker expects. Send it to
                somebody at a time you pick, or keep a copy now.
              </Text>
              <Button
                title="Send it"
                leftIcon={<Send size={16} color={c.accentInk} />}
                onPress={() => router.push(`/email-it/${task.id}` as Href)}
              />
              <Button
                title="Save as a document"
                variant="secondary"
                leftIcon={<FileText size={16} color={c.ink} />}
                onPress={() => {
                  hapticTap();
                  void exportWork(task.title, sectionsToText(writtenSections(task.draftSections)));
                }}
              />
              <Button
                title="Read it first"
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/assembled/${task.id}` as Href)}
              />
            </Card>
          </View>
        ) : null}

        {/* Aria's drafted content, kept separate from Notes, copyable */}
        {/* Written work only. An unfinished draft Aria is holding for you, and
            the compiled document, are both about the work rather than part of
            it, and listing them here reads as two extra sections nobody wrote. */}
        {writtenSections(task.draftSections).length > 0 ? (
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
              {writtenSections(task.draftSections).map((d, i) => (
                <View key={`${d.title}-${i}`} className="gap-1">
                  <Text variant="small" tone="accent" className="font-strong">
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
              {/* Once the message is written the offer is not help any more,
                  it is a prompt to send. Saying "Aria can help" over a finished
                  card suggests there is still something to write. */}
              <Text variant="subtitle" tone="accent" className="text-[16px] leading-[22px]">
                {action.readyToSend ? 'Ready to send' : 'Aria can help'}
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

        {/*
          The pinned step: the one thing that is next.

          A plan of eight steps with nothing pinned makes every one of them look
          equally due, which is how a student ends up doing the easy one. This
          is the step the plan says comes next, on its own, with the date it was
          aimed at and the Guide beside it, the third of the four places the
          Guide appears, because being stuck happens on a step rather than on a
          setup screen.
        */}
        {pinned ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Next up
            </Text>
            <Card className="gap-2">
              <SubtaskRow task={task} st={pinned} />
              {pinned.due ? (
                <Text variant="caption" tone={pinned.due < demoDate ? 'danger' : 'muted'}>
                  {pinned.due < demoDate ? 'Was due ' : 'Aimed at '}
                  {formatFull(pinned.due)}
                  {pinned.forcing ? ` · forced by: ${pinned.forcing}` : ''}
                </Text>
              ) : null}
              {/*
                Two rollovers is where the Guide stops waiting to be asked.

                A step that has moved twice is not a scheduling problem, it is
                somebody stuck, so the offer is made here rather than left to
                be found. The third one is where Aria asks whether it should go
                at all; that lives in `rolloverVerdict`, with the follow-up loop
                that will call it.
              */}
              {rollover.offerGuide ? (
                <View className="gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3">
                  <Text variant="caption" tone="accent">
                    This one has moved {pinned.rollovers} times. Want a way in?
                  </Text>
                  <GuideButton onPress={() => setGuideOpen(true)} />
                </View>
              ) : (
                <GuideButton onPress={() => setGuideOpen(true)} />
              )}
            </Card>
          </View>
        ) : null}

        {/* Complete (todo only). Reopen lives as a subtle header icon for done tasks. */}
        {/* A reminder has nothing to complete, you've either taken it in or
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
              {/* Only promise a chime when an alarm is actually set, claiming
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

      {/* Outside the send branch: the Guide belongs to work, which is the one
          kind of task that never has anything to send. */}
      <GuideSheet task={task} open={guideOpen} onClose={() => setGuideOpen(false)} />
    </Screen>
  );
}
