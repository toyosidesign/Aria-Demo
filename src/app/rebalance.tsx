import { router } from 'expo-router';
import { CalendarCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
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
import { selectWeekLoad, useAriaStore, type Task } from '@/store/aria-store';

export default function RebalanceScreen() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const rescheduleTask = useAriaStore((s) => s.rescheduleTask);
  const updateTask = useAriaStore((s) => s.updateTask);

  const week = selectWeekLoad(tasks, demoDate);
  const weekTasks = week.tasks.slice().sort((a, b) => a.date.localeCompare(b.date));

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
            Your week has {week.count} things on it — that&apos;s a lot. Move any event, project, or
            task to another day or time, and I&apos;ll keep the rest as-is.
          </Text>
        </View>

        {weekTasks.length === 0 ? (
          <View className="items-center gap-2 py-10">
            <CalendarCheck size={26} color={c.success} />
            <Text tone="muted">Your week is clear — nothing to move.</Text>
          </View>
        ) : (
          weekTasks.map((t) => {
            const active = activeId === t.id;
            const movedTo = moved[t.id];
            return (
              <View key={t.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <Pressable
                  onPress={() => toggle(t)}
                  className="flex-row items-center gap-3 p-4 active:opacity-70">
                  <View className="flex-1 gap-1">
                    <Text variant="subtitle" numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text variant="small" tone={movedTo ? 'accent' : 'muted'} className="font-semibold">
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
                  </View>
                ) : null}
              </View>
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
