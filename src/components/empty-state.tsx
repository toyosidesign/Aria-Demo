import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { useColors } from '@/lib/colors';
import { Text } from '@/components/ui/text';

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  const c = useColors();
  return (
    <View className="items-center justify-center gap-3 px-8 py-16">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-border/50">
        <Icon size={28} color={c.faint} />
      </View>
      <Text variant="subtitle" tone="muted" className="text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="small" tone="faint" className="text-center">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
