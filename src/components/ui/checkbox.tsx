import { Pressable } from 'react-native';
import { Check } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

export function Checkbox({
  checked,
  onToggle,
  size = 22,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      className={cn(
        'items-center justify-center rounded-lg border-2',
        checked ? 'border-accent bg-accent' : 'border-border bg-transparent',
        className,
      )}
      style={{ width: size, height: size }}>
      {checked ? <Check size={size * 0.62} color={c.accentInk} strokeWidth={3} /> : null}
    </Pressable>
  );
}
