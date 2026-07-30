import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { router } from 'expo-router';
import { AlertTriangle, HeartPulse } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { HEAVY_DAY_THRESHOLD, useAriaStore } from '@/store/aria-store';

/** "Monday and Thursday" / "Monday, Thursday and Friday" */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A lightweight "burnout monitor" — this week's task load per day. */
export function WorkloadChart() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  const start = startOfWeek(parseISO(demoDate), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const counts = days.map(
    (d) => tasks.filter((t) => t.status === 'todo' && isSameDay(parseISO(t.date), d)).length,
  );

  const peak = Math.max(0, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(HEAVY_DAY_THRESHOLD, peak);

  // Every day carrying too much, not just the single worst one — a week with
  // two heavy days is the case most worth catching.
  const heavyIndexes = counts.reduce<number[]>((acc, n, i) => {
    if (n >= HEAVY_DAY_THRESHOLD) acc.push(i);
    return acc;
  }, []);
  const heavy = heavyIndexes.length > 0;
  const heavyNames = heavyIndexes.map((i) => format(days[i], 'EEEE'));

  const colorFor = (n: number) =>
    n === 0 ? c.border : n <= 2 ? c.success : n === 3 ? c.warning : c.danger;

  const headline =
    total === 0
      ? 'A clear week ahead. Enjoy the breathing room.'
      : heavyIndexes.length === 1
        ? `${heavyNames[0]} looks heavy (${counts[heavyIndexes[0]]} tasks). Want to spread it out?`
        : heavy
          ? `${listNames(heavyNames)} are all looking heavy. Want to spread them out?`
          : 'Your week looks well balanced. Nice pacing.';

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <HeartPulse size={17} color={heavy ? c.danger : c.success} />
        <Text variant="subtitle" className="flex-1">
          Wellbeing
        </Text>
        <Text variant="caption" tone="faint">
          this week
        </Text>
      </View>

      <Text tone="muted" className="leading-5">
        {headline}
      </Text>

      {/* Bars. Overloaded days carry a marker as well as a colour, so the
          warning survives being glanced at or seen by a colourblind eye. */}
      <View className="flex-row items-end gap-2" style={{ height: 112 }}>
        {counts.map((n, i) => {
          const flagged = n >= HEAVY_DAY_THRESHOLD;
          return (
            <View key={i} className="flex-1 items-center justify-end gap-1">
              {/* Fixed-height slot so flagging a day doesn't shift the baseline */}
              <View style={{ height: 15 }} className="items-center justify-center">
                {flagged ? <AlertTriangle size={13} color={c.danger} strokeWidth={2.5} /> : null}
              </View>
              <Text
                variant="caption"
                tone={flagged ? 'danger' : 'faint'}
                className={flagged ? 'font-heavy' : undefined}>
                {n > 0 ? n : ''}
              </Text>
              <View
                style={{
                  width: '68%',
                  height: n === 0 ? 4 : Math.max(10, (n / max) * 74),
                  borderRadius: 6,
                  backgroundColor: colorFor(n),
                }}
              />
            </View>
          );
        })}
      </View>

      <View className="flex-row gap-2">
        {days.map((d, i) => {
          const isToday = isSameDay(d, parseISO(demoDate));
          const flagged = counts[i] >= HEAVY_DAY_THRESHOLD;
          return (
            <Text
              key={d.toISOString()}
              variant="caption"
              tone={flagged ? 'danger' : isToday ? 'accent' : 'faint'}
              className={flagged || isToday ? 'flex-1 text-center font-heavy' : 'flex-1 text-center font-strong'}>
              {format(d, 'EEEEE')}
            </Text>
          );
        })}
      </View>

      {heavy ? (
        <Pressable
          onPress={() => router.push('/rebalance')}
          className="mt-1 items-center rounded-2xl border border-accent bg-accent-soft py-2.5 active:opacity-70">
          <Text variant="small" tone="accent" className="font-strong">
            {heavyIndexes.length === 1
              ? `Spread out ${heavyNames[0]}`
              : 'Rebalance my week'}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
