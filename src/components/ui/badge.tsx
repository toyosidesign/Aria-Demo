/**
 * ── SHAPE IS THE AFFORDANCE ──────────────────────────────────────────────────
 *
 * In this app, roundness says whether a thing can be tapped:
 *
 *   rounded-full (pill)   interactive — Chip, ChoiceChip, and buttons at small
 *                         sizes all read as pills
 *   rounded-md            informational — a badge states a fact and does not
 *                         respond to a tap
 *
 * Badges were pills, which put them in the interactive family and invited taps
 * that did nothing. The small uppercase label reinforces it: a micro-label
 * doesn't read as something you press.
 *
 * If you add a badge-like component, give it the informational shape. If you
 * make one tappable, it stops being a badge.
 */
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { error, success, useTheme, warning } from '@/lib/colors';
import { Text } from './text';

type Priority = 'low' | 'medium' | 'high';

const PRIORITY_STYLE: Record<Priority, { dot: string; label: string }> = {
  low: { dot: 'bg-priority-low', label: 'Low' },
  medium: { dot: 'bg-priority-medium', label: 'Medium' },
  high: { dot: 'bg-priority-high', label: 'High' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <View className="flex-row items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-0.5">
      <View className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      <Text variant="label" tone="muted">
        {s.label}
      </Text>
    </View>
  );
}

/**
 * Where a task stands, in one word.
 *
 * Three states, escalating: `due` is today and still in time, `late` has been
 * missed, `done` is finished. They are mutually exclusive by construction — see
 * `isDueToday`, which excludes late — so a card only ever shows one.
 *
 * ── Why these take their colours from the ramps rather than the palette ──────
 * The fill used to be the palette token at 12% over the card. Tinting a
 * background with the same colour as the text on it pulls the two together, and
 * on Linen the labels fell to ~4.0:1. Darkening the tokens fixed the contrast
 * and ruined the hue: warning-800 is a brown-red, so "Due" stopped looking
 * orange at all.
 *
 * Splitting the two jobs solves both. The **fill** carries the hue — a real
 * amber, red or green that is unmistakable at a glance — and the **text**
 * carries the contrast at the 700 step. Every pair clears 4.5:1.
 */
const TONE = {
  due: { ramp: warning, label: 'Due' },
  late: { ramp: error, label: 'Late' },
  done: { ramp: success, label: 'Done' },
} as const;

export function StatusBadge({ status }: { status: 'todo' | 'due' | 'done' | 'late' }) {
  const { dark } = useTheme();
  if (status === 'todo') return null;

  const { ramp, label } = TONE[status];
  // Light themes get a pale fill with dark text; dark themes invert it. Both
  // keep the hue in the fill, which is what makes the badge readable at a
  // glance rather than only on inspection.
  const bg = dark ? ramp[900] : ramp[100];
  const fg = dark ? ramp[300] : ramp[700];

  return (
    <View style={{ backgroundColor: bg }} className="rounded-md px-2 py-0.5">
      <Text variant="label" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active = false,
  className,
}: {
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'rounded-full border px-3 py-1.5',
        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
        className,
      )}>
      <Text variant="small" tone={active ? 'accent' : 'muted'} className="font-strong">
        {label}
      </Text>
    </View>
  );
}
