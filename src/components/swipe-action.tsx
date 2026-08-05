import { type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useColors } from '@/lib/colors';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

/** Width of the revealed action area, per side. */
export const SWIPE_ACTION_WIDTH = 76;
const BUTTON = 50;

/**
 * A single revealed swipe action, matching the round buttons iOS Messages
 * slides in behind a row: a solid circle with a white glyph and no caption,
 * scaling up as the row is dragged. Tapping it commits, the swipe only
 * reveals, so a stray drag never performs anything.
 */
export function SwipeAction({
  progress,
  color,
  icon: Icon,
  label,
  onPress,
}: {
  progress: SharedValue<number>;
  color: string;
  icon: LucideIcon;
  /** Accessibility name, deliberately not drawn, iOS shows the glyph alone. */
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 0.6, 1], [0.3, 1, 1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 1, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ width: SWIPE_ACTION_WIDTH }} className="items-center justify-center">
      <Animated.View style={style}>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            width: BUTTON,
            height: BUTTON,
            borderRadius: BUTTON / 2,
            backgroundColor: color,
          }}
          className="items-center justify-center active:opacity-70">
          <Icon size={23} color={c.accentInk} strokeWidth={2.4} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
