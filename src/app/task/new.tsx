import { router, useLocalSearchParams, type Href } from 'expo-router';
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
  Repeat2,
  SearchX,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useReducer, useRef, useState } from 'react';
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
import { goBack } from '@/lib/nav';
import {
  CATEGORY_BLURB,
  CATEGORY_KINDS,
  TITLE_FIELD,
  EVENT_OCCASIONS,
  isEventKind,
  isMessageMethod,
  METHOD_LABELS,
  methodOptionsFor,
  TASK_KINDS,
} from '@/lib/aria-actions';
import { cn } from '@/lib/cn';
import { INSTRUCTION_SECTION, ownInstruction } from '@/lib/sections';
import { isWorkKind } from '@/lib/task-flow';
import { isValidEmails } from '@/lib/contacts';
import { defaultTemplateFor } from '@/lib/cards';
import {
  REPEAT_LABEL,
  REPEAT_OPTIONS,
  effectiveToday,
  formatFull,
  formatTime,
  isPastMoment,
  msUntilMoment,
  type Repeat,
} from '@/lib/dates';
import { hapticSelect, hapticWarning } from '@/lib/haptics';
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
  other: PenLine,
};

const KIND_VALUES: TaskKind[] = TASK_KINDS.map((k) => k.value);

export default function NewTaskScreen() {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const addTask = useAriaStore((s) => s.addTask);
  const updateTask = useAriaStore((s) => s.updateTask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const removeDraftSection = useAriaStore((s) => s.removeDraftSection);
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
   * Asked to edit a task that isn't there any more, it was completed, deleted,
   * or the list was replaced while this screen sat open in the background.
   * Without this the screen silently became an empty "New task" form: the title
   * said the wrong thing, the fields were blank, and there was no way back to
   * whatever you were doing.
   */
  const lostTask = !!params.editId && !editing;
  const initialKind =
    editing?.kind ??
    // 'reminder', not 'general': Task is no longer an offered category, so
    // defaulting to it would open the screen with nothing selected.
    (KIND_VALUES.includes(params.kind as TaskKind) ? (params.kind as TaskKind) : 'reminder');

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
  /** Their own instruction, when "Something else" is the answer. */
  const [instruction, setInstruction] = useState(ownInstruction(editing?.draftSections));
  /*
   * Kept, though nothing on this screen edits them any more.
   *
   * Editing an existing assignment has to preserve the steps it already has:
   * dropping the state would mean opening a task to fix a typo and saving its
   * plan away.
   */
  const [subtasks] = useState<Subtask[]>(editing?.subtasks ?? []);
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
  const [repeat, setRepeat] = useState<Repeat | undefined>(editing?.repeat);

  // Only a method that ends in a message needs someone to send it to. "Just
  // remind me", "Plan the steps" and the assignment options ask for nothing.
  const showsContact = isMessageMethod(method);
  const contactLabel =
    kind === 'birthday' || kind === 'anniversary' ? "Who's it for?" : 'Who to contact (optional)';
  const methodOptions = methodOptionsFor(kind);
  /**
   * A new piece of work: the form is a way in, not a record to fill.
   *
   * Editing is excluded because an assignment already underway is being
   * corrected, not started, and dropping somebody into the walkthrough because
   * they fixed a typo in the title would be an ambush.
   */
  const startsWork = isWorkKind(kind) && !editing;

  // Keep the selected handling valid as the category changes.
  useEffect(() => {
    const opts = methodOptionsFor(kind);
    setMethod((m) => (opts.includes(m) ? m : defaultMethodFor(kind, contactName.trim().length > 0)));
    // Contact isn't a dependency, it no longer affects which options exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // What each way of handling it actually needs from Maya.
  const needsPhone = showsContact && (method === 'sms' || method === 'call');
  const isCard = method === 'card';
  const isPhoto = method === 'photo';
  const showsSubtasks = kind === 'assignment' || kind === 'project';
  // A call is only ever "who am I ringing", nothing else to collect.
  const isCallMethod = method === 'call';
  /*
   * A text or an email needs writing too.
   *
   * Only cards and pictures got the drafting field, so a birthday sent as a
   * text offered a plain "Notes" box here and Aria's "shall I draft it?" turned
   * up afterwards, on the offer card on Today. Writing the thing is part of
   * setting it up, not a follow-up question on another screen.
   */
  const isWrittenMessage = method === 'sms' || method === 'email';

  // You can't schedule something into the past. Reported against each control
  // separately so the error sits next to whichever one caused it.
  // The simulated day when the demo is running ahead, the real one otherwise , 
  // otherwise a date the calendar already draws as overdue saves without a word.
  const todayISO = effectiveToday(demoDate);
  const dateInPast = date < todayISO;
  // The `date === todayISO` this used to carry was redundant, not load-bearing:
  // a later date can't be a past moment, and an earlier one is already caught by
  // `dateInPast`. `isPastMoment` compares against the real clock and is the
  // whole answer on its own.
  const timeInPast = !dateInPast && !!time && isPastMoment(date, time);
  /**
   * Has the moment been touched, or is it just the one this task already had?
   *
   * The exception exists so an overdue task stays editable: you should be able
   * to fix a typo on something late without first rescheduling it. But it was
   * keyed on the date alone, so on an existing task the time was never checked
   *, toggle a time on, or move it, and a moment that had already gone was
   * accepted in silence.
   *
   * Touching *either* half is the signal. Leave both alone and nothing nags;
   * change one and the moment is yours now, so it gets validated properly.
   */
  const movedTheMoment =
    !editing || date !== editing.date || time !== (editing.time ?? null);
  const momentPassed = (dateInPast || timeInPast) && movedTheMoment;
  // A malformed address still blocks; a missing one doesn't. Aria opens Mail
  // either way and Maya picks the recipient there.
  const emailWellFormed = !contactEmail.trim() || isValidEmails(contactEmail);

  /**
   * Whether Save has been pressed on an incomplete form.
   *
   * Nothing is marked wrong until then. Reporting a missing title to someone
   * who has only just opened the form is scolding them for not having finished
   * yet, the moment they ask to save is the moment it becomes true.
   *
   * The errors below are derived from the values rather than stored, so each
   * one clears itself as soon as its field is filled in.
   */
  const [attemptedSave, setAttemptedSave] = useState(false);
  const titleRef = useRef<TextInput>(null);

  /**
   * Wake up the moment a chosen time goes by.
   *
   * Validity here changes on its own as the clock moves, which nothing else in
   * the form does. Without this, a time picked at 14:59 for 15:00 was still
   * showing as fine at 15:01, and worse, `canSave` in the Save button's
   * closure was still `true`, so it saved a moment that had already passed.
   *
   * One timer to the exact instant rather than a poll, and skipped entirely for
   * anything far enough out that `setTimeout` would overflow its 32-bit delay
   * and fire immediately.
   */
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!time) return;
    const ms = msUntilMoment(date, time);
    if (ms <= 0 || ms > 2_147_483_000) return;
    const id = setTimeout(tick, ms + 250);
    return () => clearTimeout(id);
  }, [date, time]);

  /**
   * What this task still needs.
   *
   * The rule is the one the labels already promise: anything whose label says
   * "(optional)" stays optional, and everything else on screen has to be filled
   * in before the task can be saved. Each entry is scoped to the shape of task
   * being created, so a call never demands an email and a reminder never
   * demands a recipient.
   */
  const titleMissing = title.trim().length === 0;
  /*
   * "Something else" is only an option if the something is actually said.
   *
   * Choosing it and leaving the box empty would have Aria guess, which is the
   * one thing this option exists to stop.
   */
  const ownWords = method === 'other';
  const instructionMissing = ownWords && instruction.trim().length === 0;
  // A call collapses the contact block down to just a number, there is no name
  // or email field on screen to require.
  const needsContactName =
    showsContact && !isCallMethod && (kind === 'birthday' || kind === 'anniversary');
  const needsEmail = showsContact && !isCallMethod && method === 'email';
  const needsMessage = isCard || isPhoto;

  const contactNameMissing = needsContactName && contactName.trim().length === 0;
  const emailMissing = needsEmail && contactEmail.trim().length === 0;
  const phoneMissing = needsPhone && contactPhone.trim().length === 0;
  const messageMissing = needsMessage && description.trim().length === 0;
  const photoMissing = isPhoto && !photoUri;

  const anythingMissing =
    titleMissing ||
    instructionMissing ||
    contactNameMissing ||
    emailMissing ||
    phoneMissing ||
    messageMissing ||
    photoMissing;

  // Shown only once Save has been pressed, and derived from the values, so each
  // clears itself the moment its field is filled.
  const show = (missing: boolean, message: string) =>
    attemptedSave && missing ? message : undefined;

  const titleError = show(titleMissing, 'Give the task a name so you can find it later.');
  const instructionError = show(
    instructionMissing,
    'Say what you want done, and I will follow it exactly.',
  );
  const contactNameError = show(contactNameMissing, 'Who is this for?');
  const emailError = show(emailMissing, 'Add the address to send this to.');
  const phoneError = show(phoneMissing, 'Add a number so Aria can reach them.');
  const messageError = show(messageMissing, 'Write the message to send with it.');
  const photoError = show(photoMissing, 'Choose a photo to send.');

  const canSave = !anythingMissing && emailWellFormed && !momentPassed;

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
    if (!canSave) {
      // Previously the button was simply disabled, so this press did nothing at
      // all: no error, no movement, no explanation. Mark the form as attempted
      // so the offending fields turn red, and put the cursor in the one that
      // needs typing.
      setAttemptedSave(true);
      hapticWarning();
      if (titleMissing) titleRef.current?.focus();
      return;
    }
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
      repeat,
      subtasks: cleanSubtasks,
    };
    /*
     * The instruction travels as a section, because sections sync.
     *
     * Same reasoning as the working draft in lib/sections.ts: it is the only
     * part of a task that reaches the server without a migration nobody can run
     * from here, and it is reserved, so it never turns up inside the work.
     */
    const saveInstruction = (id: string) => {
      if (ownWords && instruction.trim()) {
        addDraftSection(id, { title: INSTRUCTION_SECTION, content: instruction.trim() });
      } else {
        removeDraftSection(id, INSTRUCTION_SECTION);
      }
    };

    if (editing) {
      updateTask(editing.id, fields);
      saveInstruction(editing.id);
      showToast('Task updated', 'check');
    } else {
      const id = addTask(fields);
      saveInstruction(id);
      /*
       * Straight into the work, rather than back to a list.
       *
       * This is the whole point of the shorter form: an assignment set up and
       * then dropped onto a list is a plan nobody started. `/aria/[taskId]` is
       * the screen that already works through a piece of work step by step, so
       * beginning is a navigation rather than a new surface.
       */
      if (startsWork) {
        router.replace(`/aria/${id}` as Href);
        return;
      }
    }
    goBack();
  }

  if (lostTask) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between pb-2 pt-2">
          <Pressable
            onPress={() => goBack()}
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

  /*
   * ── One control, two positions ────────────────────────────────────────────
   *
   * Work asks how it should be handled first; everything else asks it late.
   * Writing the JSX twice is how two copies drift, one gains an option or a
   * label and the other quietly does not, so it is named once and placed twice.
   */
  const handlingSection = (
    <>
            {/* One option is not a choice, a reminder skips the question. */}
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
                          className="font-strong">
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

            {/*
              Their words, kept as they wrote them.

              The other three options tell Aria the shape of the help. This one
              tells it the task, so the box is not a hint or a preference: it is
              the instruction, and it is followed to the letter. Anything Aria
              genuinely needs and has not been told, it asks for rather than
              deciding on somebody's behalf.
            */}
            {ownWords ? (
              <Input
                label="What should I do?"
                placeholder="Turn my notes into a 10 slide deck, one idea per slide, no more than 20 words a slide"
                value={instruction}
                onChangeText={setInstruction}
                multiline
                style={{ minHeight: 96 }}
                error={instructionError}
              />
            ) : null}
    </>
  );

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Pressable onPress={() => goBack()} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-border/60">
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
            {/*
              Tiles with a line each, not a row of pills.

              Assignment and Project were two words of equal length and equal
              weight, and nothing on the screen said which one a piece of work
              belonged in, so the choice was a coin toss that changes the whole
              flow behind it. A tile has room for the sentence that decides it;
              a pill does not. `CATEGORY_BLURB` holds the wording.
            */}
            <View className="flex-row flex-wrap gap-2">
              {CATEGORY_KINDS.map((k) => {
                // The Event tile stands in for the whole family, so it stays lit
                //, and wears the occasion's icon, while a birthday is selected.
                const active = k.value === 'event' ? isEventKind(kind) : kind === k.value;
                const Icon = KIND_ICON[k.value === 'event' && active ? kind : k.value];
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => selectKind(k.value === 'event' && active ? kind : k.value)}
                    className={cn(
                      'w-[48%] flex-1 gap-1 rounded-2xl border p-3',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}
                    style={{ minWidth: '46%' }}>
                    <View className="flex-row items-center gap-2">
                      <Icon size={16} color={active ? c.accent : c.muted} />
                      <Text
                        variant="small"
                        tone={active ? 'accent' : 'muted'}
                        className="font-strong">
                        {k.label}
                      </Text>
                    </View>
                    <Text variant="caption" tone="faint">
                      {CATEGORY_BLURB[k.value]}
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
                        className="font-strong">
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Input
            ref={titleRef}
            label={TITLE_FIELD[kind].label}
            placeholder={TITLE_FIELD[kind].example}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
            error={titleError}
          />

          {/*
            Work is asked how it should be handled before it is asked when.

            The method decides what the rest of the screen is for: "step by
            step" makes it a breakdown, "draft it" makes it something Aria
            writes. A calendar first puts the least consequential question in
            front of the one that changes everything after it, which is the
            order an event needs and not this one.
          */}
          {isWorkKind(kind) ? handlingSection : null}

          {/*
            ── Work is not scheduled here ──────────────────────────────────────

            A date, a time, a repeat, a priority and a notes box are the
            questions you ask about something that happens *at* a moment. A
            piece of work does not happen at a moment: it gets done over days
            and then handed in, and the handing in is what has a time.

            Asking for all of it up front is what made setting up an assignment
            feel like filling in a form before being allowed to start. So work
            asks two things, what it is and how much help you want, and then
            begins. When it is ready, the task screen is where you pick the day
            and time to push it out.
          */}
          {isWorkKind(kind) ? null : (
          <>
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Date
            </Text>
            <SimulatedDateBanner />
            <MonthCalendar value={date} onSelect={setDate} />
            {dateInPast && movedTheMoment ? (
              <InlineError>
                {`${formatFull(date)} has already passed. Pick today or a later date.`}
              </InlineError>
            ) : null}
          </View>

          <TimeField value={time} onChange={setTime} />

          {/* The alarm switch only exists once there's a time to ring at, say so,
              rather than leaving a reminder that quietly never chimes. */}
          {!time && kind === 'reminder' ? (
            <Text variant="caption" tone="muted" className="-mt-3">
              Set a time above and I can chime to remind you.
            </Text>
          ) : null}

          {timeInPast && movedTheMoment ? (
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
                    <Text variant="caption" tone="accent" className="font-strong">
                      Preview chime
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Repeat sits with date, time and alarm because it's the last part
              of "when", and off by default, since most tasks happen once. */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Repeat2 size={18} color={repeat ? c.accent : c.muted} />
                <Text variant="label" tone={repeat ? 'accent' : 'muted'}>
                  Repeats
                </Text>
              </View>
              <Switch
                value={!!repeat}
                onValueChange={(on) => {
                  hapticSelect();
                  // Weekly is the interval people mean most often, and starting
                  // from nothing selected would make the switch do nothing
                  // visible until a second tap.
                  setRepeat(on ? (editing?.repeat ?? 'weekly') : undefined);
                }}
              />
            </View>

            {repeat ? (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {REPEAT_OPTIONS.map((o) => {
                    const active = repeat === o.value;
                    return (
                      <Pressable
                        key={o.value}
                        onPress={() => {
                          hapticSelect();
                          setRepeat(o.value);
                        }}
                        className={cn(
                          'rounded-xl border px-3.5 py-2',
                          active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                        )}>
                        <Text
                          variant="small"
                          tone={active ? 'accent' : 'muted'}
                          className="font-strong">
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" tone="faint">
                  {time
                    ? `Tick this off and the next one appears for ${formatTime(time)}, ${REPEAT_LABEL[repeat].toLowerCase()}.`
                    : `Tick this off and the next one appears, ${REPEAT_LABEL[repeat].toLowerCase()}.`}
                </Text>
              </>
            ) : null}
          </View>

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
                      className="font-strong">
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>


          {isWorkKind(kind) ? null : handlingSection}

          {showsContact ? (
            <ContactField
              label={contactLabel}
              name={contactName}
              onName={setContactName}
              email={contactEmail}
              onEmail={setContactEmail}
              phone={contactPhone}
              onPhone={setContactPhone}
              requireEmail={needsEmail}
              needsPhone={needsPhone}
              phoneOnly={isCallMethod}
              nameError={contactNameError}
              emailError={emailError}
              phoneError={phoneError}
            />
          ) : null}

          {isPhoto ? (
            <PhotoField value={photoUri} onChange={setPhotoUri} error={photoError} />
          ) : null}

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
              error={messageError}
            />
          ) : isCard ? (
            <>
              <CardMessageField
                kind={kind}
                title={title}
                contactName={contactName}
                value={description}
                onChange={setDescription}
                error={messageError}
              />
              <Pressable
                onPress={() => setPreviewOpen(true)}
                className="flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 active:opacity-70">
                <Eye size={17} color={c.accent} />
                <Text tone="accent" className="font-strong">
                  Preview card
                </Text>
              </Pressable>
            </>
          ) : isWrittenMessage ? (
            <CardMessageField
              kind={kind}
              title={title}
              contactName={contactName}
              value={description}
              onChange={setDescription}
              label={method === 'email' ? 'What the email says' : 'What the message says'}
            />
          ) : !isCallMethod ? (
            <Input
              label="Notes (optional)"
              placeholder="Any detail that helps…"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          ) : null}
          </>
          )}

          {/*
            The subtask list is gone from setting up.

            It only ever appeared for an assignment or a project, and those are
            exactly the two that now get broken down properly: Aria reads the
            brief, plans backwards from the deadline and produces steps that
            carry a date and what forces them. Typing a few titles by hand
            before any of that has happened produces a worse list that the plan
            then has to reconcile with, and it asked for work at the moment
            somebody was trying to start work.

            Steps still exist and are still editable, on the task, where they
            arrive with dates attached.
          */}

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
          {/* Deliberately not disabled when the form is incomplete. A dead
              button gives no reason and nothing to press against; `save` turns
              the press into an explanation instead. */}
          <Button
            title={editing ? 'Save changes' : startsWork ? 'Start working on it' : 'Save task'}
            block
            size="lg"
            onPress={save}
          />
        </View>
    </Screen>
  );
}
