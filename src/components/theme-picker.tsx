import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { THEMES, THEME_NAMES, type Theme, type ThemePref } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';

/**
 * Picking the paper the app is printed on.
 *
 * Each swatch is a miniature of what a card will actually look like in that
 * theme — its own surface, its own text tones, its own border — because a flat
 * colour chip tells you the background and nothing about whether text on it
 * will be comfortable. The lines are drawn at the theme's `ink`, `muted` and
 * `faint`, so a theme whose text is weak looks weak here too.
 */

/**
 * Card proportion, width ÷ height.
 *
 * The swatches size themselves off the row rather than off a fixed width, so
 * this is what keeps them card-shaped as they stretch. Roughly 3:4 — tall
 * enough to read as a page, short enough that four of them don't take over the
 * Appearance section.
 */
const SWATCH_ASPECT = 1 / 1.34;

function Swatch({
  theme,
  selected,
  onPress,
}: {
  theme: Theme;
  selected: boolean;
  onPress: () => void;
}) {
  const p = theme.palette;
  // Lines stand in for a title and two lines of body copy.
  const lines: { w: number; color: string }[] = [
    { w: 1, color: p.ink },
    { w: 0.72, color: p.muted },
    { w: 0.86, color: p.muted },
    { w: 0.5, color: p.faint },
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={theme.label}
      className="flex-1 items-center gap-2 active:opacity-70">
      <View
        style={{
          // Full width of its share of the row, with the card shape held by an
          // aspect ratio rather than a fixed size. Fixed widths left the four
          // bunched at the left with dead space beside them, and they would not
          // adapt to a narrow phone or a large-text setting.
          width: '100%',
          aspectRatio: SWATCH_ASPECT,
          backgroundColor: p.surface,
          borderRadius: 12,
          borderWidth: selected ? 2 : 1,
          // The selected ring is the accent; unselected sits on its own border
          // so a light theme doesn't float on a light background.
          borderColor: selected ? p.accent : p.border,
          padding: 8,
          justifyContent: 'space-between',
        }}>
        <View style={{ gap: 3.5 }}>
          {lines.map((l, i) => (
            <View
              key={i}
              style={{
                height: 2,
                width: `${l.w * 100}%`,
                borderRadius: 2,
                backgroundColor: l.color,
                opacity: i === 0 ? 0.9 : 0.55,
              }}
            />
          ))}
        </View>

        {/* The completion circle, echoing a real task card. */}
        <View
          style={{
            height: 16,
            width: 16,
            borderRadius: 8,
            borderWidth: selected ? 0 : 1.25,
            borderColor: p.faint,
            backgroundColor: selected ? p.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected ? <Check size={10} color={p.accentInk} strokeWidth={3.5} /> : null}
        </View>
      </View>

      <Text variant="caption" tone={selected ? 'accent' : 'muted'} className="font-strong">
        {theme.label}
      </Text>
    </Pressable>
  );
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePref;
  onChange: (next: ThemePref) => void;
}) {
  return (
    /*
     * A plain row: a horizontal ScrollView with nothing to scroll swallows
     * drags meant for the page. `items-start` so the swatches align to the top
     * and a longer label can't stretch its neighbour's card.
     */
    <View className="flex-row items-start gap-3 py-1">
      {THEME_NAMES.map((name) => (
        <Swatch
          key={name}
          theme={THEMES[name]}
          selected={value === name}
          onPress={() => {
            hapticSelect();
            onChange(name);
          }}
        />
      ))}
    </View>
  );
}
