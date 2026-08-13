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
import { isPending, toRunAt } from '@/lib/automations';
import { runAutomation } from '@/lib/automation-runner';
import { goBack } from '@/lib/nav';
import { useColors } from '@/lib/colors';
import { isValidEmails } from '@/lib/contacts';
import { effectiveToday, formatFull, formatTime, isPastMoment, toISODate } from '@/lib/dates';
import { sectionsToText } from '@/lib/export';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
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
  const settleAutomation = useAriaStore((s) => s.settleAutomation);
  const [sending, setSending] = useState(false);

  /*
   * The send already scheduled for this task, when there is one.
   *
   * Opening this screen on a task that is already going out is editing, not
   * scheduling a second one. Without this the same essay would arrive twice:
   * once from the row somebody thought they had corrected, and once from the
   * one they actually created.
   */
  const pending = useAriaStore((s) =>
    s.automations.find((a) => a.taskId === taskId && isPending(a)),
  );
  const cancelAutomation = useAriaStore((s) => s.cancelAutomation);

  const [email, setEmail] = useState(pending?.toEmail ?? task?.contactEmail ?? '');
  const [subject, setSubject] = useState(pending?.subject ?? task?.title ?? '');

  /*
   * The document, if one has been assembled, and everything written otherwise.
   *
   * `draftSections[0]` was the old default and is the wrong thing to send: on
   * finished work it is the brief or an early paragraph, never the piece.
   */
  const initialBody = useMemo(() => {
    // What is already scheduled wins: it is the thing that will actually be
    // sent, edits and all, and rebuilding it from sections would quietly throw
    // away whatever was changed here last time.
    if (pending?.body) return pending.body;
    const assembled = (task?.draftSections ?? []).find((s) => s.title === ASSEMBLED_SECTION);
    return assembled ? assembled.content : sectionsToText(writtenSections(task?.draftSections));
  }, [task?.draftSections, pending?.body]);
  const [body, setBody] = useState(initialBody);

  const scheduled = pending ? new Date(pending.runAt) : null;
  const [date, setDate] = useState(scheduled ? toISODate(scheduled) : (task?.date ?? demoDate));
  const [time, setTime] = useState<string | null>(
    scheduled
      ? `${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`
      : (task?.time ?? '09:00'),
  );

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
  /**
   * Why this cannot be sent yet, in one sentence, or nothing.
   *
   * The create form learned this lesson already: a disabled button gives no
   * reason and nothing to press against, and on a phone it reads as a button
   * that is not there. Four conditions can hold this one back and three of them
   * are invisible from the bottom of the screen.
   */
  function blocker(opts: { needsTime?: boolean } = {}): string | null {
    const needsTime = opts.needsTime !== false;
    if (!isValidEmails(email)) {
      return email.trim()
        ? "That address doesn't look right, so I have left it alone."
        : 'Add the address this should go to.';
    }
    if (!body.trim()) return 'There is nothing to send yet. Add the message.';
    if (needsTime && !time) return 'Pick a time, so I know when to send it.';
    if (needsTime && past) return 'That moment has already passed. Pick a later day or time.';
    return null;
  }

  /**
   * Out the door now, rather than at a moment somebody has to choose.
   *
   * Half of what people want to do with a finished assignment is send it, and
   * the other half is send it *later*: written on Tuesday, due Friday, and the
   * tutor should not get it on Tuesday. Only the second was possible, so
   * "send it" meant "pick a time", and the answer to "can I just send this?"
   * was no.
   *
   * It still goes through an automation rather than straight to the route: that
   * is the record of what Aria did, it is what the activity screen reads, and
   * it is what completes the task. A send with no row behind it is a send
   * nobody can point at afterwards.
   */
  async function sendNow() {
    if (!task) return;
    const why = blocker({ needsTime: false });
    if (why) {
      hapticWarning();
      showToast(why, 'clock');
      return;
    }

    setSending(true);
    if (pending) cancelAutomation(pending.id);
    const id = scheduleAutomation({
      taskId: task.id,
      taskTitle: task.title,
      channel: 'email',
      runAt: new Date().toISOString(),
      subject: subject.trim() || task.title,
      body: body.trim(),
      toEmail: email.trim(),
    });

    const outcome = await runAutomation({
      id,
      taskId: task.id,
      taskTitle: task.title,
      channel: 'email',
      runAt: new Date().toISOString(),
      status: 'scheduled',
      subject: subject.trim() || task.title,
      body: body.trim(),
      toEmail: email.trim(),
      createdAt: new Date().toISOString(),
    });
    settleAutomation(id, { status: outcome.status, error: outcome.error });
    setSending(false);

    if (outcome.status === 'sent') {
      hapticSuccess();
      showToast(`Sent to ${email.trim()}`, 'check');
    } else {
      hapticWarning();
      // The provider's reason is in the server log; this is the part a person
      // can act on, and it must not claim a send that did not happen.
      showToast(outcome.note, 'clock');
    }
    router.replace(`/task/${task.id}`);
  }

  function send() {
    if (!task) return;

    /*
     * Pressed while incomplete, and answered rather than ignored.
     *
     * Nothing happening is indistinguishable from the app being broken, which
     * is exactly how this screen was reported: "save isn't there".
     */
    const why = blocker();
    if (why || !time) {
      hapticWarning();
      showToast(why ?? 'Pick a time, so I know when to send it.', 'clock');
      return;
    }

    /*
     * Replace rather than add.
     *
     * Cancelled first, and only then rescheduled: the old row is the one the
     * cron is holding, and leaving it in place would send the version somebody
     * had just corrected alongside the correction.
     */
    if (pending) cancelAutomation(pending.id);

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
          {pending ? 'Edit what goes out' : 'Email it'}
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

        {/*
          The day and the hour, on the form rather than behind it.

          These were folded away on the reasoning that the task already carries
          a deadline and asking again is asking somebody to repeat themselves.
          That is true of the deadline and false of this: when it goes *out* is
          a decision people make here, at the moment they decide who it goes to,
          and a picker behind a "Change" link is one people do not find. The
          summary line stays, because a calendar is not a sentence and somebody
          scanning wants the answer, not the controls.
        */}
        <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <CalendarClock size={15} color={c.accent} />
            <Text variant="small" className="flex-1 font-strong">
              {time
                ? `Goes out ${formatFull(date)} at ${formatTime(time)}`
                : `Goes out ${formatFull(date)}`}
            </Text>
          </View>

          <MonthCalendar value={date} onSelect={setDate} />
          <TimeField value={time} onChange={setTime} />

          {past ? (
            <InlineError>
              {`${time ? `${formatTime(time)} on ${formatFull(date)}` : formatFull(date)} has already passed. Pick a later moment.`}
            </InlineError>
          ) : null}
        </View>
      </ScrollView>

      {/*
        Two endings, because "send it" and "send it later" are both real.

        Now is the louder one: an assignment somebody is looking at, finished,
        with the address filled in, is usually one they want gone. Later is a
        deliberate act and reads as one. Neither is ever disabled, see
        `blocker`: pressing explains what is missing.
      */}
      <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
        <Button
          title="Send it now"
          block
          size="lg"
          loading={sending}
          leftIcon={<Send size={18} color={c.accentInk} />}
          onPress={() => void sendNow()}
        />
        <Button
          title={pending ? 'Save the change' : 'Schedule it for later'}
          variant="secondary"
          block
          size="lg"
          leftIcon={<CalendarClock size={18} color={c.ink} />}
          onPress={send}
        />
      </View>
    </Screen>
  );
}
