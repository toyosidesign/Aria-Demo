import { addMonths, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { formatMonthYear, monthMatrix, toISODate, WEEKDAY_LABELS } from '@/lib/dates';
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
  const cells = monthMatrix(cursor);

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

      <View className="flex-row flex-wrap">
        {cells.map((cell) => {
          const selected = cell.iso === value;
          const isToday = cell.iso === demoDate;
          return (
            <View key={cell.iso} className="items-center justify-center" style={{ width: `${100 / 7}%` }}>
              <Pressable
                onPress={() => onSelect(cell.iso)}
                className={cn(
                  'my-0.5 h-10 w-10 items-center justify-center rounded-full',
                  selected && 'bg-accent',
                  !selected && isToday && 'border border-accent',
                )}>
                <Text
                  variant="small"
                  className={cn('font-medium', selected && 'text-accent-ink')}
                  tone={selected ? 'onAccent' : cell.inMonth ? 'default' : 'faint'}>
                  {cell.date.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
