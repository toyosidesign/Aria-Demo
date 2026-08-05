import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { Text } from './text';

/**
 * A tappable option.
 *
 * The `Chip` in ui/badge.tsx is a label, it renders state it can't change.
 * This one is the input: onboarding is built out of these so a student can
 * answer four questions without opening a keyboard.
 *
 * Selection is marked by a tick as well as by colour and weight. Colour alone
 * would leave the state invisible to a colourblind eye, and these chips are the
 * only thing on the screen carrying the answer.
 *
 * ── The 44pt floor ──────────────────────────────────────────────────────────
 * `min-h`/`min-w`, not a fixed `h-11`. 44×44pt is Apple's minimum tap target
 * and padding alone did not reach it, 14pt text on a 21pt line box with
 * `py-2` came to 39pt including borders, which is a miss on every finger.
 *
 * A fixed height would hit 44 too, and then clip the label the moment anyone
 * turns up Dynamic Type. A minimum sets the floor and still lets the chip grow,
 * which is the behaviour that survives a text-size setting nobody here tested.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  className,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  className?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-70',
        selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
        className,
      )}>
      {selected ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
      <Text variant="small" tone={selected ? 'accent' : 'muted'} className={selected ? 'font-strong' : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A wrapping row of choices. Multi-select unless `single`. */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  single = false,
}: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  single?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <ChoiceChip
          key={o}
          label={o}
          selected={value.includes(o)}
          onPress={() => {
            if (single) {
              // Tapping the chosen one again clears it, every question here is
              // optional, and without this there'd be no way to undo an answer
              // given by accident.
              onChange(value.includes(o) ? [] : [o]);
              return;
            }
            onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
          }}
        />
      ))}
    </View>
  );
}
