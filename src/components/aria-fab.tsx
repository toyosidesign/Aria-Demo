import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';

/** Floating Aria launcher — bottom-left, opens the chat. The app's namesake button. */
export function AriaFab() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Talk to Aria"
        onPress={() => {
          hapticSelect();
          router.push('/chat');
        }}
        className="h-14 w-14 items-center justify-center rounded-full bg-accent active:opacity-90"
        style={{
          position: 'absolute',
          right: 20,
          bottom: insets.bottom + 74,
          shadowColor: c.accent,
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}>
        <Sparkles size={24} color={c.accentInk} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}
