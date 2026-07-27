import { format, parseISO } from 'date-fns';
import { CalendarClock } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { DEFAULT_DEMO_DATE, useAriaStore } from '@/store/aria-store';

interface DateChip {
  iso: string;
  label: string;
}

/**
 * Demo control: jump the app's effective "today". Surfaces one chip per date
 * that has a proactive task so the reviewer can trigger Aria's flows in one tap.
 */
export function DemoDateBar() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);

  const chips: DateChip[] = [{ iso: DEFAULT_DEMO_DATE, label: 'Today' }];
  const seen = new Set<string>([DEFAULT_DEMO_DATE]);
  for (const t of tasks) {
    if (t.status !== 'todo' || !ariaActionFor(t) || seen.has(t.date)) continue;
    seen.add(t.date);
    const who = t.contactName ? ` · ${t.contactName}` : '';
    chips.push({ iso: t.date, label: `${format(parseISO(t.date), 'MMM d')}${who}` });
  }
  chips.sort((a, b) => (a.iso < b.iso ? -1 : 1));

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5">
        <CalendarClock size={13} color={c.faint} />
        <Text variant="label" tone="faint">
          Simulate date (demo)
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {chips.map((chip) => {
          const active = chip.iso === demoDate;
          return (
            <Pressable
              key={chip.iso}
              onPress={() => setDemoDate(chip.iso)}
              className={cn(
                'rounded-full border px-3.5 py-2',
                active ? 'border-accent bg-accent' : 'border-border bg-surface',
              )}>
              <Text
                variant="small"
                tone={active ? 'onAccent' : 'muted'}
                className="font-semibold">
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
