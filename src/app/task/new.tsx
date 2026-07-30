import { router, useLocalSearchParams } from 'expo-router';
import {
  AlarmClock,
  AlignLeft,
  Bell,
  Gift,
  Image as ImageIcon,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  PenLine,
  Phone,
  Plus,
  SearchX,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { ContactField } from '@/components/contact-field';
import { CardMessageField } from '@/components/card-message-field';
import { CardPreview } from '@/components/card-preview';
import { InlineError } from '@/components/inline-error';
import { CardPicker } from '@/components/card-picker';
import { PhotoField } from '@/components/photo-field';
import { Eye } from 'lucide-react-native';
import { MonthCalendar } from '@/components/month-calendar';
import { SimulatedDateBanner } from '@/components/simulated-date-banner';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { ensureAlarmPermission, runPreview } from '@/lib/alarms';
import {
  CATEGORY_KINDS,
  EVENT_OCCASIONS,
  isEventKind,
  isMessageMethod,
  METHOD_LABELS,
  methodOptionsFor,
  TASK_KINDS,
} from '@/lib/aria-actions';
import { cn } from '@/lib/cn';
import { isValidEmails } from '@/lib/contacts';
import { defaultTemplateFor } from '@/lib/cards';
import { formatFull, formatTime, isPastMoment, realToday } from '@/lib/dates';
import { KIND_ICON } from '@/lib/kind-icons';
import { useColors } from '@/lib/colors';
import { showToast } from '@/lib/toast';
import {
  defaultMethodFor,
  newDraftSubtask,
  useAriaStore,
  type Priority,
  type Subtask,
  type TaskKind,
  type TaskMethod,
} from '@/store/aria-store';


const PRIORITIES: { value: Priority; label: string; dot: string }[] = [
  { value: 'low', label: 'Low', dot: 'bg-priority-low' },
  { value: 'medium', label: 'Medium', dot: 'bg-priority-medium' },
  { value: 'high', label: 'High', dot: 'bg-priority-high' },
];

const METHOD_ICONS: Record<TaskMethod, LucideIcon> = {
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

const KIND_VALUES: TaskKind[] = TASK_KINDS.map((k) => k.value);

export default function NewTaskScreen() {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const addTask = useAriaStore((s) => s.addTask);
  const updateTask = useAriaStore((s) => s.updateTask);
  const tasks = useAriaStore((s) => s.tasks);
  const profileName = useAriaStore((s) => s.profile.name);

  // Pre-fill when Aria routes here from the chat ("Review & create"),
  // or when editing an existing task (editId present).
  const params = useLocalSearchParams<{
    title?: string;
    date?: string;
    kind?: string;
    priority?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    method?: string;
    time?: string;
    editId?: string;
  }>();
  const editing = params.editId ? tasks.find((t) => t.id === params.editId) : undefined;
  /**
   * Asked to edit a task that isn't there any more — it was completed, deleted,
   * or the list was replaced while this screen sat open in the background.
   * Without this the screen silently became an empty "New task" form: the title
   * said the wrong thing, the fields were blank, and there was no way back to
   * whatever you were doing.
   */
  const lostTask = !!params.editId && !editing;
  const initialKind =
    editing?.kind ??
    (KIND_VALUES.includes(params.kind as TaskKind) ? (params.kind as TaskKind) : 'general');

  const [title, setTitle] = useState(editing?.title ?? params.title ?? '');
  const [kind, setKind] = useState<TaskKind>(initialKind);
  const [date, setDate] = useState(editing?.date ?? params.date ?? demoDate);
  const [priority, setPriority] = useState<Priority>(
    editing?.priority ??
      ((['low', 'medium', 'high'] as const).includes(params.priority as Priority)
        ? (params.priority as Priority)
        : 'medium'),
  );
  const [contactName, setContactName] = useState(editing?.contactName ?? params.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(
    editing?.contactEmail ?? params.contactEmail ?? '',
  );
  const [contactPhone, setContactPhone] = useState(
    editing?.contactPhone ?? params.contactPhone ?? '',
  );
  const [description, setDescription] = useState(editing?.description ?? '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(editing?.subtasks ?? []);
  const [method, setMethod] = useState<TaskMethod>(
    editing?.method ??
      (params.method as TaskMethod) ??
      defaultMethodFor(initialKind, !!(editing?.contactName ?? params.contactName)),
  );
  const [cardTemplateId, setCardTemplateId] = useState<string | undefined>(
    editing?.cardTemplateId,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | undefined>(editing?.photoUri);
  const [time, setTime] = useState<string | null>(editing?.time ?? params.time ?? null);
  const [alarm, setAlarm] = useState(editing?.alarm ?? false);

  // Only a method that ends in a message needs someone to send it to. "Just
  // remind me", "Plan the steps" and the assignment options ask for nothing.
  const showsContact = isMessageMethod(method);
  const contactLabel =
    kind === 'birthday' || kind === 'anniversary' ? "Who's it for?" : 'Who to contact (optional)';
  const methodOptions = methodOptionsFor(kind);

  // Keep the selected handling valid as the category changes.
  useEffect(() => {
    const opts = methodOptionsFor(kind);
    setMethod((m) => (opts.includes(m) ? m : defaultMethodFor(kind, contactName.trim().length > 0)));
    // Contact isn't a dependency — it no longer affects which options exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // What each way of handling it actually needs from Maya.
  const needsPhone = showsContact && (method === 'sms' || method === 'call');
  const isCard = method === 'card';
  const isPhoto = method === 'photo';
  const showsSubtasks = kind === 'assignment' || kind === 'project';
  // A call is only ever "who am I ringing" — nothing else to collect.
  const isCallMethod = method === 'call';

  // You can't schedule something into the past. Reported against each control
  // separately so the error sits next to whichever one caused it.
  const todayISO = realToday();
  const dateInPast = date < todayISO;
  const timeInPast = !dateInPast && date === todayISO && !!time && isPastMoment(date, time);
  // One exception: an existing overdue task whose date hasn't been touched.
  // Blocking that would trap you out of fixing a typo on anything late.
  const keepingOriginalDate = !!editing && date === editing.date;
  const momentPassed = (dateInPast || timeInPast) && !keepingOriginalDate;
  // A malformed address still blocks; a missing one doesn't. Aria opens Mail
  // either way and Maya picks the recipient there.
  const emailWellFormed = !contactEmail.trim() || isValidEmails(contactEmail);
  const canSave = title.trim().length > 0 && emailWellFormed && !momentPassed;

  /** Never leave the switch on when the OS won't let the alarm ring. */
  async function toggleAlarm(next: boolean) {
    setAlarm(next);
    if (!next) return;
    if (await ensureAlarmPermission()) return;
    setAlarm(false);
    Alert.alert(
      'Notifications are off',
      'Aria needs notification permission to chime. Turn it on for this app in your device Settings, then switch the alarm back on.',
    );
  }

  useEffect(() => {
    if (method === 'card' && !cardTemplateId) {
      setCardTemplateId(defaultTemplateFor(kind).id);
    }
  }, [method, kind, cardTemplateId]);

  function selectKind(k: TaskKind) {
    setKind(k);
    const m = defaultMethodFor(k, contactName.trim().length > 0);
    if (m) setMethod(m);
  }

  function save() {
    if (!canSave) return;
    const cleanSubtasks = showsSubtasks
      ? subtasks.filter((s) => s.title.trim().length > 0)
      : [];
    const fields = {
      title: title.trim(),
      date,
      priority,
      kind,
      description: description.trim() || undefined,
      contactName: showsContact ? contactName.trim() || undefined : undefined,
      contactEmail: showsContact && contactEmail.trim() ? contactEmail.trim() : undefined,
      contactPhone: showsContact && contactPhone.trim() ? contactPhone.trim() : undefined,
      method,
      cardTemplateId: method === 'card' ? cardTemplateId : undefined,
      photoUri: isPhoto ? photoUri : undefined,
      time: time ?? undefined,
      alarm: time && alarm ? true : undefined,
      subtasks: cleanSubtasks,
    };
    if (editing) {
      updateTask(editing.id, fields);
      showToast('Task updated', 'check');
    } else {
      addTask(fields);
    }
    router.back();
  }

  if (lostTask) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between pb-2 pt-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-border/60">
            <X size={22} color={c.ink} />
          </Pressable>
          <Text variant="subtitle">Task not found</Text>
          <View className="w-10" />
        </View>

        <View className="flex-1 items-center justify-center gap-5 px-6">
          <SearchX size={30} color={c.faint} />
          <Text tone="muted" className="text-center leading-6">
            I can&apos;t find that task any more. It may have been completed or deleted while this
            was open.
          </Text>
          <View className="w-full gap-2">
            <Button title="Back to my tasks" block onPress={() => router.replace('/(tabs)/tasks')} />
            <Button
              title="Start a new task"
              variant="secondary"
              block
              onPress={() => router.replace('/task/new')}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-border/60">
          <X size={22} color={c.ink} />
        </Pressable>
        <Text variant="subtitle">{editing ? 'Edit task' : 'New task'}</Text>
        <View className="w-10" />
      </View>

      <ScrollView
          className="flex-1"
          // 28 rather than 20: seven labelled sections stacked down one form, so
          // each needs enough air to read as its own question rather than as a
          // continuous list of fields.
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 28 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORY_KINDS.map((k) => {
                // The Event chip stands in for the whole family, so it stays lit
                // — and wears the occasion's icon — while a birthday is selected.
                const active = k.value === 'event' ? isEventKind(kind) : kind === k.value;
                const Icon = KIND_ICON[k.value === 'event' && active ? kind : k.value];
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => selectKind(k.value === 'event' && active ? kind : k.value)}
                    className={cn(
                      'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <Icon size={16} color={active ? c.accent : c.muted} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {isEventKind(kind) ? (
            <View className="gap-2">
              <Text variant="label" tone="muted">
                Occasion
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {EVENT_OCCASIONS.map((o) => {
                  const on = kind === o.value;
                  const Icon = KIND_ICON[o.value];
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => selectKind(o.value)}
                      className={cn(
                        'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                        on ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                      )}>
                      <Icon size={16} color={on ? c.accent : c.muted} />
                      <Text
                        variant="small"
                        tone={on ? 'accent' : 'muted'}
                        className="font-semibold">
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Input
            label="What needs doing?"
            placeholder="e.g. Wish Jane a happy birthday"
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Date
            </Text>
            <SimulatedDateBanner />
            <MonthCalendar value={date} onSelect={setDate} />
            {dateInPast && !keepingOriginalDate ? (
              <InlineError>
                {`${formatFull(date)} has already passed. Pick today or a later date.`}
              </InlineError>
            ) : null}
          </View>

          <TimeField value={time} onChange={setTime} />

          {/* The alarm switch only exists once there's a time to ring at — say so,
              rather than leaving a reminder that quietly never chimes. */}
          {!time && kind === 'reminder' ? (
            <Text variant="caption" tone="muted" className="-mt-3">
              Set a time above and I can chime to remind you.
            </Text>
          ) : null}

          {timeInPast && !keepingOriginalDate ? (
            <InlineError className="-mt-3">
              {`${formatTime(time!)} has already passed today. Pick a later time, or move this to another day.`}
            </InlineError>
          ) : null}

          {time ? (
            <View className="gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <AlarmClock size={18} color={alarm ? c.accent : c.muted} />
                  <Text variant="label" tone={alarm ? 'accent' : 'muted'}>
                    Alarm
                  </Text>
                </View>
                <Switch value={alarm} onValueChange={toggleAlarm} />
              </View>
              {alarm ? (
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" tone="faint">
                    Aria will chime at {formatTime(time)}.
                  </Text>
                  <Pressable
                    onPress={() => runPreview(title.trim() || 'Task reminder')}
                    hitSlop={8}
                    className="active:opacity-60">
                    <Text variant="caption" tone="accent" className="font-semibold">
                      Preview chime
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Priority
            </Text>
            <View className="flex-row gap-2">
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    className={cn(
                      'flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <View className={cn('h-2.5 w-2.5 rounded-full', p.dot)} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* One option is not a choice — a reminder skips the question. */}
          {methodOptions.length > 1 ? (
            <View className="gap-2">
              <Text variant="label" tone="muted">
                How should Aria handle it?
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {methodOptions.map((m) => {
                  const active = method === m;
                  const Icon = METHOD_ICONS[m];
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMethod(m)}
                      className={cn(
                        'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                      )}>
                      <Icon size={16} color={active ? c.accent : c.muted} />
                      <Text
                        variant="small"
                        tone={active ? 'accent' : 'muted'}
                        className="font-semibold">
                        {METHOD_LABELS[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text variant="caption" tone="muted" className="leading-5">
              I&apos;ll just remind you at the time you set. Nothing to draft or send.
            </Text>
          )}

          {showsContact ? (
            <ContactField
              label={contactLabel}
              name={contactName}
              onName={setContactName}
              email={contactEmail}
              onEmail={setContactEmail}
              phone={contactPhone}
              onPhone={setContactPhone}
              requireEmail={false}
              needsPhone={needsPhone}
              phoneOnly={isCallMethod}
            />
          ) : null}

          {isPhoto ? <PhotoField value={photoUri} onChange={setPhotoUri} /> : null}

          {isCard ? (
            <CardPicker
              kind={kind}
              value={cardTemplateId}
              onSelect={setCardTemplateId}
              toName={contactName}
            />
          ) : null}

          {showsContact && method === 'call' ? (
            <View className="flex-row items-start gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3">
              <Phone size={15} color={c.muted} style={{ marginTop: 1 }} />
              <Text variant="caption" tone="muted" className="flex-1 leading-5">
                I&apos;ll remind you when it&apos;s time, and open your dialer with the number
                ready. Tapping call is yours to make.
              </Text>
            </View>
          ) : null}

          {isPhoto ? (
            <CardMessageField
              kind={kind}
              title={title}
              contactName={contactName}
              value={description}
              onChange={setDescription}
              label="Message to send with it"
            />
          ) : isCard ? (
            <>
              <CardMessageField
                kind={kind}
                title={title}
                contactName={contactName}
                value={description}
                onChange={setDescription}
              />
              <Pressable
                onPress={() => setPreviewOpen(true)}
                className="flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 active:opacity-70">
                <Eye size={17} color={c.accent} />
                <Text tone="accent" className="font-semibold">
                  Preview card
                </Text>
              </Pressable>
            </>
          ) : !isCallMethod ? (
            <Input
              label="Notes (optional)"
              placeholder="Any detail that helps…"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          ) : null}

          {/* Breaking work into parts only makes sense for something you sit
              down and do. A text or a call is a single act. */}
          {showsSubtasks ? (
            <View className="gap-2">
              <Text variant="label" tone="muted">
                Subtasks (optional)
              </Text>
              <View className="gap-2">
                {subtasks.map((st, i) => (
                  <View key={st.id} className="flex-row items-center gap-2">
                    <TextInput
                      value={st.title}
                      onChangeText={(text) =>
                        setSubtasks((prev) =>
                          prev.map((s) => (s.id === st.id ? { ...s, title: text } : s)),
                        )
                      }
                      placeholder={`Step ${i + 1}`}
                      placeholderTextColor={c.faint}
                      className="h-11 flex-1 rounded-2xl border border-border bg-surface px-4 text-base text-ink"
                    />
                    <Pressable
                      onPress={() => setSubtasks((prev) => prev.filter((s) => s.id !== st.id))}
                      hitSlop={8}
                      className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
                      <X size={18} color={c.muted} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => setSubtasks((prev) => [...prev, newDraftSubtask()])}
                  className="flex-row items-center gap-2 self-start rounded-full px-2 py-1.5 active:opacity-60">
                  <Plus size={18} color={c.accent} />
                  <Text variant="small" tone="accent" className="font-semibold">
                    Add subtask
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

      </ScrollView>

      <CardPreview
        visible={previewOpen && isCard}
        onClose={() => setPreviewOpen(false)}
        templateId={cardTemplateId}
        toName={contactName}
        message={description}
        fromName={profileName}
      />

        <View className="border-t border-border px-5 pb-6 pt-3">
          <Button
            title={editing ? 'Save changes' : 'Save task'}
            block
            size="lg"
            disabled={!canSave}
            onPress={save}
          />
        </View>
    </Screen>
  );
}
