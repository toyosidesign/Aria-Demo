import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from './text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row rounded-2xl bg-border/50 p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2',
              active && 'bg-surface',
            )}>
            <Text variant="small" tone={active ? 'default' : 'muted'} className="font-semibold">
              {opt.label}
            </Text>
            {typeof opt.count === 'number' ? (
              <Text variant="caption" tone={active ? 'accent' : 'faint'} className="font-semibold">
                {opt.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
