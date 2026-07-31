import { router, type Href } from 'expo-router';
import { CalendarClock, Check, Clock, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { SnoozeChips } from '@/components/reminder-actions';
import { SwipeAction, SWIPE_ACTION_WIDTH } from '@/components/swipe-action';
import { TaskCard } from '@/components/task-card';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { isReminderOnly, selectNextDue, useAriaStore, type Task } from '@/store/aria-store';

/**
 * A task card you can swipe: right to complete or reopen, left to reschedule.
 *
 * The action is committed by tapping the revealed button, not by the swipe
 * itself. Firing mid-swipe meant the panel flashed open and slammed shut before
 * you could see what you'd done, and an accidental drag was unrecoverable.
 *
 * A reminder reads the same gestures differently: there is nothing to reschedule
 * and nothing to draft, so right is "Got it" and left offers a snooze.
 */
export function SwipeableTaskCard({
  task,
  onPress,
  /** Nudge the card once so the gesture is discoverable without instructions. */
  hintGesture = false,
  /**
   * Whether finishing a task carries you to the next one that's due.
   *
   * Off on the home screen: that's somewhere you're surveying the day, and
   * being thrown into a task detail for clearing one item takes away the view
   * you deliberately opened.
   */
  advanceOnComplete = true,
}: {
  task: Task;
  onPress?: () => void;
  hintGesture?: boolean;
  advanceOnComplete?: boolean;
}) {
  const c = useColors();
  const ref = useRef<SwipeableMethods>(null);
  /**
   * Whether the action panel is showing.
   *
   * The card underneath is a Pressable, so the tap that ends a swipe — or the
   * next tap, aimed at the revealed button — also counted as "open this task".
   * Swiping to reschedule dumped you into the task detail instead. While the
   * row is open a press closes it rather than navigating.
   */
  const openRef = useRef(false);
  /*
   * Stable identities, deliberately.
   *
   * ReanimatedSwipeable keys `dispatchImmediateEvents` on these two props, and
   * that feeds animateRow → handleRelease → panGesture, each a useCallback on
   * the last. Passing inline arrows gave them a new identity every render, so
   * the pan gesture was torn down and rebuilt constantly — and since this card
   * subscribes to `tasks`, completing one re-rendered it and destroyed the
   * gesture mid-swipe. useCallback with no deps keeps the chain intact.
   */
  const markOpen = useCallback(() => {
    openRef.current = true;
  }, []);
  const markClosed = useCallback(() => {
    openRef.current = false;
  }, []);
  const completeTask = useAriaStore((s) => s.completeTask);
  const reopenTask = useAriaStore((s) => s.reopenTask);
  const snoozeTask = useAriaStore((s) => s.snoozeTask);
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const done = task.status === 'done';
  const reminder = isReminderOnly(task);
  const [snoozing, setSnoozing] = useState(false);

  // A short lean each way, twice. Enough to read as "this moves" without
  // becoming the thing you watch instead of the task.
  const nudge = useSharedValue(0);
  useEffect(() => {
    if (!hintGesture || done) return;
    const step = (to: number) => withTiming(to, { duration: 420, easing: Easing.inOut(Easing.quad) });
    nudge.value = withRepeat(withSequence(step(-14), step(0), step(9), step(0)), 2, false);
  }, [hintGesture, done, nudge]);
  const hintStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));

  /**
   * Stop the hint the instant a real drag begins.
   *
   * The nudge animates `translateX` on the View *wrapping* the swipeable, so
   * while it runs the row carries two competing transforms: the hint's and the
   * gesture's. Dragging through it fights the animation and the row springs
   * back — which reads as the swipe being broken, and only on the one card that
   * nudges, which is why it looked like a Home-screen bug.
   *
   * A hint exists to be interrupted. The moment the gesture is real, it's done
   * its job.
   *
   * Both callbacks are `useCallback` for the same reason as the two above:
   * ReanimatedSwipeable keys its gesture on these props, and a fresh identity
   * per render rebuilds the pan mid-drag.
   */
  const stopHint = useCallback(() => {
    cancelAnimation(nudge);
    nudge.value = 0;
  }, [nudge]);

  function toggleDone() {
    ref.current?.close();
    if (done) {
      reopenTask(task.id);
      hapticSuccess();
      return;
    }
    // Read the queue before completing, so the next task is chosen by id rather
    // than by whatever the list looks like a render later.
    const next = advanceOnComplete ? selectNextDue(tasks, demoDate, task.id) : undefined;
    completeTask(task.id);
    hapticSuccess();
    // Finishing one thing hands you the next that's actually due. Nothing due
    // or overdue means the run is over, so the list simply stays put.
    if (next) router.push({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
  }

  function leftSwipe() {
    ref.current?.close();
    hapticTap();
    // Snoozing asks how long rather than guessing, so it opens the same row of
    // durations the task screen uses.
    if (reminder) setSnoozing(true);
    else router.push(`/reschedule?id=${task.id}` as Href);
  }

  return (
    <View className="gap-3">
      <Animated.View style={hintStyle}>
        <ReanimatedSwipeable
          ref={ref}
          onSwipeableWillOpen={markOpen}
          onSwipeableWillClose={markClosed}
          onSwipeableOpenStartDrag={stopHint}
          onSwipeableCloseStartDrag={stopHint}
          // 1:1 with the finger — the old value of 2 moved the row at half speed,
          // which is what made the gesture feel sticky.
          friction={1}
          leftThreshold={SWIPE_ACTION_WIDTH * 0.55}
          rightThreshold={SWIPE_ACTION_WIDTH * 0.55}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={(progress) => (
            <SwipeAction
              progress={progress}
              color={done ? c.muted : c.success}
              icon={done ? RotateCcw : Check}
              label={done ? 'Reopen task' : reminder ? 'Got it' : 'Complete task'}
              onPress={toggleDone}
            />
          )}
          renderRightActions={
            done
              ? undefined
              : (progress) => (
                  <SwipeAction
                    progress={progress}
                    color={c.accent}
                    icon={reminder ? Clock : CalendarClock}
                    label={reminder ? 'Snooze' : 'Reschedule task'}
                    onPress={leftSwipe}
                  />
                )
          }>
          <TaskCard
            task={task}
            onPress={() => {
              if (openRef.current) {
                ref.current?.close();
                return;
              }
              if (onPress) onPress();
              else router.push(`/task/${task.id}`);
            }}
          />
        </ReanimatedSwipeable>
      </Animated.View>

      {snoozing ? (
        <View>
          <SnoozeChips
            onPick={(at) => {
              hapticTap();
              snoozeTask(task.id, at);
              setSnoozing(false);
            }}
            onCancel={() => setSnoozing(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
