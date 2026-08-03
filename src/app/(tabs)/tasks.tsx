import { router } from 'expo-router';
import { CalendarClock, CheckCircle2, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { selectDone, selectLate, selectUpcoming, useAriaStore, type Task } from '@/store/aria-store';

type Tab = 'upcoming' | 'due' | 'late' | 'done';

export default function TasksScreen() {
  /*
   * The list, and a row renderer that keeps its identity.
   *
   * `blocksExternalGesture={listRef}` makes each row's drag take precedence
   * over the list's scroll — without it the scroll claims the pan and rows
   * spring back mid-swipe. `renderRow` is memoised because an inline arrow
   * rebuilds every row on each render, which is the same identity problem that
   * has broken this gesture before.
   */
  const listRef = useRef(null);
  const renderRow = useCallback(
    /*
     * `advanceOnComplete={false}`, matching Home.
     *
     * Finishing a task here used to push you into the next one that was due. On
     * a list you are working through, being thrown into a detail screen for
     * clearing one item takes away the view you deliberately opened. The card
     * just goes.
     */
    ({ item }: { item: Task }) => (
      <SwipeableTaskCard task={item} scrollRef={listRef} advanceOnComplete={false} />
    ),
    [],
  );

  const c = useColors();
  const [tab, setTab] = useState<Tab>('upcoming');
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  /*
   * "Due" is split out of upcoming rather than given its own selector.
   *
   * `selectUpcoming` is shared with Home, where today and the days after it are
   * deliberately one list. Splitting it at the source would have changed that
   * screen too, so the divide happens here, where it is a property of this
   * page's tabs rather than of the data.
   */
  const scheduled = useMemo(() => selectUpcoming(tasks, demoDate), [tasks, demoDate]);
  const due = useMemo(() => scheduled.filter((t) => t.date === demoDate), [scheduled, demoDate]);
  const upcoming = useMemo(() => scheduled.filter((t) => t.date > demoDate), [scheduled, demoDate]);
  const late = useMemo(() => selectLate(tasks, demoDate), [tasks, demoDate]);
  const done = useMemo(() => selectDone(tasks), [tasks]);

  const list =
    tab === 'upcoming' ? upcoming : tab === 'due' ? due : tab === 'late' ? late : done;

  return (
    <Screen padded>
      <View className="flex-row items-center justify-between pb-4 pt-2">
        <Text variant="title">Tasks</Text>
        <Pressable
          onPress={() => router.push('/task/new')}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-accent active:opacity-80">
          <Plus size={22} color={c.accentInk} strokeWidth={2.6} />
        </Pressable>
      </View>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { value: 'due', label: 'Due', count: due.length },
          { value: 'late', label: 'Late', count: late.length },
          { value: 'done', label: 'Done', count: done.length },
        ]}
      />

      <FlatList
        ref={listRef}
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={renderRow}
        contentContainerStyle={{ gap: 12, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          tab === 'upcoming' ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              subtitle="Tap + to add a task and pick a date."
            />
          ) : tab === 'due' ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing due today"
              subtitle="Anything scheduled for later is under Upcoming."
            />
          ) : tab === 'late' ? (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              subtitle="No overdue tasks. Nice work."
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No finished tasks yet"
              subtitle="Completed tasks land here."
            />
          )
        }
      />
    </Screen>
  );
}
