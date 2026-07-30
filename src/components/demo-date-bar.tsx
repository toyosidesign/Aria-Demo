import { format, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { CalendarClock } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { realToday } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

interface DateChip {
  iso: string;
  label: string;
}

/**
 * Demo control: jump the app's effective "today". Surfaces one chip per date
 * that has a proactive task so the reviewer can trigger Aria's flows in one tap.
 */
export function DemoDateBar({ compact = false }: { compact?: boolean } = {}) {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);

  /**
   * Jumping the date used to happen in total silence — from Settings you'd tap
   * a chip and nothing visibly changed, because the effect is on Today. Say
   * what's now due and take the user where they can see it.
   */
  function pick(chip: DateChip) {
    hapticSelect();
    setDemoDate(chip.iso);
    const due = tasks.filter((t) => t.status === 'todo' && t.date === chip.iso).length;
    showToast(
      due > 0
        ? `${chip.label}: ${due} task${due === 1 ? '' : 's'} due`
        : `${chip.label}: nothing due`,
      'clock',
    );
    if (compact) router.push('/(tabs)');
  }

  const today = realToday();
  const chips: DateChip[] = [];
  const seen = new Set<string>([today]);
  for (const t of tasks) {
    if (t.status !== 'todo' || !ariaActionFor(t) || seen.has(t.date)) continue;
    // Forward only. Jumping backwards is what left the app stuck on a past
    // date pretending to be today, and there's nothing to preview back there.
    if (t.date < today) continue;
    seen.add(t.date);
    const who = t.contactName ? ` · ${t.contactName}` : '';
    chips.push({ iso: t.date, label: `${format(parseISO(t.date), 'MMM d')}${who}` });
  }
  chips.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  // Today leads, always. Sorting it in with the rest buried it behind any
  // past-dated task, so the way back to the real date scrolled off-screen.
  chips.unshift({ iso: today, label: 'Today' });

  return (
    <View className="gap-2">
      {compact ? null : (
        <View className="flex-row items-center gap-1.5">
          <CalendarClock size={13} color={c.faint} />
          <Text variant="label" tone="faint">
            Simulate date (demo)
          </Text>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {chips.map((chip) => {
          const active = chip.iso === demoDate;
          return (
            <Pressable
              key={chip.iso}
              onPress={() => pick(chip)}
              className={cn(
                'rounded-full border px-3.5 py-2',
                active ? 'border-accent bg-accent' : 'border-border bg-surface',
              )}>
              <Text
                variant="small"
                tone={active ? 'onAccent' : 'muted'}
                className="font-strong">
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
