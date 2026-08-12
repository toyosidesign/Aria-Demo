import { addDays, parseISO } from 'date-fns';
import { router } from 'expo-router';
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
  Plus,
  Sparkles,
  X,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaTodayCard } from '@/components/aria-today-card';
import { AutomationCard } from '@/components/automation-card';
import { DemoInviteCard } from '@/components/demo-invite-card';
import { SimulatedDateBanner } from '@/components/simulated-date-banner';
import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ariaActionFor } from '@/lib/aria-actions';
import { buildReview, reviewSummary } from '@/lib/daily-review';
import { useColors } from '@/lib/colors';
import { formatLong, toISODate } from '@/lib/dates';
import {
  hasReminderFired,
  isReminderOnly,
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
  const demoOfferDismissed = useAriaStore((s) => s.demoOfferDismissed);
  const pro = useAriaStore((s) => s.pro);
  const lastReviewedOn = useAriaStore((s) => s.lastReviewedOn);
  const rescheduleTask = useAriaStore((s) => s.rescheduleTask);
  const markDayReviewed = useAriaStore((s) => s.markDayReviewed);
  /*
   * Handed to every swipeable row so the row's drag beats the page's.
   * Without it the scroll steals the pan and rows snap back mid-swipe.
   */
  const scrollRef = useRef(null);

  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [deferred, setDeferred] = useState<{ id: string; title: string } | null>(null);

  // "Not now" on an offer moves the task to tomorrow so it isn't lost, but
  // tomorrow is a guess, so the confirmation offers a proper day and time too.
  function defer(task: Task) {
    // Silent: the banner below is the feedback, and "rescheduled" isn't true
    // until Maya has actually settled on a day.
    rescheduleTask(task.id, toISODate(addDays(parseISO(task.date), 1)), { silent: true });
    setDeferred({ id: task.id, title: task.title });
  }

  const today = useMemo(() => selectToday(tasks, demoDate), [tasks, demoDate]);
  // Only the topmost fired reminder demonstrates the gesture: the hint is there
  // to teach it once, not to set every card moving at the same time.
  const firstFiredReminderId = useMemo(
    () => today.find((t) => isReminderOnly(t) && hasReminderFired(t, demoDate))?.id,
    [today, demoDate],
  );
  const upcoming = useMemo(() => selectUpcoming(tasks, demoDate), [tasks, demoDate]);
  const week = useMemo(() => selectWeekLoad(tasks, demoDate), [tasks, demoDate]);
  const later = upcoming.filter((t) => t.date !== demoDate);
  const comingUp = later.slice(0, 3);
  // "See all" is only worth offering when the Tasks tab holds appreciably more
  // than this screen is already showing. Sending someone to a fuller list that
  // turns out to be the same three cards is a wasted trip.
  const showSeeAll = later.length > 5 || today.length > 5;

  const hasNoTasks = tasks.length === 0;
  const showDemoInvite = hasNoTasks && !demoOfferDismissed;

  /*
   * The Pro morning: one card, once a day, and then it is gone.
   *
   * Shown only while there is something approval would actually act on. A
   * review of a day Aria cannot help with is a prompt asking somebody to
   * confirm that they will be doing their own work, which is worse than
   * silence. Free accounts never see it: on Free the offers on each card below
   * are the whole product, and this would be an advert wearing the same clothes
   * as the app.
   */
  const review = useMemo(() => buildReview(tasks, demoDate), [tasks, demoDate]);
  const showReview = pro && lastReviewedOn !== demoDate && review.actionable.length > 0;

  return (
    <Screen padded>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}>
        {/* Top bar: brand + Pro on the left, connections + profile on the right */}
        <View className="flex-row items-center justify-between pt-2">
          <View className="flex-row items-center gap-2.5">
            <AriaAvatar size={38} />
            <Text className="text-2xl font-heavy tracking-tight">Aria</Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <Pressable
              onPress={() => router.push(`/task/new?date=${demoDate}`)}
              hitSlop={6}
              accessibilityLabel="Add a task"
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface active:opacity-70">
              <Plus size={19} color={c.ink} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/connections')}
              hitSlop={6}
              accessibilityLabel="Connected apps"
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface active:opacity-70">
              <LayoutGrid size={18} color={c.ink} />
            </Pressable>
          </View>
        </View>

        {/* Greeting */}
        <View>
          {/* One line, always. "Good afternoon, Oluwatobiloba" wraps at 29px on
              a normal phone, and the second line reads as an indent rather than
              as a continuation. Shrinking beats truncating here, a greeting
              that clips someone's name is worse than one set a little smaller. */}
          <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {greeting()}, {firstName}
          </Text>
          <Text tone="muted" className="mt-1">
            {formatLong(demoDate)}
          </Text>
        </View>

        {/* Overloaded week, first thing under the greeting.
            This is the one card that changes what you do with your day, and
            it used to sit below Today and Coming up, where it was reached only
            by scrolling past the very tasks it is warning about. */}
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

        <SimulatedDateBanner />

        {/* Only on an empty planner, so accepting it can never overwrite work
            someone has already done. Answered either way, it doesn't return. */}
        {showDemoInvite ? <DemoInviteCard /> : null}

        {showReview ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            className="gap-3 rounded-2xl border border-accent bg-accent-soft p-4">
            <View className="flex-row items-center gap-2.5">
              <AriaAvatar size={26} />
              <Text variant="small" className="flex-1 leading-5">
                {reviewSummary(review)}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Button
                title="Review my day"
                className="flex-1"
                onPress={() => router.push('/review')}
              />
              {/* Dismissing is answering: it marks the day so the card does not
                  ask again this morning, and nothing is scheduled. */}
              <Button
                title="Not now"
                variant="secondary"
                onPress={() => markDayReviewed(demoDate)}
              />
            </View>
          </Animated.View>
        ) : null}

        {/* "Not now" confirmation, moved to tomorrow, with a way to pick properly */}
        {deferred ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(200)}
            className="gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-4">
            <View className="flex-row items-center gap-2.5">
              <AriaAvatar size={26} />
              <Text variant="small" className="flex-1 leading-5">
                No problem. I&apos;ve moved “{deferred.title}” to tomorrow. Want a different day or
                time?
              </Text>
              <Pressable onPress={() => setDeferred(null)} hitSlop={8} className="active:opacity-60">
                <X size={16} color={c.muted} />
              </Pressable>
            </View>
            <View className="flex-row gap-2">
              <Button
                title="Pick a day & time"
                size="sm"
                leftIcon={<CalendarClock size={16} color={c.accentInk} />}
                className="flex-1"
                onPress={() => {
                  const id = deferred.id;
                  setDeferred(null);
                  router.push({ pathname: '/reschedule', params: { id } });
                }}
              />
              <Button
                title="Tomorrow's fine"
                variant="secondary"
                size="sm"
                onPress={() => setDeferred(null)}
              />
            </View>
          </Animated.View>
        ) : null}

        {/* Today, warm welcome for a fresh account, otherwise the day's tasks */}
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
            {/* `small` + muted, not body + ink. At 16px in the same tone as the
                heading above it, four lines of explanation outweighed the thing
                it was explaining, the two read as one undifferentiated block. */}
            <Text variant="small" tone="muted" className="leading-5">
              You don&apos;t have anything scheduled yet. Tell me what&apos;s on your plate: a
              class, a birthday, an assignment, anything, and I&apos;ll set it up. Or add one
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
                // Aria's offer, and still draggable.
                //
                // This branch used to return a bare AriaTodayCard, which has no
                // gesture on it, so on the screen where most tasks land here,
                // "drag to complete" quietly did nothing. It read as an
                // intermittent bug because the cards that do swipe (a fired
                // reminder below, anything under Coming up) sit right beside
                // the ones that didn't.
                if (proactive && action) {
                  return (
                    <SwipeableTaskCard
                      key={task.id}
                      task={task}
                      scrollRef={scrollRef}
                      advanceOnComplete={false}
                      renderCard={({ onPress }) => (
                        <AriaTodayCard
                          task={task}
                          action={action}
                          onDismiss={() => defer(task)}
                          onPress={onPress}
                        />
                      )}
                    />
                  );
                }
                // A fired reminder is answered with a gesture rather than a pair
                // of buttons: drag right for "Got it", left to snooze. Only the
                // first one nudges, so a list of reminders doesn't ripple.
                if (isReminderOnly(task) && hasReminderFired(task, demoDate)) {
                  const first = firstFiredReminderId === task.id;
                  return (
                    <SwipeableTaskCard
                      key={task.id}
                      task={task}
                      hintGesture={first}
                      advanceOnComplete={false}
                      scrollRef={scrollRef}
                    />
                  );
                }
                // Completing from here keeps you here: the home screen is where
                // you survey the day, not a queue to be marched through.
                return (
                  <SwipeableTaskCard
                    key={task.id}
                    task={task}
                    advanceOnComplete={false}
                    scrollRef={scrollRef}
                  />
                );
              })
            )}

            <Pressable
              onPress={() => router.push(`/task/new?date=${demoDate}`)}
              className="flex-row items-center gap-2 self-start rounded-full px-2 py-1.5 active:opacity-60">
              <Plus size={17} color={c.accent} />
              <Text variant="small" tone="accent" className="font-strong">
                Add a task
              </Text>
            </Pressable>
          </View>
        )}

        {/* Work Aria has taken on: due now, coming up, or already handled */}
        <AutomationCard />

        {/* Coming up */}
        {comingUp.length > 0 ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                Coming up
              </Text>
              {showSeeAll ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/tasks')}
                  className="flex-row items-center gap-0.5 active:opacity-60">
                  <Text variant="small" tone="accent" className="font-strong">
                    See all
                  </Text>
                  <ChevronRight size={16} color={c.accent} />
                </Pressable>
              ) : null}
            </View>
            {comingUp.map((task) => (
              <SwipeableTaskCard
                key={task.id}
                task={task}
                advanceOnComplete={false}
                scrollRef={scrollRef}
              />
            ))}
          </View>
        ) : null}

        {/* One defined step back from `muted` to `faint`, rather than an opacity
            on top of a tone. Still no opacity: stacking one on a 12px `caption`
            is what made this illegible before, and a palette step is something
            the theme controls in both light and dark. */}
        {/* Stacked, not a row.

            Side by side, the sentence is wider than any phone, it wraps to two
            lines at every size, and `items-center` then floated the sparkle
            against the middle of a two-line block, which reads as a layout bug.
            Above the text it can't clip, can't wrap oddly, and stays balanced at
            any width or accessibility text size. */}
        <View className="mt-2 items-center gap-1.5 px-6">
          <Sparkles size={15} color={c.faint} />
          <Text variant="small" tone="faint" className="text-center leading-5">
            Aria plans ahead, and always takes no for an answer.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
