import { addDays } from 'date-fns';
import { CalendarDays, Check, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { useAriaStore, type Task } from '@/store/aria-store';

/** How long a reminder can be pushed out for. */
const SNOOZE_OPTIONS: { label: string; at: () => Date }[] = [
  { label: '10 min', at: () => minutesFromNow(10) },
  { label: '1 hour', at: () => minutesFromNow(60) },
  { label: '3 hours', at: () => minutesFromNow(180) },
  {
    label: 'Tomorrow',
    at: () => {
      const d = addDays(new Date(), 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

function minutesFromNow(mins: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins, 0, 0);
  return d;
}

/**
 * The "remind me again in…" row, on its own so the swipe gesture on a card and
 * the buttons on a task screen offer the same choices. Two copies of these
 * options would drift the moment one gained a duration the other lacked.
 */
/**
 * Presets answer "not now", but not "the 14th".
 *
 * The four durations above cover pushing something a few hours out, and nothing
 * else, a reminder you want next Tuesday could only be moved by opening the
 * task and rescheduling it, which is not something anyone finds from a swipe.
 * `onPickDate` hands that case to the Reschedule screen, which already draws a
 * month calendar and a time, so there is one date picker in the app rather than
 * a second one grown here.
 */
export function SnoozeChips({
  onPick,
  onPickDate,
  onCancel,
}: {
  onPick: (at: Date) => void;
  onPickDate?: () => void;
  onCancel: () => void;
}) {
  const c = useColors();
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        Remind me again in
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {SNOOZE_OPTIONS.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => onPick(o.at())}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-accent bg-accent-soft px-3.5 py-2.5 active:opacity-70">
            <Text variant="small" tone="accent" className="font-strong">
              {o.label}
            </Text>
          </Pressable>
        ))}
        {onPickDate ? (
          <Pressable
            onPress={onPickDate}
            className="min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2.5 active:opacity-70">
            <CalendarDays size={14} color={c.accent} />
            <Text variant="small" tone="accent" className="font-strong">
              Pick a date
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onCancel}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-surface px-3.5 py-2.5 active:opacity-70">
          <Text variant="small" tone="muted" className="font-strong">
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * What a reminder actually needs.
 *
 * There's nothing to draft or send, you've either registered it or you want
 * it again later. So the choice is exactly two things, and "later" asks how
 * much later rather than silently guessing.
 */
export function ReminderActions({
  task,
  onDone,
  compact = false,
}: {
  task: Task;
  /**
   * Called after the reminder is answered, so a screen can move on. The reason
   * is passed because acknowledging and postponing don't always deserve the
   * same follow-up: finishing one earns the next task, snoozing needn't.
   */
  onDone?: (reason: 'done' | 'snoozed') => void;
  compact?: boolean;
}) {
  const c = useColors();
  const completeTask = useAriaStore((s) => s.completeTask);
  const snoozeTask = useAriaStore((s) => s.snoozeTask);
  const [picking, setPicking] = useState(false);

  function gotIt() {
    hapticSuccess();
    completeTask(task.id);
    onDone?.('done');
  }

  function snooze(at: Date) {
    hapticTap();
    snoozeTask(task.id, at);
    setPicking(false);
    onDone?.('snoozed');
  }

  if (picking) {
    return <SnoozeChips onPick={snooze} onCancel={() => setPicking(false)} />;
  }

  return (
    <View className={compact ? 'flex-row gap-2' : 'gap-2'}>
      <Button
        title="Got it"
        leftIcon={<Check size={18} color={c.accentInk} />}
        block={!compact}
        size={compact ? 'md' : 'lg'}
        className={compact ? 'flex-1' : undefined}
        onPress={gotIt}
      />
      <Button
        title="Snooze"
        variant="secondary"
        leftIcon={<Clock size={17} color={c.ink} />}
        block={!compact}
        size={compact ? 'md' : 'lg'}
        onPress={() => {
          hapticTap();
          setPicking(true);
        }}
      />
    </View>
  );
}
