import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';

/**
 * The controls a flow step answers with, in one place.
 *
 * They were defined inside `task-flow-panel.tsx`, which was fine while every
 * step lived in that file. The work steps are big enough to have their own
 * (`work-panels.tsx`), and two copies of a tap target is how two sizes of tap
 * target happen. Shared here rather than imported across, which would be a
 * cycle.
 */

/**
 * The panel's own shell.
 *
 * Attached to the question, not floating below it: same left inset as Aria's
 * bubble, a square top-left corner continuing its tail, and the accent tint
 * carried through, so the question and its answers read as one turn rather
 * than as furniture that happens to be nearby.
 */
export const PANEL_SHELL =
  'ml-10 -mt-1 gap-3 rounded-2xl rounded-tl-sm border border-accent/25 bg-accent-soft/60 p-3.5';

/** A tappable pill. 44pt minimum, like every other tap target in the app. */
export function Pill({
  label,
  onPress,
  active,
  icon,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      className={`min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 active:opacity-70 ${
        active ? 'border-accent bg-accent' : 'border-border bg-surface'
      }`}>
      {icon}
      <Text variant="small" tone={active ? 'onAccent' : 'muted'} className="font-strong">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One of a small set of answers, sized to be read rather than hunted for.
 *
 * Yes/no was two small pills floating in a box, which looked like tags rather
 * than a decision. These split the width, so the choice is the widest thing on
 * screen at the moment it is being asked.
 */
export function Choice({
  label,
  onPress,
  primary,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Work is in flight. Shows a spinner and refuses further taps. */
  busy?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      disabled={busy}
      onPress={() => {
        if (busy) return;
        hapticSelect();
        onPress();
      }}
      className={`min-h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 ${
        busy ? 'opacity-60' : 'active:opacity-70'
      } ${primary ? 'border-accent bg-accent' : 'border-border bg-surface'}`}>
      {busy ? <ActivityIndicator size="small" color={primary ? c.accentInk : c.muted} /> : null}
      <Text variant="small" tone={primary ? 'onAccent' : 'muted'} className="font-strong">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A fact Aria is reporting, not a control.
 *
 * `rounded-md`, deliberately: shape is the affordance in this app, and a
 * confidence chip that anyone tries to tap has already failed. See the note at
 * the top of `components/ui/badge.tsx`.
 */
export function InfoChip({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'danger' }) {
  const bg = tone === 'danger' ? 'bg-danger/10' : tone === 'accent' ? 'bg-accent-soft' : 'bg-border/50';
  return (
    <View className={`rounded-md px-2 py-0.5 ${bg}`}>
      <Text variant="caption" tone={tone === 'muted' ? 'muted' : tone} className="font-strong">
        {label}
      </Text>
    </View>
  );
}
