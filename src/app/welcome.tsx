import { router } from 'expo-router';
import { useState } from 'react';
import {
  CalendarDays,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

const FEATURES: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: MessageCircle,
    title: 'Just tell me what you need',
    body: 'Type or speak it, like “remind me to email Prof. Lee Friday at 5pm,” and I’ll set it up with the right date and time.',
  },
  {
    Icon: Sparkles,
    title: 'I plan ahead',
    body: 'On the day, I’ll surface your task and offer to help: draft a message, work through an assignment, and more.',
  },
  {
    Icon: ShieldCheck,
    title: 'I always ask first',
    body: 'Nothing is sent or changed without your OK. You’re in control the whole way.',
  },
  {
    Icon: CalendarDays,
    title: 'See it all on your Calendar',
    body: 'Everything you add shows up by day, week, and month. I’ll help you rebalance a packed week.',
  },
];

export default function WelcomeScreen() {
  const c = useColors();
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);
  const completeOnboarding = useAriaStore((s) => s.completeOnboarding);
  const updateProfile = useAriaStore((s) => s.updateProfile);

  /**
   * Starts empty, never pre-filled.
   *
   * The profile ships with the demo persona's "Sophomore at State University",
   * and that value feeds Aria's prompts as `senderContext` — so every draft for
   * a new account was pitched at a student regardless of who had signed up.
   * Onboarding only runs for new accounts, so there is nothing worth
   * pre-filling and a great deal worth not assuming.
   */
  const [context, setContext] = useState('');

  function start() {
    hapticSelect();
    // Written even when left blank, which is the point: an empty context is
    // Aria knowing nothing about you, and that is far better than Aria
    // confidently believing something untrue.
    updateProfile({ context: context.trim() });
    completeOnboarding();
    router.replace('/');
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, gap: 28, paddingVertical: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <View className="items-center gap-4 pt-4">
          <AriaAvatar size={72} />
          <View className="items-center gap-1.5">
            <Text variant="title">Hi {firstName} 👋</Text>
            <Text tone="muted" className="text-center">
              I&apos;m Aria. Here&apos;s how I can help.
            </Text>
          </View>
        </View>

        <View className="gap-5">
          {FEATURES.map((f) => (
            <View key={f.title} className="flex-row items-start gap-3.5">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
                <f.Icon size={20} color={c.accent} />
              </View>
              <View className="flex-1 gap-1">
                <Text variant="subtitle">{f.title}</Text>
                <Text tone="muted" className="leading-6">
                  {f.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Asked here rather than left to Settings, because it changes how every
            draft reads and almost nobody goes looking for it after the fact. */}
        <View className="gap-2">
          <Input
            label="What are you up to these days?"
            placeholder="e.g. Second year studying law, or Freelance designer"
            value={context}
            onChangeText={setContext}
            returnKeyType="done"
          />
          <Text variant="caption" tone="faint" className="leading-5">
            Optional, and you can change it any time in your profile. It only shapes how I word
            things for you.
          </Text>
        </View>

        <View className="mt-auto gap-3">
          <Button
            title={context.trim() ? 'Get started' : 'Skip for now'}
            block
            size="lg"
            onPress={start}
          />
          <Text variant="caption" tone="faint" className="text-center">
            You don&apos;t have any tasks yet. Add your first one whenever you&apos;re ready.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
