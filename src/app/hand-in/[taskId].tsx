import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, FileText, PenLine, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ContactField } from '@/components/contact-field';
import { HeaderButton } from '@/components/header-button';
import { InlineError } from '@/components/inline-error';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { assemble, factsFromSections } from '@/lib/assemble';
import { toRunAt } from '@/lib/automations';
import { useColors } from '@/lib/colors';
import { effectiveToday, formatFull, formatTime, isPastMoment } from '@/lib/dates';
import { hapticSuccess } from '@/lib/haptics';
import { isValidEmails } from '@/lib/contacts';
import { showToast } from '@/lib/toast';
import { ASSEMBLED_SECTION } from '@/lib/work-runner';
import { useAriaStore } from '@/store/aria-store';

/**
 * Putting finished work down until the day it is needed.
 *
 * The walkthrough used to end on "Mark complete", which is the wrong question.
 * An essay written on Tuesday is not finished on Tuesday: it is *done*, and
 * still has to be handed in on Friday. Ticking it off closes the one thing that
 * would have reminded anybody, and the work sits in a completed list until the
 * deadline has gone.
 *
 * So the ending is a scheduling screen instead. It asks for the day and the
 * hour, takes a note for the moment, and offers to send the thing itself by
 * email when the day comes.
 *
 * ── Why the summary is at the top ───────────────────────────────────────────
 *
 * Because this is the last look. Somebody scheduling work for Friday is
 * agreeing that what exists now is what goes out then, and they cannot agree to
 * that without seeing it: how many steps were finished, how long the document
 * is, whether anything is still open. "Make changes" goes back to the work
 * rather than pretending this screen can fix it.
 */
export default function HandInScreen() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = useAriaStore((s) => s.tasks.find((t) => t.id === taskId));
  const profile = useAriaStore((s) => s.profile);
  const demoDate = useAriaStore((s) => s.demoDate);
  const updateTask = useAriaStore((s) => s.updateTask);
  const scheduleAutomation = useAriaStore((s) => s.scheduleAutomation);

  const [date, setDate] = useState(task?.date ?? demoDate);
  const [time, setTime] = useState<string | null>(task?.time ?? '09:00');
  const [note, setNote] = useState('');
  const [byEmail, setByEmail] = useState(false);
  const [name, setName] = useState(task?.contactName ?? '');
  const [email, setEmail] = useState(task?.contactEmail ?? '');
  const [phone, setPhone] = useState(task?.contactPhone ?? '');

  /** The document as it stands, which is what would actually go out. */
  const document = useMemo(() => {
    if (!task) return null;
    const sections = (task.draftSections ?? []).filter((s) => s.title !== ASSEMBLED_SECTION);
    return assemble({
      title: task.title,
      author: profile.name,
      context: profile.context,
      deadline: date,
      facts: factsFromSections(sections),
      sections,
      steps: task.subtasks,
    });
  }, [task, profile.name, profile.context, date]);

  if (!task || !document) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <HeaderButton icon={X} onPress={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <Text tone="muted">This task no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  // Two ways a moment is already gone: the real clock has passed it, or the
  // demo is simulating a later day. Both would schedule something into the past.
  const past = date < effectiveToday(demoDate) || isPastMoment(date, time);
  const emailReady = !byEmail || isValidEmails(email);
  const canSave = !past && emailReady;

  const done = task.subtasks.filter((s) => s.done).length;

  function save() {
    if (!canSave || !task) return;

    /*
     * The day itself, with an alarm on it.
     *
     * This is the reminder the whole screen exists to create: the task moves to
     * the day it matters and chimes at the hour, rather than being ticked off
     * days early and forgotten.
     */
    updateTask(task.id, {
      date,
      time: time ?? undefined,
      alarm: Boolean(time),
      // The note is kept with the task rather than in the alarm, so it is still
      // there when somebody opens it, which is when they need it.
      description: note.trim()
        ? [task.description?.trim(), note.trim()].filter(Boolean).join('\n\n')
        : task.description,
    });

    /*
     * And the send, when they asked for one.
     *
     * Scheduled rather than sent now: the point is that it goes out on the day,
     * with the document as it will stand then. Email is the only channel a
     * server can complete alone, which is why this screen offers it and not a
     * text.
     */
    if (byEmail && time) {
      scheduleAutomation({
        taskId: task.id,
        taskTitle: task.title,
        channel: 'email',
        runAt: toRunAt(date, time),
        subject: task.title,
        body: document!.body,
        toName: name.trim() || undefined,
        toEmail: email.trim(),
      });
    }

    hapticSuccess();
    showToast(
      byEmail
        ? `Sending ${formatFull(date)}${time ? ` at ${formatTime(time)}` : ''}`
        : `Back on your list ${formatFull(date)}${time ? ` at ${formatTime(time)}` : ''}`,
      'clock',
    );
    router.dismissAll?.();
    router.replace(`/task/${task.id}`);
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle" className="flex-1">
          Schedule for later
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* The last look at what is being put down, before it is put down. */}
        <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <FileText size={15} color={c.accent} />
            <Text variant="label" tone="accent">
              What you have
            </Text>
          </View>
          <Text variant="heading" numberOfLines={2}>
            {task.title}
          </Text>
          <Text variant="small" tone="muted">
            {document.words} words
            {document.targetWords ? ` of ${document.targetWords}` : ''}
            {task.subtasks.length ? ` · ${done}/${task.subtasks.length} steps done` : ''}
          </Text>

          {document.warnings.length ? (
            <View className="gap-1 pt-1">
              {document.warnings.map((w) => (
                <Text key={w} variant="caption" tone="danger" className="leading-5">
                  {w}
                </Text>
              ))}
            </View>
          ) : (
            <Text variant="caption" tone="muted">
              Nothing looks missing.
            </Text>
          )}

          {/* Changes happen where the work is, not here. */}
          <Button
            title="Make changes"
            variant="secondary"
            size="sm"
            leftIcon={<PenLine size={15} color={c.ink} />}
            onPress={() => router.replace(`/task/${task.id}`)}
            className="mt-1"
          />
        </View>

        <View className="gap-2">
          <Text variant="label" tone="muted">
            Which day
          </Text>
          <MonthCalendar value={date} onSelect={setDate} />
        </View>

        <TimeField value={time} onChange={setTime} />

        {past ? (
          <InlineError className="-mt-3">
            {`${time ? `${formatTime(time)} on ${formatFull(date)}` : formatFull(date)} has already passed. Pick a later day or time.`}
          </InlineError>
        ) : null}

        <Input
          label="Anything to remember (optional)"
          placeholder="Print two copies, submit through the portal…"
          value={note}
          onChangeText={setNote}
          multiline
        />

        {/*
          The send, offered rather than assumed.

          Some work goes to a person on the day: a tutor, a supervisor, a
          submission address. Email is the one channel a server can finish with
          nobody watching, which is why it is here and a text is not.
        */}
        <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-1">
              <Text className="font-strong">Email it that day</Text>
              <Text variant="small" tone="muted">
                {byEmail
                  ? 'I send the document at the time above, then tell you it has gone.'
                  : 'Off. It comes back on your list and you decide then.'}
              </Text>
            </View>
            <Switch value={byEmail} onValueChange={setByEmail} />
          </View>

          {byEmail ? (
            <>
              <ContactField
                label="Who to"
                name={name}
                onName={setName}
                email={email}
                onEmail={setEmail}
                phone={phone}
                onPhone={setPhone}
                requireEmail
                needsPhone={false}
              />
              {!time ? (
                <InlineError>Pick a time as well, so I know when to send it.</InlineError>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
        <Button
          title={byEmail ? 'Schedule the send' : 'Schedule it'}
          block
          size="lg"
          disabled={!canSave || (byEmail && !time)}
          leftIcon={<CheckCircle2 size={18} color={c.accentInk} />}
          onPress={save}
        />
        <Button title="Not now" variant="ghost" size="sm" block onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
