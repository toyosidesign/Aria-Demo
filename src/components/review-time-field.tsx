import { Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { TimeField } from '@/components/time-field';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { formatTime } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';

/**
 * Choosing the hour the daily review arrives.
 *
 * ── Why this is not the stepper ─────────────────────────────────────────────
 *
 * It was a `TimeField` dropped into the right-hand slot of a settings row,
 * which is the slot built for a switch. The row gave it about half the width,
 * so the description beside it wrapped to five lines, the hour and minute
 * columns were squeezed against their chevrons, and AM/PM stacked into two
 * boxes taller than the control they belonged to. Four taps to move from 8:00
 * to 7:30, on a control that looked broken while you did it.
 *
 * ── Why presets ─────────────────────────────────────────────────────────────
 *
 * This is a morning alarm, and nobody sets a morning alarm for 07:43. The times
 * people actually pick are half-hours across a narrow band, so those are one
 * tap each, and the exact control stays for the person who genuinely wants
 * 07:45. Fewer taps for everyone, and the state is always readable: whatever is
 * set is on screen as a lit chip, including a custom time.
 */

/** The band a review is useful in: early enough to act on, not the middle of the night. */
const PRESETS = ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00'];

export function ReviewTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) {
  const c = useColors();
  const isPreset = PRESETS.includes(value);
  /*
   * The exact control opens only when it is wanted, and opens already open for
   * somebody whose saved time is not a preset. Otherwise the one person who set
   * 07:45 would come back to a screen with no lit chip and no visible reason.
   */
  const [custom, setCustom] = useState(!isPreset);

  function pick(time: string) {
    hapticSelect();
    onChange(time);
    setCustom(false);
  }

  return (
    <View className="gap-3 border-t border-border px-4 py-3.5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="font-strong">When</Text>
          <Text variant="small" tone="muted">
            Early enough to act on, before the day has started.
          </Text>
        </View>
        {/* The answer, stated. A settings row whose value can only be read off
            the highlighted control makes you hunt for what it is set to. */}
        <View className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5">
          <Clock size={14} color={c.accent} />
          <Text variant="small" tone="accent" className="font-strong">
            {formatTime(value)}
          </Text>
        </View>
      </View>

      {/* `rounded-full` because these are tappable. Shape is the affordance in
          this app, see the note at the top of ui/badge.tsx. */}
      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((time) => {
          const on = !custom && value === time;
          return (
            <Pressable
              key={time}
              onPress={() => pick(time)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Review at ${formatTime(time)}`}
              className={`min-h-[38px] items-center justify-center rounded-full border px-3.5 active:opacity-70 ${
                on ? 'border-accent bg-accent' : 'border-border bg-bg'
              }`}>
              <Text variant="small" tone={on ? 'onAccent' : 'muted'} className="font-strong">
                {formatTime(time)}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => {
            hapticSelect();
            setCustom((open) => !open);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: custom }}
          className={`min-h-[38px] items-center justify-center rounded-full border px-3.5 active:opacity-70 ${
            custom ? 'border-accent bg-accent' : 'border-border bg-bg'
          }`}>
          <Text variant="small" tone={custom ? 'onAccent' : 'muted'} className="font-strong">
            {custom && !isPreset ? formatTime(value) : 'Another time'}
          </Text>
        </Pressable>
      </View>

      {/* Full width, on its own line, which is all the original control ever
          needed. `value` is never null here: a review with no time is not a
          thing, so the field cannot clear it. */}
      {custom ? (
        <View className="rounded-2xl border border-border bg-bg p-3">
          <TimeField value={value} onChange={(t) => onChange(t ?? '08:00')} />
        </View>
      ) : null}
    </View>
  );
}
