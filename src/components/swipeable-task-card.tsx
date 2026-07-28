import { router, type Href } from 'expo-router';
import { CalendarClock, Check, RotateCcw, type LucideIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { TaskCard } from '@/components/task-card';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSuccess } from '@/lib/haptics';
import { useAriaStore, type Task } from '@/store/aria-store';

function Panel({
  color,
  icon: Icon,
  label,
  side,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  side: 'left' | 'right';
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color,
        justifyContent: 'center',
        alignItems: side === 'left' ? 'flex-start' : 'flex-end',
        paddingHorizontal: 22,
        borderTopLeftRadius: side === 'left' ? 16 : 0,
        borderBottomLeftRadius: side === 'left' ? 16 : 0,
        borderTopRightRadius: side === 'right' ? 16 : 0,
        borderBottomRightRadius: side === 'right' ? 16 : 0,
      }}>
      <View className="items-center">
        <Icon size={22} color="#fff" />
        <Text variant="caption" className="mt-1 font-semibold" style={{ color: '#fff' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** TaskCard you can pull right to complete/reopen, or pull left to reschedule. */
export function SwipeableTaskCard({ task, onPress }: { task: Task; onPress?: () => void }) {
  const c = useColors();
  const ref = useRef<SwipeableMethods>(null);
  const completeTask = useAriaStore((s) => s.completeTask);
  const reopenTask = useAriaStore((s) => s.reopenTask);
  const done = task.status === 'done';

  function onOpen(direction: 'left' | 'right') {
    ref.current?.close();
    // NOTE: ReanimatedSwipeable reports `direction` as the swipe direction, which
    // is the opposite of the panel side. The LEFT panel (Complete) is revealed by
    // swiping right → direction === 'right'. Map to the visible panel's action.
    if (direction === 'right') {
      if (done) reopenTask(task.id);
      else completeTask(task.id);
      hapticSuccess();
    } else {
      router.push(`/reschedule?id=${task.id}` as Href);
    }
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={70}
      rightThreshold={70}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() =>
        done ? (
          <Panel color={c.muted} icon={RotateCcw} label="Reopen" side="left" />
        ) : (
          <Panel color={c.success} icon={Check} label="Complete" side="left" />
        )
      }
      renderRightActions={done ? undefined : () => <Panel color={c.accent} icon={CalendarClock} label="Reschedule" side="right" />}
      onSwipeableWillOpen={onOpen}>
      <TaskCard task={task} onPress={onPress} />
    </ReanimatedSwipeable>
  );
}
