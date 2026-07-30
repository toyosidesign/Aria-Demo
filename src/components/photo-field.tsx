import { ImagePlus, X } from 'lucide-react-native';
import { Alert, Image, Platform, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { pickPhoto } from '@/lib/avatar';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';

/** Choose the picture that goes out with the message. */
export function PhotoField({
  value,
  onChange,
  error,
}: {
  value?: string;
  onChange: (uri?: string) => void;
  /** Set once Save has been pressed with no picture chosen. */
  error?: string;
}) {
  const c = useColors();

  async function choose(source: 'library' | 'camera') {
    const uri = await pickPhoto(source);
    if (uri) {
      onChange(uri);
      hapticSelect();
    }
  }

  function pick() {
    if (Platform.OS === 'web') {
      void choose('library');
      return;
    }
    Alert.alert('Add a picture', 'Where should it come from?', [
      { text: 'Choose from library', onPress: () => void choose('library') },
      { text: 'Take a photo', onPress: () => void choose('camera') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View className="gap-2">
      <Text variant="label" tone={error ? 'danger' : 'muted'}>
        Picture
      </Text>

      {value ? (
        <View className="gap-2">
          <View className="overflow-hidden rounded-2xl border border-border">
            <Image
              source={{ uri: value }}
              accessibilityIgnoresInvertColors
              style={{ width: '100%', aspectRatio: 1 }}
              resizeMode="cover"
            />
          </View>
          <View className="flex-row gap-4">
            <Pressable onPress={pick} hitSlop={6} className="active:opacity-60">
              <Text variant="caption" tone="accent" className="font-semibold">
                Choose a different one
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(undefined)}
              hitSlop={6}
              className="flex-row items-center gap-1 active:opacity-60">
              <X size={12} color={c.muted} />
              <Text variant="caption" tone="muted" className="font-semibold">
                Remove
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={pick}
          style={error ? { borderColor: c.danger } : null}
          className="items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-10 active:opacity-70">
          <ImagePlus size={24} color={error ? c.danger : c.accent} />
          <Text tone={error ? 'danger' : 'accent'} className="font-semibold">
            Choose a picture
          </Text>
          <Text variant="caption" tone="faint">
            It goes out with your message
          </Text>
        </Pressable>
      )}

      {error ? (
        <Text accessibilityRole="alert" variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
