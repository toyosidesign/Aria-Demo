import { router } from 'expo-router';
import { CalendarCheck, Trash2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AriaAvatar } from '@/components/aria-avatar';
import { SwipeAction, SWIPE_ACTION_WIDTH } from '@/components/swipe-action';
import { HeaderButton } from '@/components/header-button';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { PriorityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { formatFull, formatTime } from '@/lib/dates';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { selectWeekLoad, sortByDate, useAriaStore, type Task } from '@/store/aria-store';

/**
 * One task in the week, swipeable to drop it. Easing an overloaded week often
 * means deciding something isn't happening, not just moving it along.
 */
function RebalanceRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const c = useColors();
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1}
      rightThreshold={SWIPE_ACTION_WIDTH * 0.55}
      overshootRight={false}
      renderRightActions={(progress) => (
        <SwipeAction
          progress={progress}
          color={c.danger}
          icon={Trash2}
          label="Delete task"
          onPress={() => {
            ref.current?.close();
            hapticSuccess();
            onDelete();
          }}
        />
      )}>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</View>
    </ReanimatedSwipeable>
  );
}

export default function RebalanceScreen() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const rescheduleTask = useAriaStore((s) => s.rescheduleTask);
  const updateTask = useAriaStore((s) => s.updateTask);
  const deleteTask = useAriaStore((s) => s.deleteTask);

  const week = selectWeekLoad(tasks, demoDate);
  const weekTasks = week.tasks.slice().sort(sortByDate);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});

  function toggle(t: Task) {
    hapticTap();
    if (activeId === t.id) {
      setActiveId(null);
      return;
    }
    setActiveId(t.id);
    setDraftDate(t.date);
    setDraftTime(t.time ?? null);
  }

  function apply(t: Task) {
    rescheduleTask(t.id, draftDate);
    updateTask(t.id, { time: draftTime ?? undefined });
    hapticSuccess();
    setMoved((m) => ({ ...m, [t.id]: draftDate }));
    setActiveId(null);
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle" className="flex-1">
          Ease your week
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>
        <View className="flex-row gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-4">
          <AriaAvatar size={30} />
          <Text className="flex-1 leading-6">
            Your week has {week.count} things on it. That&apos;s a lot. Tap anything to move it to
            another day or time, or swipe it left to drop it altogether.
          </Text>
        </View>

        {weekTasks.length === 0 ? (
          <View className="items-center gap-2 py-10">
            <CalendarCheck size={26} color={c.success} />
            <Text tone="muted">Your week is clear. Nothing to move.</Text>
          </View>
        ) : (
          weekTasks.map((t) => {
            const active = activeId === t.id;
            const movedTo = moved[t.id];
            return (
              <RebalanceRow key={t.id} onDelete={() => deleteTask(t.id)}>
                <Pressable
                  onPress={() => toggle(t)}
                  className="flex-row items-center gap-3 p-4 active:opacity-70">
                  <View className="flex-1 gap-1">
                    <Text variant="subtitle" numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text variant="small" tone={movedTo ? 'accent' : 'muted'} className="font-strong">
                      {movedTo
                        ? `Moved to ${formatFull(movedTo)}`
                        : `${formatFull(t.date)}${t.time ? ` · ${formatTime(t.time)}` : ''}`}
                    </Text>
                  </View>
                  <PriorityBadge priority={t.priority} />
                </Pressable>

                {active ? (
                  <View className="gap-3 border-t border-border p-4">
                    <MonthCalendar value={draftDate} onSelect={setDraftDate} />
                    <TimeField value={draftTime} onChange={setDraftTime} />
                    <View className="flex-row gap-2">
                      <Button title="Move here" onPress={() => apply(t)} className="flex-1" />
                      <Button title="Cancel" variant="secondary" onPress={() => setActiveId(null)} />
                    </View>
                    <Button
                      title="Edit full details"
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push(`/task/new?editId=${t.id}`)}
                    />
                  </View>
                ) : null}
              </RebalanceRow>
            );
          })
        )}
      </ScrollView>

      <View className="border-t border-border px-4 pb-6 pt-3">
        <Button title="Done" block size="lg" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
