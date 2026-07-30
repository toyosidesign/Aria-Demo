import { router } from 'expo-router';
import { ChevronRight, Sparkles } from 'lucide-react-native';
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
import { formatRelative, formatTime } from '@/lib/dates';
import { useAriaStore, type Task } from '@/store/aria-store';

/** A proactive Aria offer surfaced on Today — consent-first: has a clear decline. */
export function AriaTodayCard({
  task,
  action,
  onDismiss,
}: {
  task: Task;
  action: AriaAction;
  onDismiss: () => void;
}) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const [sendOpen, setSendOpen] = useState(false);
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOutUp.duration(220)}
      className="gap-3 rounded-3xl border border-accent/25 bg-accent-soft p-5">
      <Pressable
        onPress={() => router.push(`/task/${task.id}`)}
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
          <Text variant="caption" tone="muted">
            {formatRelative(task.date, demoDate)}
            {task.time ? ` · ${formatTime(task.time)}` : ''}
          </Text>
        </View>
        <ChevronRight size={18} color={c.muted} />
      </Pressable>

      <Text className="leading-6">
        It&apos;s on your list for today. {action.offer} I&apos;ll show you everything before
        anything is sent.
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
        <Button title="Not now" variant="secondary" onPress={onDismiss} />
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
