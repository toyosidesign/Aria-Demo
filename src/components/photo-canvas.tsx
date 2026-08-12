import { forwardRef } from 'react';
import { Image, View } from 'react-native';

import { Text } from '@/components/ui/text';

export const PHOTO_CARD_WIDTH = 340;

/**
 * The picture and the message as one image.
 *
 * Composing them into a single picture is what makes this shareable at all:
 * the share sheet carries one file, and Instagram and Facebook won't accept a
 * caption passed in from another app. Burning the words onto the image means
 * the message survives wherever it's posted.
 */
export const PhotoCanvas = forwardRef<
  View,
  { photoUri?: string; message: string; fromName?: string }
>(function PhotoCanvas({ photoUri, message, fromName }, ref) {
  if (!photoUri) return null;

  return (
    // Literal colours, not theme classes: this is snapshotted off-screen.
    <View
      ref={ref}
      collapsable={false}
      style={{ width: PHOTO_CARD_WIDTH, backgroundColor: '#FFFFFF' }}>
      <Image
        source={{ uri: photoUri }}
        accessibilityIgnoresInvertColors
        style={{ width: PHOTO_CARD_WIDTH, height: PHOTO_CARD_WIDTH }}
        resizeMode="cover"
      />

      {message.trim() ? (
        <View style={{ paddingHorizontal: 24, paddingVertical: 24, gap: 14 }}>
          <Text
            style={{ fontSize: 17, lineHeight: 27, textAlign: 'center', color: '#111827' }}>
            {message.trim()}
          </Text>
          {fromName?.trim() ? (
            <Text style={{ fontSize: 15, textAlign: 'center', color: '#6B7280' }}>
              {fromName.trim()}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
