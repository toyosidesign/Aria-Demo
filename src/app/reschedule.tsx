import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { InlineError } from '@/components/inline-error';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { effectiveToday, formatFull, formatTime, isPastMoment } from '@/lib/dates';
import { hapticSuccess } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Two jobs, one screen: moving a task, and pushing finished work out.
 *
 * They ask for exactly the same two things, a day and an hour, and building a
 * second calendar for the second one would be two controls to keep in step for
 * no gain. `mode=handin` changes the words and what happens on save, and
 * nothing else.
 *
 * The words matter though. "Reschedule" is what you do to something that
 * slipped; setting the moment a finished essay goes in is not a slip, and
 * calling it one would read as the app assuming you were late.
 */
export default function RescheduleScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const handIn = mode === 'handin';
  const task = useAriaStore((s) => s.tasks.find((t) => t.id === id));
  const demoDate = useAriaStore((s) => s.demoDate);
  const rescheduleTask = useAriaStore((s) => s.rescheduleTask);
  const updateTask = useAriaStore((s) => s.updateTask);

  const [date, setDate] = useState(task?.date ?? demoDate);
  const [time, setTime] = useState<string | null>(task?.time ?? null);
  // Two ways a moment can be gone: the real clock has passed it, or the demo is
  // simulating a day after it. The second one used to slip through, so
  // rescheduling *onto* an already-overdue day was accepted here.
  const past = date < effectiveToday(demoDate) || isPastMoment(date, time);

  if (!task) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <HeaderButton icon={X} onPress={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <Text tone="muted">This task no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  function save() {
    if (past) return;
    rescheduleTask(task!.id, date);
    updateTask(task!.id, { time: time ?? undefined });
    /*
     * Handing in earns an alarm, and the work does not.
     *
     * Setting a deadline on an assignment is a statement about when it is due;
     * the moment somebody actually has to act is the submission, and that is
     * the one worth being interrupted for.
     */
    if (handIn) updateTask(task!.id, { alarm: Boolean(time) });
    hapticSuccess();
    showToast(
      handIn
        ? time
          ? `Going out ${formatFull(date)} at ${formatTime(time)}`
          : `Going out ${formatFull(date)}`
        : 'Moved',
      'check',
    );
    router.back();
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle" className="flex-1">
          {handIn ? 'When does it go out?' : 'Reschedule'}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}>
        <View className="gap-1">
          <Text variant="heading" numberOfLines={2}>
            {task.title}
          </Text>
          <Text tone="muted">
            {handIn
              ? 'Pick the day and the hour it has to be in by. I will chime then.'
              : `Currently ${formatFull(task.date)}${task.time ? ` · ${formatTime(task.time)}` : ''}`}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="label" tone="muted">
            {handIn ? 'Due' : 'New date'}
          </Text>
          <MonthCalendar value={date} onSelect={setDate} />
        </View>

        <TimeField value={time} onChange={setTime} />

        {/* Moving something into the past just loses it again. */}
        {past ? (
          <InlineError className="-mt-3">
            {`${
              time ? `${formatTime(time)} on ${formatFull(date)}` : formatFull(date)
            } has already passed. Pick a later date or time.`}
          </InlineError>
        ) : null}
      </ScrollView>

      <View className="border-t border-border px-4 pb-6 pt-3">
        <Button
          title={handIn ? 'Set when it goes out' : 'Move task'}
          block
          size="lg"
          disabled={past}
          onPress={save}
        />
      </View>
    </Screen>
  );
}
