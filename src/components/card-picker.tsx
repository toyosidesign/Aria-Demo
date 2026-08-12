import { Check } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { templatesFor, type CardTemplate } from '@/lib/cards';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import type { TaskKind } from '@/store/aria-store';

/** Pick the card Aria writes inside. Templates for the occasion come first. */
export function CardPicker({
  kind,
  value,
  onSelect,
  toName,
}: {
  kind: TaskKind;
  value?: string;
  onSelect: (id: string) => void;
  toName?: string;
}) {
  const c = useColors();
  const templates = templatesFor(kind);

  function pick(t: CardTemplate) {
    hapticSelect();
    onSelect(t.id);
  }

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        Choose a card
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 8, paddingVertical: 2 }}>
        {templates.map((t) => {
          const active = t.id === value;
          return (
            <Pressable
              key={t.id}
              onPress={() => pick(t)}
              accessibilityLabel={`${t.name} card`}
              accessibilityState={{ selected: active }}
              style={{ width: 132 }}
              className={`overflow-hidden rounded-2xl border active:opacity-70 ${
                active ? 'border-accent' : 'border-border'
              }`}>
              {/* Front of the card */}
              <View
                style={{ backgroundColor: `${t.tint}22` }}
                className="h-24 items-center justify-center px-2">
                <Text className="text-center text-lg">{t.art}</Text>
              </View>

              <View className="flex-row items-center gap-1.5 bg-surface px-3 py-2.5">
                <Text
                  variant="caption"
                  tone={active ? 'accent' : 'muted'}
                  numberOfLines={1}
                  className="flex-1 font-strong">
                  {t.name}
                </Text>
                {active ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {value ? (
        <Text variant="caption" tone="faint" className="leading-5">
          I&apos;ll open with “
          {templates
            .find((t) => t.id === value)
            ?.opener.replace('{name}', toName?.trim() || 'them')}
          ” and write the rest to match.
        </Text>
      ) : null}
    </View>
  );
}
