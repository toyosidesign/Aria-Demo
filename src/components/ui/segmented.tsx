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
  /*
   * Past three options the count moves under the label.
   *
   * Four tabs leave roughly 77pt of content each. "Upcoming" needs about 68 of
   * that and fits; a count beside it needs another 16 and does not. Earlier
   * attempts all treated the symptom — truncating showed "Upcomin…", scaling
   * shrank only the label that overflowed so one tab sat smaller than its
   * neighbours, and dropping the counts lost information worth keeping.
   *
   * Stacking sidesteps the competition entirely: the row only ever has to be as
   * wide as the longest word, and the number sits under it at caption size. The
   * control gets a little taller, which costs nothing here.
   */
  const dense = options.length > 3;

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
            /*
             * `minWidth: 0` and a truncating label.
             *
             * A flex child will not shrink below its content, so with four
             * options "Upcoming 12" pushed its own pill wider than the quarter
             * it had been given. The pill's background stayed at a quarter and
             * the text ran past it, which reads as the background being cut
             * off rather than as the label overflowing.
             */
            style={{ minWidth: 0 }}
            className={cn(
              'flex-1 items-center justify-center rounded-xl px-1',
              dense ? 'gap-0 py-1.5' : 'flex-row gap-1 py-2',
              active ? 'border border-border bg-elevated' : 'border border-transparent',
            )}>
            {/*
              Shrink the type, don't cut the word.
              
              Four tabs leave roughly 77pt of content each, and "Upcoming" with
              a count wants about 86. Truncating fixed the overflow by showing
              "Upcomin…", which is the same complaint in a different form. This
              is the treatment the Home greeting already uses for a name that
              would otherwise wrap: a label set a little smaller reads fine, a
              clipped one does not.
            */}
            <Text
              variant="small"
              tone={active ? 'default' : 'muted'}
              numberOfLines={1}
              className="shrink font-strong">
              {opt.label}
            </Text>
            {typeof opt.count === 'number' ? (
              <Text
                variant="caption"
                tone={active ? 'accent' : 'faint'}
                className="font-strong"
                style={dense ? { marginTop: -1 } : undefined}>
                {opt.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
