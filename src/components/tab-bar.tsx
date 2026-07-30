import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  CalendarDays,
  House,
  ListChecks,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/lib/colors';
import { useAriaStore } from '@/store/aria-store';
import { Text } from '@/components/ui/text';

const ICONS: Record<string, LucideIcon> = {
  index: House,
  calendar: CalendarDays,
  tasks: ListChecks,
  profile: User,
  settings: SettingsIcon,
};

const LABELS: Record<string, string> = {
  index: 'Today',
  calendar: 'Calendar',
  tasks: 'Tasks',
  profile: 'Profile',
  settings: 'Settings',
};

/** Matches the glyph size of the other tabs so the row stays even. */
const AVATAR = 24;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const avatarUri = useAriaStore((s) => s.profile.avatarUri);

  return (
    <View
      className="flex-row border-t border-border bg-surface px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
      {state.routes.map((route) => {
        const index = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === index;
        const Icon = ICONS[route.name] ?? House;
        const label = LABELS[route.name] ?? route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            className="flex-1 items-center gap-1 py-1.5">
            {/* Your own face on your own tab. Falls back to the glyph when
                there's no picture, so the row stays visually consistent. */}
            {route.name === 'profile' && avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                accessibilityIgnoresInvertColors
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  borderWidth: focused ? 2 : 0,
                  borderColor: c.accent,
                  opacity: focused ? 1 : 0.65,
                }}
              />
            ) : (
              <Icon
                size={23}
                color={focused ? c.accent : c.faint}
                strokeWidth={focused ? 2.4 : 2}
              />
            )}
            {/* 11px, pinned here rather than left on `caption`: a tab label is
                read at a glance beneath its icon, so it wants to be smaller than
                body copy. Raising the shared scale had quietly enlarged these. */}
            <Text
              variant="caption"
              tone={focused ? 'accent' : 'faint'}
              className="text-[11px] font-semibold leading-[14px]">
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
