import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

export function HeaderButton({
  icon: Icon,
  onPress,
  tone = 'ink',
  className,
}: {
  icon: LucideIcon;
  onPress: () => void;
  tone?: 'ink' | 'muted';
  className?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className={cn('h-10 w-10 items-center justify-center rounded-full active:bg-border/60', className)}>
      <Icon size={22} color={tone === 'muted' ? c.muted : c.ink} />
    </Pressable>
  );
}
