import { addDays, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { CheckCircle2, ChevronRight, Sparkles, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaTodayCard } from '@/components/aria-today-card';
import { DemoDateBar } from '@/components/demo-date-bar';
import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { useColors } from '@/lib/colors';
import { formatLong, toISODate } from '@/lib/dates';
import {
  selectToday,
  selectUpcoming,
  selectWeekLoad,
  useAriaStore,
  type Task,
} from '@/store/aria-store';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);
  const proactive = useAriaStore((s) => s.settings.proactiveAria);
  const rescheduleTask = useAriaStore((s) => s.rescheduleTask);

  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [deferredMsg, setDeferredMsg] = useState<string | null>(null);

  // "Not now" on an offer defers the task to the next day and tells Maya.
  function defer(task: Task) {
    rescheduleTask(task.id, toISODate(addDays(parseISO(task.date), 1)));
    setDeferredMsg(`No problem — I've moved “${task.title}” to tomorrow. I'll remind you then.`);
  }

  const today = useMemo(() => selectToday(tasks, demoDate), [tasks, demoDate]);
  const upcoming = useMemo(() => selectUpcoming(tasks, demoDate), [tasks, demoDate]);
  const week = useMemo(() => selectWeekLoad(tasks, demoDate), [tasks, demoDate]);
  const comingUp = upcoming.filter((t) => t.date !== demoDate).slice(0, 3);

  const hasNoTasks = tasks.length === 0;

  return (
    <Screen padded>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View className="pt-3">
          <Text variant="title">
            {greeting()}, {firstName}
          </Text>
          <Text tone="muted" className="mt-1">
            {formatLong(demoDate)}
          </Text>
        </View>

        {!hasNoTasks ? <DemoDateBar /> : null}

        {/* Overloaded-week nudge */}
        {proactive && week.overloaded && !nudgeDismissed ? (
          <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            className="gap-3 rounded-3xl border border-border bg-surface p-5">
            <View className="flex-row items-center gap-2.5">
              <AriaAvatar size={30} />
              <Text variant="subtitle" className="flex-1">
                Your week looks packed
              </Text>
            </View>
            <Text className="leading-6">
              You have {week.count} tasks this week. Want to move a few things to another day or
              time?
            </Text>
            <View className="flex-row gap-2">
              <Button
                title="Rebalance my week"
                onPress={() => router.push('/rebalance')}
                className="flex-1"
              />
              <Button title="I'm good" variant="secondary" onPress={() => setNudgeDismissed(true)} />
            </View>
          </Animated.View>
        ) : null}

        {/* "Not now" confirmation — task deferred to another day */}
        {deferredMsg ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(200)}
            className="flex-row items-center gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft p-4">
            <AriaAvatar size={26} />
            <Text variant="small" className="flex-1 leading-5">
              {deferredMsg}
            </Text>
            <Pressable onPress={() => setDeferredMsg(null)} hitSlop={8} className="active:opacity-60">
              <X size={16} color={c.muted} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Today — warm welcome for a fresh account, otherwise the day's tasks */}
        {hasNoTasks ? (
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mt-1 gap-4 rounded-3xl border border-accent/25 bg-accent-soft p-5">
            <View className="flex-row items-center gap-2.5">
              <AriaAvatar size={34} />
              <Text variant="subtitle" className="flex-1">
                Let&apos;s get started, {firstName}
              </Text>
            </View>
            <Text className="leading-6">
              You don&apos;t have anything scheduled yet. Tell me what&apos;s on your plate — a
              class, a birthday, an assignment, anything — and I&apos;ll set it up. Or add one
              yourself.
            </Text>
            <View className="gap-2">
              <Button
                title="Chat with Aria"
                leftIcon={<Sparkles size={17} color={c.accentInk} />}
                onPress={() => router.push('/chat')}
              />
              <Button
                title="Add a task"
                variant="secondary"
                onPress={() => router.push('/task/new')}
              />
            </View>
          </Animated.View>
        ) : (
          <View className="gap-3">
            <Text variant="label" tone="muted">
              Today
            </Text>
            {today.length === 0 ? (
              <View className="items-center gap-2 rounded-2xl border border-border bg-surface px-6 py-10">
                <CheckCircle2 size={26} color={c.success} />
                <Text tone="muted" className="text-center">
                  Nothing due today. You&apos;re on top of things.
                </Text>
              </View>
            ) : (
              today.map((task) => {
                const action = ariaActionFor(task);
                if (proactive && action) {
                  return (
                    <AriaTodayCard
                      key={task.id}
                      task={task}
                      action={action}
                      onDismiss={() => defer(task)}
                    />
                  );
                }
                return <SwipeableTaskCard key={task.id} task={task} />;
              })
            )}
          </View>
        )}

        {/* Coming up */}
        {comingUp.length > 0 ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                Coming up
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/tasks')}
                className="flex-row items-center gap-0.5 active:opacity-60">
                <Text variant="small" tone="accent" className="font-semibold">
                  See all
                </Text>
                <ChevronRight size={16} color={c.accent} />
              </Pressable>
            </View>
            {comingUp.map((task) => (
              <SwipeableTaskCard key={task.id} task={task} />
            ))}
          </View>
        ) : null}

        {/* Aria hint footer */}
        <View className="mt-2 flex-row items-center justify-center gap-1.5 opacity-70">
          <Sparkles size={13} color={c.faint} />
          <Text variant="caption" tone="faint">
            Aria plans ahead — and always takes no for an answer.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
