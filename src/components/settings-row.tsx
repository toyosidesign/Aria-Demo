import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from '@/components/ui/text';

export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      {title ? (
        <Text variant="label" tone="muted" className="px-1">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</View>
    </View>
  );
}

export function SettingsRow({
  icon: Icon,
  iconColor,
  label,
  description,
  right,
  onPress,
  showChevron,
  first,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  first?: boolean;
}) {
  const c = useColors();
  const content = (
    <View className={cn('flex-row items-center gap-3 px-4 py-3.5', !first && 'border-t border-border')}>
      {Icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-bg">
          <Icon size={17} color={iconColor ?? c.muted} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="caption" tone="muted" className="mt-0.5">
            {description}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <ChevronRight size={18} color={c.faint} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:bg-border/30">
        {content}
      </Pressable>
    );
  }
  return content;
}
