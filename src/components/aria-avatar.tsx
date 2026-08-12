import { View } from 'react-native';
import { Sparkles } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

/** Aria's identity mark, a calm accent disc with a spark. */
export function AriaAvatar({ size = 40, className }: { size?: number; className?: string }) {
  const c = useColors();
  return (
    <View
      className={cn('items-center justify-center rounded-full bg-accent', className)}
      style={{ width: size, height: size }}>
      <Sparkles size={size * 0.5} color={c.accentInk} strokeWidth={2.4} />
    </View>
  );
}
