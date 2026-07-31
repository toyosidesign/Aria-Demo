import {
  addDays,
  addWeeks,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { router } from 'expo-router';
import { AlertTriangle, ChevronDown, ChevronRight, HeartPulse } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { formatTime } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { HEAVY_DAY_THRESHOLD, useAriaStore, type Task } from '@/store/aria-store';

type Range = 'day' | 'week' | 'month';

/**
 * One column of the chart: the tasks it holds and how to name it.
 *
 * The three ranges differ only in how tasks are grouped, so everything below —
 * bars, colours, the heavy warning, the detail panel — is written once against
 * this shape rather than three times against three shapes.
 */
interface Bucket {
  key: string;
  /** Under the bar. A character or two, so seven still fit on a phone. */
  tick: string;
  /** In the detail panel, where there is room to be clear. */
  label: string;
  tasks: Task[];
  /** The bucket holding "now" — today, or the current week in month view. */
  current: boolean;
}

/** "Monday and Thursday" / "Monday, Thursday and Friday" */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How many tasks a bucket shows before it offers to expand. */
const COLLAPSED = 4;

/**
 * What counts as too much, per range.
 *
 * A day holding four things is a heavy day; a whole week holding four is a
 * quiet one. Reusing a single number across all three would have flagged every
 * month as overloaded and never flagged a single morning.
 */
const HEAVY_AT: Record<Range, number> = {
  day: 3,
  week: HEAVY_DAY_THRESHOLD,
  month: HEAVY_DAY_THRESHOLD * 5,
};

function buildBuckets(range: Range, tasks: Task[], demoDate: string): Bucket[] {
  const open = tasks.filter((t) => t.status === 'todo');
  const today = parseISO(demoDate);

  if (range === 'day') {
    // Parts of the day rather than 24 hourly columns: nobody plans by the hour,
    // and a task with no time would have nowhere to sit.
    const onToday = open.filter((t) => isSameDay(parseISO(t.date), today));
    const hourOf = (t: Task) => (t.time ? Number(t.time.slice(0, 2)) : -1);
    const blocks = [
      { key: 'morning', tick: 'AM', label: 'Morning', test: (h: number) => h >= 0 && h < 12 },
      { key: 'afternoon', tick: 'PM', label: 'Afternoon', test: (h: number) => h >= 12 && h < 17 },
      { key: 'evening', tick: 'EVE', label: 'Evening', test: (h: number) => h >= 17 },
      { key: 'anytime', tick: 'ANY', label: 'No set time', test: (h: number) => h < 0 },
    ];
    return blocks.map((b) => ({
      key: b.key,
      tick: b.tick,
      label: b.label,
      tasks: onToday.filter((t) => b.test(hourOf(t))),
      current: false,
    }));
  }

  if (range === 'week') {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return {
        key: d.toISOString(),
        tick: format(d, 'EEEEE'),
        label: format(d, 'EEEE'),
        tasks: open.filter((t) => isSameDay(parseISO(t.date), d)),
        current: isSameDay(d, today),
      };
    });
  }

  // Month, grouped by week. Thirty columns will not fit on a phone, and a month
  // is read as "which week is bad", not "which of the 30 days is bad".
  const first = startOfWeek(startOfMonth(today), { weekStartsOn: 1 });
  const last = endOfMonth(today);
  const weeks: Bucket[] = [];
  for (let w = first; w <= last; w = addWeeks(w, 1)) {
    const from = w;
    const to = addDays(w, 6);
    weeks.push({
      key: w.toISOString(),
      tick: format(w, 'd'),
      label: `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`,
      tasks: open.filter((t) => {
        const d = parseISO(t.date);
        return d >= from && d <= to;
      }),
      current: today >= from && today <= to,
    });
  }
  return weeks;
}

export function WorkloadChart() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  const [range, setRange] = useState<Range>('week');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const buckets = useMemo(() => buildBuckets(range, tasks, demoDate), [range, tasks, demoDate]);
  const heavyAt = HEAVY_AT[range];

  const counts = buckets.map((b) => b.tasks.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(heavyAt, ...counts);
  const heavyBuckets = buckets.filter((b) => b.tasks.length >= heavyAt);
  const heavy = heavyBuckets.length > 0;
  const chosen = buckets.find((b) => b.key === selected) ?? null;

  const colorFor = (n: number) =>
    n === 0
      ? c.border
      : n <= Math.floor(heavyAt / 2)
        ? c.success
        : n < heavyAt
          ? c.warning
          : c.danger;

  const period = range === 'day' ? 'today' : range === 'week' ? 'this week' : 'this month';
  const headline =
    total === 0
      ? `Nothing booked ${period}. Enjoy the breathing room.`
      : heavyBuckets.length === 1
        ? `${heavyBuckets[0].label} looks heavy (${heavyBuckets[0].tasks.length} tasks). Want to spread it out?`
        : heavy
          ? `${listNames(heavyBuckets.map((b) => b.label))} are all looking heavy.`
          : `Your ${range} looks well balanced. Nice pacing.`;

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <HeartPulse size={17} color={heavy ? c.danger : c.success} />
        <Text variant="subtitle" className="flex-1">
          Wellbeing
        </Text>
      </View>

      <Segmented<Range>
        value={range}
        onChange={(v) => {
          hapticSelect();
          // A bucket key from one range means nothing in another.
          setSelected(null);
          setExpanded(false);
          setRange(v);
        }}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />

      <Text tone="muted" className="leading-5">
        {headline}
      </Text>

      {/* Bars. Overloaded buckets carry a marker as well as a colour, so the
          warning survives being glanced at or seen by a colourblind eye. */}
      <View className="flex-row items-end gap-2" style={{ height: 112 }}>
        {buckets.map((b) => {
          const n = b.tasks.length;
          const flagged = n >= heavyAt;
          const isSel = b.key === selected;
          return (
            <Pressable
              key={b.key}
              onPress={() => {
                hapticSelect();
                // Each bucket opens collapsed; the previous one's expansion
                // shouldn't carry over to a column you haven't looked at.
                setExpanded(false);
                setSelected((prev) => (prev === b.key ? null : b.key));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${b.label}, ${n} ${n === 1 ? 'task' : 'tasks'}`}
              className="flex-1 items-center justify-end gap-1 active:opacity-60">
              {/* Fixed-height slot so flagging a bucket doesn't shift the baseline */}
              <View style={{ height: 15 }} className="items-center justify-center">
                {flagged ? <AlertTriangle size={13} color={c.danger} strokeWidth={2.5} /> : null}
              </View>
              <Text
                variant="caption"
                tone={flagged ? 'danger' : isSel ? 'accent' : 'faint'}
                className={flagged || isSel ? 'font-heavy' : undefined}>
                {n > 0 ? n : ''}
              </Text>
              <View
                style={{
                  width: '68%',
                  height: n === 0 ? 4 : Math.max(10, (n / max) * 74),
                  borderRadius: 6,
                  backgroundColor: colorFor(n),
                  // The selected bar is ringed rather than recoloured, so the
                  // load colour it is reporting stays readable.
                  borderWidth: isSel ? 2 : 0,
                  borderColor: c.accent,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-2">
        {buckets.map((b) => {
          const flagged = b.tasks.length >= heavyAt;
          const isSel = b.key === selected;
          return (
            <Text
              key={b.key}
              variant="caption"
              tone={flagged ? 'danger' : isSel || b.current ? 'accent' : 'faint'}
              className={
                flagged || isSel || b.current
                  ? 'flex-1 text-center font-heavy'
                  : 'flex-1 text-center font-strong'
              }>
              {b.tick}
            </Text>
          );
        })}
      </View>

      {/* What is actually in the column you tapped. A chart you can only look at
          answers "is it bad"; this answers "bad because of what". */}
      {chosen ? (
        <View className="gap-2 rounded-2xl border border-border bg-bg p-3">
          <View className="flex-row items-center gap-2">
            <Text variant="caption" tone="muted" className="flex-1 font-strong uppercase">
              {chosen.label}
            </Text>
            <Text variant="caption" tone="faint">
              {chosen.tasks.length} {chosen.tasks.length === 1 ? 'task' : 'tasks'}
            </Text>
          </View>

          {chosen.tasks.length === 0 ? (
            <Text variant="small" tone="faint">
              Nothing here. A good place to move something to.
            </Text>
          ) : (
            chosen.tasks.slice(0, expanded ? undefined : COLLAPSED).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/task/${t.id}`)}
                className="flex-row items-center gap-2 active:opacity-60">
                <View style={{ backgroundColor: c.accent }} className="h-1.5 w-1.5 rounded-full" />
                <Text variant="small" numberOfLines={1} className="flex-1">
                  {t.title}
                </Text>
                {t.time ? (
                  <Text variant="caption" tone="faint">
                    {formatTime(t.time)}
                  </Text>
                ) : null}
                <ChevronRight size={14} color={c.faint} />
              </Pressable>
            ))
          )}

          {/* Expands in place rather than navigating. The bucket can be a block
              of a day or a span of a week, neither of which is a single date to
              route to — and this was a plain Text before, so tapping "and 7
              more" did nothing at all. */}
          {chosen.tasks.length > COLLAPSED ? (
            <Pressable
              onPress={() => {
                hapticSelect();
                setExpanded((v) => !v);
              }}
              accessibilityRole="button"
              hitSlop={6}
              className="flex-row items-center gap-1 pt-0.5 active:opacity-60">
              <Text variant="caption" tone="accent" className="font-strong">
                {expanded ? 'Show less' : `and ${chosen.tasks.length - COLLAPSED} more`}
              </Text>
              <ChevronDown
                size={13}
                color={c.accent}
                style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
              />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text variant="caption" tone="faint" className="text-center">
          Tap a bar to see what&apos;s in it
        </Text>
      )}

      {heavy ? (
        <Pressable
          onPress={() => router.push('/rebalance')}
          className="mt-1 items-center rounded-2xl border border-accent bg-accent-soft py-2.5 active:opacity-70">
          <Text variant="small" tone="accent" className="font-strong">
            {heavyBuckets.length === 1 ? `Spread out ${heavyBuckets[0].label}` : 'Rebalance my week'}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
