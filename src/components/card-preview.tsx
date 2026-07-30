import { X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cardTemplate, renderCard } from '@/lib/cards';
import { useColors } from '@/lib/colors';

/**
 * How the card will look, and exactly what will be sent.
 *
 * Both halves matter. The framed version is the card Maya is choosing; the
 * plain text underneath is what actually lands in Mail or WhatsApp. Showing
 * only the pretty one would promise something the message can't deliver.
 */
export function CardPreview({
  visible,
  onClose,
  templateId,
  toName,
  message,
  fromName,
}: {
  visible: boolean;
  onClose: () => void;
  templateId?: string;
  toName?: string;
  message: string;
  fromName?: string;
}) {
  const c = useColors();
  const template = cardTemplate(templateId);
  if (!template) return null;

  const body = message.trim() || 'Aria will write the message here when it’s time to send.';
  const written = message.trim().length > 0;
  const outgoing = renderCard({ template, toName, body, fromName });
  const greeting = template.opener.replace('{name}', toName?.trim() || 'there');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="max-h-[88%] rounded-t-3xl border-t border-border bg-bg">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <Text variant="subtitle">Card preview</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close preview"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
              <X size={20} color={c.ink} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}>
            {/* The card itself */}
            <View className="overflow-hidden rounded-3xl border border-border">
              <View
                style={{ backgroundColor: `${template.tint}26` }}
                className="items-center justify-center py-10">
                <Text className="text-center text-3xl">{template.art}</Text>
              </View>

              <View className="gap-4 bg-surface px-5 py-6">
                <Text variant="heading" className="text-center">
                  {greeting}
                </Text>
                <Text
                  tone={written ? 'default' : 'faint'}
                  className="text-center leading-7">
                  {body}
                </Text>
                {fromName ? (
                  <Text tone="muted" className="text-right">
                    {fromName}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* And the truth about what gets delivered */}
            <View className="gap-2">
              <Text variant="label" tone="muted">
                What they&apos;ll receive
              </Text>
              <View className="rounded-2xl border border-border bg-surface p-4">
                <Text variant="small" className="leading-6">
                  {outgoing}
                </Text>
              </View>
              <Text variant="caption" tone="faint" className="leading-5">
                Cards go out as a message through Mail or WhatsApp, so this is the exact text that
                arrives.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
