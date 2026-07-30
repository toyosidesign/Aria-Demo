import { forwardRef } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cardTemplate } from '@/lib/cards';

/** Fixed pixel size — this is captured to an image, not laid out responsively. */
export const CARD_WIDTH = 340;

/**
 * The card as a picture.
 *
 * Rendered at a fixed size and captured to a PNG, so what the recipient opens
 * is an actual image rather than a line of emoji. Deliberately self-contained
 * with literal colours: it gets snapshotted outside the normal screen, where
 * theme classes can't be relied on to have resolved.
 */
export const CardCanvas = forwardRef<
  View,
  { templateId?: string; toName?: string; message: string; fromName?: string }
>(function CardCanvas({ templateId, toName, message, fromName }, ref) {
  const template = cardTemplate(templateId);
  if (!template) return null;

  const greeting = template.opener.replace('{name}', toName?.trim() || 'there');

  return (
    // collapsable={false} keeps the view in the native hierarchy on Android,
    // without which there is nothing for the capture to snapshot.
    <View
      ref={ref}
      collapsable={false}
      style={{ width: CARD_WIDTH, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
      <View
        style={{
          backgroundColor: `${template.tint}2E`,
          paddingVertical: 44,
          alignItems: 'center',
        }}>
        <Text style={{ fontSize: 40, textAlign: 'center', color: '#111827' }}>{template.art}</Text>
      </View>

      <View style={{ paddingHorizontal: 26, paddingVertical: 28, gap: 16 }}>
        <Text
          style={{
            fontSize: 22,
            lineHeight: 30,
            fontWeight: '700',
            textAlign: 'center',
            color: '#111827',
          }}>
          {greeting}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 26, textAlign: 'center', color: '#374151' }}>
          {message.trim()}
        </Text>
        {fromName?.trim() ? (
          <Text style={{ fontSize: 15, textAlign: 'right', color: '#6B7280' }}>
            {fromName.trim()}
          </Text>
        ) : null}
      </View>

      <View style={{ height: 6, backgroundColor: template.tint }} />
    </View>
  );
});
