import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { router } from 'expo-router';
import { HeartPulse } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { useAriaStore } from '@/store/aria-store';

const AMBER = '#f59e0b';

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
  const max = Math.max(4, peak);
  const heavy = peak >= 4;

  const colorFor = (n: number) =>
    n === 0 ? c.border : n <= 2 ? c.success : n === 3 ? AMBER : c.danger;

  const headline =
    total === 0
      ? 'A clear week ahead — enjoy the breathing room.'
      : heavy
        ? `${format(days[counts.indexOf(peak)], 'EEEE')} looks heavy (${peak} tasks). Want to spread it out?`
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

      {/* Bars */}
      <View className="flex-row items-end gap-2" style={{ height: 96 }}>
        {counts.map((n, i) => (
          <View key={i} className="flex-1 items-center justify-end gap-1">
            <Text variant="caption" tone="faint">
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
        ))}
      </View>
      <View className="flex-row gap-2">
        {days.map((d) => {
          const isToday = isSameDay(d, parseISO(demoDate));
          return (
            <Text
              key={d.toISOString()}
              variant="caption"
              tone={isToday ? 'accent' : 'faint'}
              className="flex-1 text-center font-semibold">
              {format(d, 'EEEEE')}
            </Text>
          );
        })}
      </View>

      {heavy ? (
        <Pressable
          onPress={() => router.push('/rebalance')}
          className="mt-1 items-center rounded-2xl border border-accent bg-accent-soft py-2.5 active:opacity-70">
          <Text variant="small" tone="accent" className="font-semibold">
            Rebalance my week
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
