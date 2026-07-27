import { router } from 'expo-router';
import { CalendarClock, CheckCircle2, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { TaskCard } from '@/components/task-card';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { selectDone, selectLate, selectUpcoming, useAriaStore } from '@/store/aria-store';

type Tab = 'upcoming' | 'done' | 'late';

export default function TasksScreen() {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('upcoming');
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  const upcoming = useMemo(() => selectUpcoming(tasks, demoDate), [tasks, demoDate]);
  const late = useMemo(() => selectLate(tasks, demoDate), [tasks, demoDate]);
  const done = useMemo(() => selectDone(tasks), [tasks]);

  const list = tab === 'upcoming' ? upcoming : tab === 'late' ? late : done;

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
          { value: 'done', label: 'Done', count: done.length },
          { value: 'late', label: 'Late', count: late.length },
        ]}
      />

      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TaskCard task={item} />}
        contentContainerStyle={{ gap: 12, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          tab === 'upcoming' ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              subtitle="Tap + to add a task and pick a date."
            />
          ) : tab === 'late' ? (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              subtitle="No overdue tasks — nice work."
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
