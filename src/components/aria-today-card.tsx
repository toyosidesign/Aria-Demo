import { router } from 'expo-router';
import { ChevronRight, Clock, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOutUp } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { SendCardSheet } from '@/components/send-card-sheet';
import { SendPhotoSheet } from '@/components/send-photo-sheet';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { AriaAction } from '@/lib/aria-actions';
import { useColors } from '@/lib/colors';
import { formatTime } from '@/lib/dates';
import { type Task } from '@/store/aria-store';

/** A proactive Aria offer surfaced on Today, consent-first: has a clear decline. */
export function AriaTodayCard({
  task,
  action,
  onDismiss,
  /**
   * Opening the task, when something else owns that decision.
   *
   * Home nests this inside `SwipeableTaskCard` so the offer can also be dragged
   * to complete, and a swipeable row has to be able to swallow the tap that
   * ends a drag rather than navigate on it. Left unset it does the obvious
   * thing, so every other caller is unaffected.
   */
  onPress,
}: {
  task: Task;
  action: AriaAction;
  onDismiss: () => void;
  onPress?: () => void;
}) {
  const c = useColors();
  const [sendOpen, setSendOpen] = useState(false);
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOutUp.duration(220)}
      className="gap-3 rounded-3xl border border-accent/25 bg-accent-soft p-5">
      <Pressable
        onPress={onPress ?? (() => router.push(`/task/${task.id}`))}
        accessibilityLabel="Open task to view or edit"
        className="flex-row items-center gap-2.5 active:opacity-70">
        <AriaAvatar size={34} />
        <View className="flex-1">
          <Text variant="label" tone="accent">
            Aria · Today
          </Text>
          {/* Matches TaskCard: one step down from a heading, so the row reads as
              an item rather than as a title of its own. */}
          <Text className="font-strong" numberOfLines={1}>
            {task.title}
          </Text>
          {/* Time only, the header already said Today. This card is fed
              exclusively from today's tasks, so a relative date formatter could
              only ever produce "Today" again, one line under "Aria · Today".
              What isn't already known at a glance is *when* today.

              The icon is what separates it from the offer text below, which is
              also `muted`. Stepping the time down to `faint` would have been
              the obvious move and is not available: on this card's accent-soft
              panel `faint` lands at 2.3–3.3:1, well under AA, and the palette
              has no step between the two. So the distinction is made by role
              instead, an icon marks it as a data point rather than prose, the
              same way TaskCard pairs its date with a calendar. */}
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={c.muted} />
            <Text variant="caption" tone="muted">
              {task.time ? formatTime(task.time) : 'Anytime'}
            </Text>
          </View>
        </View>
        <ChevronRight size={18} color={c.muted} />
      </Pressable>

      {/* The offer, and nothing it doesn't need.

          `small` + muted rather than body weight in the default tone, which was
          the same size *and* colour as the title above it, the two read as one
          block and nothing led. Matches the demo invite and the empty-state
          card, which already step down for supporting copy.

          The text itself was 79 characters of boilerplate wrapped around every
          offer: "It's on your list for today" (which the header had already
          said, for the third time on one card) and a promise about sending.
          Together they turned a one-line offer into three or four lines of
          mostly-identical text.

          The send promise now appears only when something is actually sent.
          Most actions don't, breaking an assignment into steps or drafting an
          outline sends nothing, so on those cards it wasn't just padding, it
          implied a step that doesn't exist. */}
      <Text variant="small" tone="muted" className="leading-5">
        {action.offer}
        {action.needsSend ? ' Nothing goes out without your OK.' : ''}
      </Text>

      <View className="flex-row gap-2 pt-1">
        <Button
          title={action.cta}
          leftIcon={<Sparkles size={17} color={c.accentInk} />}
          onPress={() =>
            action.readyToSend ? setSendOpen(true) : router.push(`/aria/${task.id}`)
          }
          className="flex-1"
        />
        {/*
          "Not now" belongs on an offer, not on a reminder.
          
          Aria proposing to draft or plan something is a suggestion, and a
          suggestion needs a clear way to decline, that is the consent-first
          rule this card was built around. A card that is written and waiting is
          a different thing: it is you being reminded to send something you
          already decided to send, and offering to dismiss it invites the one
          outcome nobody wants, which is the birthday passing quietly.
          
          Pushing it to another day is still possible from the task itself.
        */}
        {action.readyToSend ? null : (
          <Button title="Not now" variant="secondary" onPress={onDismiss} />
        )}
      </View>

      {action.readyToSend ? (
        task.method === 'photo' ? (
          <SendPhotoSheet task={task} visible={sendOpen} onClose={() => setSendOpen(false)} />
        ) : (
          <SendCardSheet task={task} visible={sendOpen} onClose={() => setSendOpen(false)} />
        )
      ) : null}
    </Animated.View>
  );
}
