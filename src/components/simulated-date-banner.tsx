import { CalendarClock } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { formatLong, realToday } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Says out loud when the app isn't showing the real date.
 *
 * The demo can jump its effective "today", and everything keyed off that date
 * follows, the greeting, the calendar's highlighted day, what counts as
 * overdue. Without this, a simulated date is indistinguishable from a broken
 * clock, which is precisely how it reads.
 */
export function SimulatedDateBanner({ className }: { className?: string } = {}) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);

  const today = realToday();
  if (demoDate === today) return null;

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3',
        className,
      )}>
      <CalendarClock size={17} color={c.accent} />
      <View className="flex-1">
        <Text variant="small" className="font-strong">
          Simulating {formatLong(demoDate)}
        </Text>
        <Text variant="caption" tone="muted">
          Today is really {formatLong(today)}
        </Text>
      </View>
      <Pressable
        hitSlop={8}
        className="active:opacity-60"
        onPress={() => {
          setDemoDate(today);
          hapticSelect();
          showToast('Back to the real date', 'clock');
        }}>
        <Text variant="small" tone="accent" className="font-strong">
          Fix
        </Text>
      </Pressable>
    </View>
  );
}
