import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ARIA_SENDER, requestDraft } from '@/lib/aria-actions';
import { useAriaStore } from '@/store/aria-store';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import type { TaskKind } from '@/store/aria-store';

const ADJUSTMENTS = [
  { label: 'Warmer', instruction: 'make it warmer and more heartfelt' },
  { label: 'Shorter', instruction: 'make it shorter and punchier' },
  { label: 'Funnier', instruction: 'make it playful and a little funny' },
  { label: 'More formal', instruction: 'make it a little more polished and formal' },
];

/**
 * What actually goes inside the card.
 *
 * Cards are the one place the note *is* the message, so this field carries its
 * own drafting: Aria can write a first version, and the chips rewrite it in
 * place rather than making you go through the whole send flow to reword it.
 */
export function CardMessageField({
  kind,
  title,
  contactName,
  value,
  onChange,
  label = 'What the card says',
}: {
  kind: TaskKind;
  title: string;
  contactName?: string;
  value: string;
  onChange: (next: string) => void;
  /** Cards and pictures both need a message; only the wording differs. */
  label?: string;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const senderName = useAriaStore((s) => s.profile.name) || ARIA_SENDER;
  const senderContext = useAriaStore((s) => s.profile.context);

  async function draft(instruction?: string) {
    if (busy) return;
    hapticSelect();
    setBusy(true);
    const res = await requestDraft({
      kind,
      title: title.trim() || 'A card',
      contactName: contactName?.trim() || undefined,
      method: 'card',
      senderName,
      senderContext,
      instruction,
      previousDraft: instruction ? value : undefined,
    });
    setBusy(false);
    onChange(res.message);
  }

  const hasMessage = value.trim().length > 0;

  return (
    <View className="gap-2">
      <Input
        label={label}
        placeholder="Write it yourself, or let Aria draft it…"
        value={value}
        onChangeText={onChange}
        multiline
      />

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => draft()}
          disabled={busy}
          className="flex-row items-center gap-2 rounded-full border border-accent bg-accent-soft px-3.5 py-2 active:opacity-70">
          {busy ? (
            <ActivityIndicator size="small" color={c.accent} />
          ) : (
            <Sparkles size={15} color={c.accent} />
          )}
          <Text variant="caption" tone="accent" className="font-semibold">
            {busy ? 'Writing…' : hasMessage ? 'Rewrite it' : 'Draft it with Aria'}
          </Text>
        </Pressable>
      </View>

      {/* Adjustments only make sense once there's something to adjust */}
      {hasMessage && !busy ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {ADJUSTMENTS.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => draft(a.instruction)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 active:opacity-70">
              <Text variant="caption" tone="muted" className="font-semibold">
                {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Text variant="caption" tone="faint" className="leading-5">
        Leave it blank and I&apos;ll write one when it&apos;s time to send.
      </Text>
    </View>
  );
}
