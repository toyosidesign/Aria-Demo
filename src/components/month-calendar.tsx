import { addMonths, isSameMonth, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { formatMonthYear, monthWeeks, realToday, WEEKDAY_LABELS } from '@/lib/dates';
import { Text } from '@/components/ui/text';
import { useAriaStore } from '@/store/aria-store';

export function MonthCalendar({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (iso: string) => void;
}) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const [cursor, setCursor] = useState(() => parseISO(value || demoDate));
  const weeks = monthWeeks(cursor);
  // The real date, never the simulated one — a date picker that rings the
  // wrong day as "today" is simply a broken calendar.
  const today = realToday();

  // Follow the selected date when it's set from outside (Aria pre-filling the
  // form, or editing a task), so the grid isn't left on the wrong month.
  useEffect(() => {
    if (!value) return;
    const selected = parseISO(value);
    if (!isSameMonth(selected, cursor)) setCursor(selected);
    // Only react to the incoming value — paging with the arrows must stick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between pb-3">
        <Text variant="subtitle">{formatMonthYear(cursor)}</Text>
        <View className="flex-row gap-1">
          <Pressable
            onPress={() => setCursor((d) => addMonths(d, -1))}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
            <ChevronLeft size={20} color={c.ink} />
          </Pressable>
          <Pressable
            onPress={() => setCursor((d) => addMonths(d, 1))}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
            <ChevronRight size={20} color={c.ink} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((d, i) => (
          <View key={i} className="flex-1 items-center pb-1">
            <Text variant="caption" tone="faint" className="font-semibold">
              {d}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((cell) => {
            const selected = cell.iso === value;
            const isToday = cell.iso === today;
            return (
              <Pressable
                key={cell.iso}
                onPress={() => onSelect(cell.iso)}
                className="flex-1 items-center justify-center py-0.5">
                <View
                  className={cn(
                    'h-10 w-10 items-center justify-center rounded-full',
                    selected && 'bg-accent',
                    !selected && isToday && 'border border-accent',
                  )}>
                  <Text
                    variant="small"
                    className={cn('font-medium', selected && 'text-accent-ink')}
                    tone={selected ? 'onAccent' : cell.inMonth ? 'default' : 'faint'}>
                    {cell.date.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
