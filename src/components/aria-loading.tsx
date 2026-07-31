import { Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Matches the native splash and app.json's backgroundColor.
 *
 * The button fill — primary-500, the same colour a primary Button is filled with. Fixed rather than theme-aware on purpose:
 * this paints before the app knows the colour scheme, and it has to be
 * pixel-identical to the native splash or the hand-off flashes.
 */
const BRAND = '#333D56';

/**
 * What's on screen between launch and the app being ready.
 *
 * Deliberately identical to the native splash — same colour, same mark in the
 * same place — so the swap from one to the other is invisible and the mark
 * simply starts breathing. Rendering nothing here (the old behaviour) left a
 * blank screen with no sign of life whenever hydration ran long.
 */
export function AriaLoading({
  durationMs = 4000,
  message = 'Getting your day ready',
}: { durationMs?: number; message?: string } = {}) {
  const pulse = useSharedValue(1);
  const progress = useSharedValue(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  // Runs to 95%, never 100%: the last of it belongs to the app actually being
  // ready. A bar that fills completely while you're still waiting is a lie.
  useEffect(() => {
    progress.value = withTiming(0.95, {
      duration: durationMs,
      easing: Easing.out(Easing.quad),
    });
  }, [progress, durationMs]);

  // Only once it's overrun the planned wait — otherwise this would fire on
  // every launch, exactly as the bar finishes, and mean nothing.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), durationMs + 2500);
    return () => clearTimeout(t);
  }, [durationMs]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={{ flex: 1, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <Sparkles size={76} color="#FFFFFF" strokeWidth={1.6} />
      </Animated.View>

      {/* Deliberately the system font, not Inter. This is the screen shown
          *while* Inter is loading, so asking for it here would either fall back
          silently or swap mid-animation. The rest of the app switches once
          _layout releases. */}
      <Text
        style={{
          marginTop: 22,
          fontSize: 28,
          fontWeight: '700',
          letterSpacing: -0.5,
          color: '#FFFFFF',
        }}>
        Aria
      </Text>

      <Text style={{ marginTop: 6, fontSize: 14, color: '#FFFFFFB3' }}>
        {slow ? 'Just a moment, this is taking longer than usual…' : message}
      </Text>

      <View
        style={{
          marginTop: 26,
          width: 180,
          height: 4,
          borderRadius: 2,
          backgroundColor: '#FFFFFF33',
          overflow: 'hidden',
        }}>
        <Animated.View
          style={[{ height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' }, barStyle]}
        />
      </View>
    </View>
  );
}
