import { router } from 'expo-router';
import { CalendarClock, Camera, CircleUserRound, LogOut } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/settings-row';
import { UserAvatar } from '@/components/user-avatar';
import { WorkloadChart } from '@/components/workload-chart';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { selectDone, selectWeekLoad, useAriaStore } from '@/store/aria-store';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text variant="title">{value}</Text>
      {/* Reads as a label for the number above it, so it needs to be legible
          rather than merely present. */}
      <Text variant="small" tone="muted" className="text-center">
        {label}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const profile = useAriaStore((s) => s.profile);
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  const signOut = useAriaStore((s) => s.signOut);

  const done = useMemo(() => selectDone(tasks), [tasks]);
  const week = useMemo(() => selectWeekLoad(tasks, demoDate), [tasks, demoDate]);
  const ariaAssists = useMemo(() => tasks.filter((t) => t.handledByAria).length, [tasks]);

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      signOut();
      return;
    }
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <Screen padded>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32, gap: 28 }}
        showsVerticalScrollIndicator={false}>
        <View className="pb-1 pt-3">
          <Text variant="title">Profile</Text>
        </View>

        {/* Profile header */}
        <View className="items-center gap-3 pt-2">
          <Pressable
            onPress={() => router.push('/profile/edit')}
            accessibilityLabel="Change profile picture"
            className="active:opacity-70">
            <UserAvatar uri={profile.avatarUri} name={profile.name} size={96} />
            <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-accent">
              <Camera size={15} color={c.accentInk} />
            </View>
          </Pressable>
          <View className="items-center gap-0.5">
            <Text variant="heading">{profile.name}</Text>
            {profile.context.trim() ? <Text tone="muted">{profile.context}</Text> : null}
            <Text variant="small" tone="faint">
              {profile.email}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile/edit')}
            className="rounded-full border border-border bg-surface px-4 py-2 active:opacity-70">
            <Text variant="small" className="font-semibold">
              Edit profile
            </Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View className="flex-row rounded-2xl border border-border bg-surface py-4">
          <Stat value={done.length} label="Completed" />
          <View className="w-px bg-border" />
          <Stat value={week.count} label="This week" />
          <View className="w-px bg-border" />
          <Stat value={ariaAssists} label="Aria assists" />
        </View>

        {/* Burnout / wellbeing monitor */}
        <WorkloadChart />

        {/* What Aria is handling on your behalf */}
        <SettingsGroup
          title="Aria"
          footnote="What Aria has lined up, and what it has already handled.">
          <SettingsRow
            first
            icon={CalendarClock}
            iconColor={c.accent}
            label="Scheduled work"
            onPress={() => router.push('/activity')}
            showChevron
          />
        </SettingsGroup>

        {/* Sign out (demo) */}
        <SettingsGroup>
          <SettingsRow first icon={LogOut} iconColor={c.danger} label="Sign out" onPress={confirmSignOut} />
        </SettingsGroup>

        {/* No opacity: `muted` already steps the colour back, and stacking the
            two made this the least readable line on the screen. */}
        {/* Left-aligned, so it starts on the same line as every card, heading and
            footnote above it rather than floating in the middle. */}
        <View className="flex-row items-center gap-1.5 pt-2">
          <CircleUserRound size={15} color={c.muted} />
          <Text variant="small" tone="muted">
            Aria · demo build
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
