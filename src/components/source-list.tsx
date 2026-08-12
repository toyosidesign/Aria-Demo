import { Link2 } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticTap } from '@/lib/haptics';
import { hostOf, type Source } from '@/lib/source';

/**
 * Where the answer came from, under the answer.
 *
 * The whole value of a searched answer is that it can be checked, and an answer
 * nobody can check is worth less than an honest "I do not know". So the sources
 * are shown rather than kept in the response, and each one opens.
 *
 * ── Why the site name is the loud part ──────────────────────────────────────
 *
 * Deciding whether to trust a claim is mostly deciding who said it. A page
 * title is often a headline written to be clicked; the domain is the thing a
 * student can judge in a glance, so it leads and the title explains.
 */
export function SourceList({ sources, cited = true }: { sources: Source[]; cited?: boolean }) {
  const c = useColors();
  if (!sources.length) return null;

  return (
    <View className="gap-1.5 pt-1">
      {/*
        Two different claims, so two different words.

        "Sources" says the answer rests on these pages. When the model searched
        but cited nothing, all we honestly have is what it looked at, and
        calling that a source would be a small lie printed under every answer.
      */}
      <Text variant="caption" tone="muted">
        {cited ? (sources.length === 1 ? 'Source' : 'Sources') : 'Pages I read'}
      </Text>
      {sources.map((s) => (
        <Pressable
          key={s.url}
          onPress={() => {
            hapticTap();
            // Ignored rather than surfaced: a link that will not open is a
            // small disappointment, and an error toast over it is a bigger one.
            void Linking.openURL(s.url).catch(() => {});
          }}
          // Informational until tapped, so `rounded-md` rather than the pill
          // shape this app reserves for its buttons.
          className="flex-row items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 active:opacity-70">
          <Link2 size={13} color={c.accent} style={{ marginTop: 2 }} />
          <View className="flex-1">
            <Text variant="caption" tone="accent" numberOfLines={1}>
              {hostOf(s.url)}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={2} className="leading-4">
              {s.title}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
