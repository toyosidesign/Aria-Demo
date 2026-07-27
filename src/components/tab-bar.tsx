import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  CalendarDays,
  House,
  ListChecks,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/lib/colors';
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

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row border-t border-border bg-surface px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
      {state.routes.map((route, index) => {
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
            <Icon
              size={23}
              color={focused ? c.accent : c.faint}
              strokeWidth={focused ? 2.4 : 2}
            />
            <Text variant="caption" tone={focused ? 'accent' : 'faint'} className="font-semibold">
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
