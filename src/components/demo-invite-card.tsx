import { Sparkles, X } from 'lucide-react-native';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * The offer to look around with sample data before committing anything real.
 *
 * An empty planner is a bad first impression: nothing to complete, nothing to
 * swipe, no sense of what Aria does with a task once it exists. Loading a few
 * example tasks answers that in one tap, and "Reset demo data" in Settings is
 * the way back out — so the invitation says that up front rather than leaving
 * someone wondering whether they've just polluted their account.
 *
 * Shown only on an empty planner (see the caller), so it can never overwrite
 * work someone has already done, and answered either way it does not return.
 */
export function DemoInviteCard() {
  const c = useColors();
  const resetDemo = useAriaStore((s) => s.resetDemo);
  const dismissDemoOffer = useAriaStore((s) => s.dismissDemoOffer);

  function load() {
    hapticSelect();
    resetDemo();
    showToast('Sample tasks added. Reset them anytime in Settings.', 'check');
  }

  function decline() {
    hapticSelect();
    dismissDemoOffer();
  }

  /**
   * Confirm before filling the planner.
   *
   * `resetDemo` also replaces contacts and clears automations, so even on an
   * empty planner it does more than add a few rows. Alert isn't available on
   * web, where the tap just takes effect.
   */
  function confirm() {
    if (Platform.OS === 'web') {
      load();
      return;
    }
    Alert.alert(
      'Add sample tasks?',
      'A few example tasks and contacts, so you can see how Aria handles them. Clear them whenever you like with "Reset demo data" in Settings.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Add them', onPress: load },
      ],
    );
  }

  return (
    <View
      style={{ borderColor: `${c.accent}40` }}
      className="gap-3 rounded-2xl border bg-accent-soft p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
          <Sparkles size={18} color={c.accentInk} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-strong">See how Aria works</Text>
          <Text variant="small" tone="muted" className="leading-5">
            Load a few sample tasks and try completing one. You can clear them and start on
            your own whenever you&apos;re ready.
          </Text>
        </View>
        <Pressable
          onPress={decline}
          hitSlop={8}
          accessibilityLabel="Dismiss"
          className="h-7 w-7 items-center justify-center rounded-full active:bg-border/60">
          <X size={15} color={c.muted} />
        </Pressable>
      </View>

      <View className="flex-row gap-2">
        <Button title="Show me" size="sm" onPress={confirm} className="flex-1" />
        <Button
          title="I'll use my own"
          variant="secondary"
          size="sm"
          onPress={decline}
          className="flex-1"
        />
      </View>
    </View>
  );
}
