import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from './text';

type Priority = 'low' | 'medium' | 'high';

const PRIORITY_STYLE: Record<Priority, { dot: string; label: string }> = {
  low: { dot: 'bg-priority-low', label: 'Low' },
  medium: { dot: 'bg-priority-medium', label: 'Medium' },
  high: { dot: 'bg-priority-high', label: 'High' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1">
      <View className={cn('h-2 w-2 rounded-full', s.dot)} />
      <Text variant="caption" tone="muted" className="font-semibold">
        {s.label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: 'todo' | 'done' | 'late' }) {
  if (status === 'done') {
    return (
      <View className="rounded-full bg-success/15 px-2.5 py-1">
        <Text variant="caption" className="font-semibold text-success">
          Done
        </Text>
      </View>
    );
  }
  if (status === 'late') {
    return (
      <View className="rounded-full bg-danger/15 px-2.5 py-1">
        <Text variant="caption" className="font-semibold text-danger">
          Late
        </Text>
      </View>
    );
  }
  return null;
}

export function Chip({
  label,
  active = false,
  className,
}: {
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'rounded-full border px-3 py-1.5',
        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
        className,
      )}>
      <Text variant="small" tone={active ? 'accent' : 'muted'} className="font-semibold">
        {label}
      </Text>
    </View>
  );
}
