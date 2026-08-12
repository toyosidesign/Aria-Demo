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
      <View
        className="flex-row items-center gap-2 rounded-full px-4 py-3"
        style={{
          backgroundColor: c.ink,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          maxWidth: '90%',
        }}>
        <Icon size={16} color={c.bg} />
        <Text className="font-strong" style={{ color: c.bg }} numberOfLines={1}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
