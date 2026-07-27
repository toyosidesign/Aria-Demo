import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOutUp } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { AriaAction } from '@/lib/aria-actions';
import { useColors } from '@/lib/colors';
import type { Task } from '@/store/aria-store';

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
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOutUp.duration(220)}
      className="gap-3 rounded-3xl border border-accent/25 bg-accent-soft p-5">
      <View className="flex-row items-center gap-2.5">
        <AriaAvatar size={34} />
        <View className="flex-1">
          <Text variant="label" tone="accent">
            Aria · Today
          </Text>
          <Text variant="subtitle" numberOfLines={1}>
            {task.title}
          </Text>
        </View>
      </View>

      <Text className="leading-6">
        It&apos;s on your list for today. {action.offer} I&apos;ll show you everything before
        anything is sent.
      </Text>

      <View className="flex-row gap-2 pt-1">
        <Button
          title={action.cta}
          leftIcon={<Sparkles size={17} color={c.accentInk} />}
          onPress={() => router.push(`/aria/${task.id}`)}
          className="flex-1"
        />
        <Button title="Not now" variant="secondary" onPress={onDismiss} />
      </View>
    </Animated.View>
  );
}
