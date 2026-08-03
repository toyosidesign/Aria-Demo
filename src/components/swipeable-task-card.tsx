import { router, type Href } from 'expo-router';
import { CalendarClock, Check, Clock, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
 * ── The drag commits. It did not used to ────────────────────────────────────
 *
 * This used to only *reveal* a round button, which you then had to tap. That
 * reads as broken to anyone who has used Mail: you drag, the row springs back,
 * and nothing happened. Reported three times as "swipe doesn't work" — the
 * gesture was firing correctly the whole time and doing exactly what it was
 * built to do.
 *
 * The original note against committing on the swipe said the panel "flashed
 * open and slammed shut before you could see what you'd done, and an accidental
 * drag was unrecoverable". Both objections are answered rather than ignored:
 *
 *   · COMMIT_RATIO makes it a deliberate drag, most of the way across the
 *     revealed area, not the 55% that a scroll could brush past.
 *   · Neither action is destructive. Completing is undone by swiping the same
 *     card back the other way (`reopenTask`); rescheduling opens a screen you
 *     can back out of. Nothing is lost by a mis-swipe.
 *
 * The button still renders under the row and still commits on tap — it is the
 * affordance that shows what the drag is about to do.
 *
 * A reminder reads the same gestures differently: there is nothing to reschedule
 * and nothing to draft, so right is "Got it" and left offers a snooze.
 */
/**
 * How far across the revealed area a drag must go before it counts.
 *
 * Above the old 0.55 on purpose. When the drag merely revealed a button, a low
 * threshold was free — the worst case was a panel you ignored. Now that the
 * drag performs the action, the threshold is the confirmation step, so it wants
 * to be past the halfway point of a gesture nobody makes by accident. Overshoot
 * is disabled, so the row tops out at SWIPE_ACTION_WIDTH and this is a real
 * fraction of the reachable distance, not a fraction of infinity.
 */
const COMMIT_RATIO = 0.75;
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
  scrollRef,
  /**
   * Render something other than a TaskCard inside the same gesture.
   *
   * Home is why this exists. Its Today list sends most tasks to `AriaTodayCard`
   * before they ever reach this component, and that card carries no gesture at
   * all — so "drag to complete" silently did nothing on the majority of cards
   * on the one screen people use most. It looked intermittent because the
   * cards that *do* swipe there (fired reminders, Coming up) sit right next to
   * the ones that don't.
   *
   * A render prop rather than a second swipeable component: the gesture below
   * carries three separate hard-won fixes — stable callback identity, the open
   * row swallowing a tap, and the hint cancelling on drag — and a copy would
   * inherit none of them.
   *
   * It receives the guarded press handler, which must be used as the card's
   * own `onPress`. See `handlePress`.
   */
  renderCard,
}: {
  task: Task;
  onPress?: () => void;
  hintGesture?: boolean;
  advanceOnComplete?: boolean;
  /**
   * The scrolling container this row sits in.
   *
   * Without it the parent scroll and this row's pan compete for the same drag,
   * and the scroll usually wins: the row follows your finger far enough to look
   * like it's opening, the scroll claims the gesture, the pan is cancelled, and
   * the row springs back. Nothing in the release logic runs at all — it looks
   * like a threshold problem and isn't one.
   *
   * Passing the container makes the row's gesture take precedence over it, so a
   * horizontal drag belongs to the row and a vertical one still scrolls.
   */
  scrollRef?: React.RefObject<unknown>;
  renderCard?: (props: { onPress: () => void }) => ReactNode;
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
  const markClosed = useCallback(() => {
    openRef.current = false;
  }, []);
  const snoozeTask = useAriaStore((s) => s.snoozeTask);
  const done = task.status === 'done';
  const reminder = isReminderOnly(task);
  const [snoozing, setSnoozing] = useState(false);

  /*
   * Everything the commit handler needs that changes between renders, kept in a
   * ref so the handler itself never has to.
   *
   * `onSwipeableOpen` sits in the same dependency chain as the two callbacks
   * above — dispatchEndEvents → animateRow → handleRelease → panGesture — so a
   * fresh identity per render rebuilds the pan, which is the bug that comment
   * describes. It cannot close over `task` or `done` directly and stay stable.
   *
   * `tasks` and `demoDate` are read from the store at commit time rather than
   * subscribed to, and that is the same fix one level down: subscribing meant
   * every card on the screen re-rendered whenever any task anywhere changed,
   * which is what made a mid-drag rebuild likely in the first place.
   */
  const latest = useRef({ task, done, reminder, advanceOnComplete });
  latest.current = { task, done, reminder, advanceOnComplete };

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

  /**
   * The card's own tap, with the open-row guard.
   *
   * Shared by the default TaskCard and by anything passed through `renderCard`,
   * because the guard is not optional: while the action panel is showing, the
   * card underneath is still pressable, so the tap that ends a swipe — or the
   * next one, aimed at the revealed button — counted as "open this task" and
   * swiping to reschedule dumped you into the task detail instead.
   */
  function handlePress() {
    if (openRef.current) {
      ref.current?.close();
      return;
    }
    if (onPress) onPress();
    else router.push(`/task/${task.id}`);
  }

  const toggleDone = useCallback(() => {
    const { task: t, done: isDone, advanceOnComplete: advance } = latest.current;
    ref.current?.close();
    // Read from the store rather than from a subscription — see `latest`.
    const store = useAriaStore.getState();
    if (isDone) {
      store.reopenTask(t.id);
      hapticSuccess();
      return;
    }
    // Read the queue before completing, so the next task is chosen by id rather
    // than by whatever the list looks like a render later.
    const next = advance ? selectNextDue(store.tasks, store.demoDate, t.id) : undefined;
    store.completeTask(t.id);
    hapticSuccess();
    // Finishing one thing hands you the next that's actually due. Nothing due
    // or overdue means the run is over, so the list simply stays put.
    if (next) router.push({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
  }, []);

  const leftSwipe = useCallback(() => {
    const { task: t, reminder: isReminder } = latest.current;
    ref.current?.close();
    hapticTap();
    // Snoozing asks how long rather than guessing, so it opens the same row of
    // durations the task screen uses.
    if (isReminder) setSnoozing(true);
    else router.push(`/reschedule?id=${t.id}` as Href);
  }, []);

  /**
   * The drag, committed.
   *
   * `WillOpen`, not `Open`, and the difference is the whole reason the original
   * attempt at this was abandoned. `onSwipeableOpen` fires from the spring's
   * completion callback — the row finishes animating open, *then* the action
   * runs and closes it, which is the "flashed open and slammed shut" in the
   * note at the top of this file. `onSwipeableWillOpen` is dispatched
   * synchronously inside `animateRow`, which only ever runs from
   * `handleRelease`. So it fires the instant you let go, the action happens on
   * a row that never visibly opened, and the swipe reads as one movement.
   *
   * It also replaces the old `markOpen`: the row is about to open, so the tap
   * guard wants setting here either way.
   *
   * The direction is gesture-handler's and reads backwards. `RIGHT` means the
   * row settled at a positive offset — the LEFT actions revealed, by a drag to
   * the right. So 'right' is the complete side and 'left' is the reschedule
   * side, matching the two `render*Actions` props below.
   */
  const handleWillOpen = useCallback(
    (direction: 'left' | 'right') => {
      openRef.current = true;
      if (direction === 'right') toggleDone();
      else leftSwipe();
    },
    [toggleDone, leftSwipe],
  );

  return (
    <View className="gap-3">
      <Animated.View style={hintStyle}>
        <ReanimatedSwipeable
          ref={ref}
          // The drag is the action: this is what makes letting go past the
          // threshold actually complete or reschedule the task.
          onSwipeableWillOpen={handleWillOpen}
          onSwipeableWillClose={markClosed}
          onSwipeableOpenStartDrag={stopHint}
          onSwipeableCloseStartDrag={stopHint}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blocksExternalGesture={scrollRef as any}
          // 1:1 with the finger — the old value of 2 moved the row at half speed,
          // which is what made the gesture feel sticky.
          friction={1}
          leftThreshold={SWIPE_ACTION_WIDTH * COMMIT_RATIO}
          rightThreshold={SWIPE_ACTION_WIDTH * COMMIT_RATIO}
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
          {renderCard ? (
            renderCard({ onPress: handlePress })
          ) : (
            <TaskCard task={task} onPress={handlePress} />
          )}
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
            // A reminder for a specific day, not "in three hours". Reschedule
            // already draws the month calendar and a time, so this hands over
            // rather than growing a second date picker inside a swipe.
            onPickDate={() => {
              hapticTap();
              setSnoozing(false);
              router.push(`/reschedule?id=${task.id}` as Href);
            }}
            onCancel={() => setSnoozing(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
