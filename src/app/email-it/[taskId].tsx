import { router, useLocalSearchParams } from 'expo-router';
import { CalendarClock, Send, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { InlineError } from '@/components/inline-error';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { toRunAt } from '@/lib/automations';
import { goBack } from '@/lib/nav';
import { useColors } from '@/lib/colors';
import { isValidEmails } from '@/lib/contacts';
import { effectiveToday, formatFull, formatTime, isPastMoment } from '@/lib/dates';
import { sectionsToText } from '@/lib/export';
import { hapticSuccess } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { ASSEMBLED_SECTION, writtenSections } from '@/lib/sections';
import { useAriaStore } from '@/store/aria-store';

/**
 * Sending finished work to somebody, in the fewest questions that can do it.
 *
 * ── Why this is not the general schedule screen ─────────────────────────────
 *
 * That one has to cover texts, cards and WhatsApp as well, so it opens with a
 * channel picker, asks for a name and a phone number, and carries a Pro pitch.
 * Every one of those is noise here: the channel is email because the button
 * said email, the recipient is an address, and a tutor does not need a first
 * name to receive an essay.
 *
 * What is left is what an email actually needs. Who it goes to, what it says on
 * the subject line, what it says in the body, and a button that commits it.
 *
 * ── When it goes ────────────────────────────────────────────────────────────
 *
 * Stated as a sentence rather than asked as a question. The task already has
 * the day this work is due, and the whole point of scheduling is that it lands
 * then. Asking again would be asking somebody to repeat themselves, and hiding
 * it would be worse: a scheduled send whose moment is not on screen is a thing
 * people assume went out immediately. "Change" is there for the case where the
 * deadline is not the moment, and it stays folded away until it is wanted.
 */
export default function EmailItScreen() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = useAriaStore((s) => s.tasks.find((t) => t.id === taskId));
  const demoDate = useAriaStore((s) => s.demoDate);
  const scheduleAutomation = useAriaStore((s) => s.scheduleAutomation);

  const [email, setEmail] = useState(task?.contactEmail ?? '');
  const [subject, setSubject] = useState(task?.title ?? '');

  /*
   * The document, if one has been assembled, and everything written otherwise.
   *
   * `draftSections[0]` was the old default and is the wrong thing to send: on
   * finished work it is the brief or an early paragraph, never the piece.
   */
  const initialBody = useMemo(() => {
    const assembled = (task?.draftSections ?? []).find((s) => s.title === ASSEMBLED_SECTION);
    return assembled ? assembled.content : sectionsToText(writtenSections(task?.draftSections));
  }, [task?.draftSections]);
  const [body, setBody] = useState(initialBody);

  const [date, setDate] = useState(task?.date ?? demoDate);
  const [time, setTime] = useState<string | null>(task?.time ?? '09:00');
  const [changing, setChanging] = useState(false);

  if (!task) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <HeaderButton icon={X} onPress={() => goBack('/(tabs)/tasks')} />
        <View className="flex-1 items-center justify-center">
          <Text tone="muted">This task no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  // Two ways a moment is already gone: the real clock has passed it, or the
  // demo is standing on a later day. Both would schedule a send into the past.
  const past = date < effectiveToday(demoDate) || isPastMoment(date, time);
  const ready = isValidEmails(email) && body.trim().length > 0 && !!time && !past;

  function send() {
    if (!ready || !time || !task) return;

    scheduleAutomation({
      taskId: task.id,
      taskTitle: task.title,
      channel: 'email',
      runAt: toRunAt(date, time),
      subject: subject.trim() || task.title,
      body: body.trim(),
      toEmail: email.trim(),
    });

    hapticSuccess();
    showToast(`Sending ${formatFull(date)} at ${formatTime(time)}`, 'clock');
    /*
     * Only dismiss what is actually there.
     *
     * `dismissAll` throws the same "not handled by any navigator" error as a
     * back with nothing behind it, and the optional call guards a missing
     * method rather than an empty stack. Arriving here from a notification is
     * exactly the case where the stack is one deep.
     */
    if (router.canGoBack()) router.dismissAll?.();
    router.replace(`/task/${task.id}`);
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => goBack('/(tabs)/tasks')} />
        <Text variant="subtitle" className="flex-1">
          Email it
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Input
          label="Email address"
          placeholder="tutor@university.ac.uk"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Input label="Subject" placeholder={task.title} value={subject} onChangeText={setSubject} />

        {/*
          Editable, because this is what a person will actually receive.

          Showing it read-only would make the review theatre: the point of a
          human checkpoint is being able to change what is wrong at the moment
          you notice it.
        */}
        <Input
          label="Message Aria will send"
          placeholder="What goes in the email"
          value={body}
          onChangeText={setBody}
          multiline
          style={{ minHeight: 180 }}
        />

        <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <CalendarClock size={15} color={c.accent} />
            <Text variant="small" className="flex-1 font-strong">
              {time
                ? `Goes out ${formatFull(date)} at ${formatTime(time)}`
                : `Goes out ${formatFull(date)}`}
            </Text>
            <Button
              title={changing ? 'Done' : 'Change'}
              variant="ghost"
              size="sm"
              onPress={() => setChanging((v) => !v)}
            />
          </View>

          {changing ? (
            <View className="gap-3 pt-1">
              <MonthCalendar value={date} onSelect={setDate} />
              <TimeField value={time} onChange={setTime} />
            </View>
          ) : null}

          {past ? (
            <InlineError>
              {`${time ? `${formatTime(time)} on ${formatFull(date)}` : formatFull(date)} has already passed. Pick a later moment.`}
            </InlineError>
          ) : null}
        </View>
      </ScrollView>

      <View className="border-t border-border px-5 pb-6 pt-3">
        <Button
          title="Schedule it"
          block
          size="lg"
          disabled={!ready}
          leftIcon={<Send size={18} color={c.accentInk} />}
          onPress={send}
        />
      </View>
    </Screen>
  );
}
