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
            /*
             * `elevated`, not `surface`. In light they're the same step so
             * nothing changes, but in dark `surface` is *darker* than this
             * track — the selected pill sank into the background instead of
             * lifting off it, which is why the selection was hard to see.
             * `elevated` is the one step that is lighter than the track in
             * both schemes. The border adds an edge so it holds up either way.
             */
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2',
              active ? 'border border-border bg-elevated' : 'border border-transparent',
            )}>
            <Text variant="small" tone={active ? 'default' : 'muted'} className="font-strong">
              {opt.label}
            </Text>
            {typeof opt.count === 'number' ? (
              <Text variant="caption" tone={active ? 'accent' : 'faint'} className="font-strong">
                {opt.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
