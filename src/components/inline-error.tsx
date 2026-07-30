import { AlertCircle } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

/**
 * A validation error you can't skim past.
 *
 * Small red caption text sits at the same weight as every other hint on a
 * form, so it reads as advice rather than "this won't save". Icon, tinted
 * panel and full-width give it the weight of an actual blocker.
 */
export function InlineError({ children, className }: { children: string; className?: string }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: `${c.danger}1A`, borderColor: `${c.danger}59` }}
      className={cn('flex-row items-start gap-2.5 rounded-2xl border px-3.5 py-3', className)}>
      <AlertCircle size={16} color={c.danger} style={{ marginTop: 1 }} />
      <Text variant="small" tone="danger" className="flex-1 leading-5">
        {children}
      </Text>
    </View>
  );
}
