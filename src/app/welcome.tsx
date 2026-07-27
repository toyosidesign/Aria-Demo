import { router } from 'expo-router';
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
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

const FEATURES: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: MessageCircle,
    title: 'Just tell me what you need',
    body: 'Type or speak it — “remind me to email Prof. Lee Friday at 5pm” — and I’ll set it up with the right date and time.',
  },
  {
    Icon: Sparkles,
    title: 'I plan ahead',
    body: 'On the day, I’ll surface your task and offer to help — draft a message, work through an assignment, and more.',
  },
  {
    Icon: ShieldCheck,
    title: 'I always ask first',
    body: 'Nothing is sent or changed without your OK. You’re in control the whole way.',
  },
  {
    Icon: CalendarDays,
    title: 'See it all on your Calendar',
    body: 'Everything you add shows up by day, week, and month — and I’ll help you rebalance a packed week.',
  },
];

export default function WelcomeScreen() {
  const c = useColors();
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);
  const completeOnboarding = useAriaStore((s) => s.completeOnboarding);

  function start() {
    hapticSelect();
    completeOnboarding();
    router.replace('/');
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, gap: 28, paddingVertical: 20 }}
        showsVerticalScrollIndicator={false}>
        <View className="items-center gap-4 pt-4">
          <AriaAvatar size={72} />
          <View className="items-center gap-1.5">
            <Text variant="title">Hi {firstName} 👋</Text>
            <Text tone="muted" className="text-center">
              I&apos;m Aria — here&apos;s how I can help.
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

        <View className="mt-auto gap-3">
          <Button title="Get started" block size="lg" onPress={start} />
          <Text variant="caption" tone="faint" className="text-center">
            You don&apos;t have any tasks yet — add your first one whenever you&apos;re ready.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
