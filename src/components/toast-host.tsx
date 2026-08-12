import { AlarmClock, Check, Clock, Plus, RotateCcw, Trash2, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { useToast, type ToastIcon } from '@/lib/toast';

const ICONS: Record<ToastIcon, LucideIcon> = {
  check: Check,
  trash: Trash2,
  clock: Clock,
  alarm: AlarmClock,
  undo: RotateCcw,
  plus: Plus,
};

const VISIBLE_MS = 2200;

export function ToastHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const id = useToast((s) => s.id);
  const message = useToast((s) => s.message);
  const icon = useToast((s) => s.icon);
  const hide = useToast((s) => s.hide);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    translateY.setValue(16);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 16, stiffness: 220, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 12, duration: 200, useNativeDriver: true }),
      ]).start(() => hide());
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
    // Re-run on each new toast (id bumps even when the text repeats).
  }, [id, message, hide, opacity, translateY]);

  if (!message) return null;
  const Icon = ICONS[icon];

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 72,
        alignItems: 'center',
        opacity,
        transform: [{ translateY }],
      }}>
      {/*
        Sized to the sentence, not to the hope that every sentence is short.

        A toast here can carry a real report, "X is assembled, 1,203 words. 2
        things to look at before you send it", and this row had no way to be
        narrower than that text: `maxWidth` bounded the pill while the Text kept
        its full intrinsic width and ran straight out the side of it. `shrink`
        is what lets the text be smaller than it wants to be, and without it a
        `maxWidth` on the parent is advice the child can ignore.

        Three lines, then an ellipsis. One line truncated the reports that
        matter most; unbounded, a long one would cover the screen it is
        reporting on.
      */}
      <View
        className="flex-row items-start gap-2 rounded-3xl px-4 py-3"
        style={{
          backgroundColor: c.ink,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          maxWidth: '90%',
        }}>
        {/* Nudged to sit on the first line's baseline once the text wraps. */}
        <Icon size={16} color={c.bg} style={{ marginTop: 2 }} />
        <Text
          className="shrink font-strong leading-5"
          style={{ color: c.bg }}
          numberOfLines={3}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
