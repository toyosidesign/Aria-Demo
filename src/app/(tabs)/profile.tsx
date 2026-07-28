import { router } from 'expo-router';
import { CircleUserRound, LogOut } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/settings-row';
import { WorkloadChart } from '@/components/workload-chart';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { selectDone, selectWeekLoad, useAriaStore } from '@/store/aria-store';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'M';
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted" className="text-center">
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
        contentContainerStyle={{ paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}>
        <View className="pb-1 pt-3">
          <Text variant="title">Profile</Text>
        </View>

        {/* Profile header */}
        <View className="items-center gap-3 pt-2">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-accent-soft">
            <Text className="text-3xl font-bold text-accent">{initials(profile.name)}</Text>
          </View>
          <View className="items-center gap-0.5">
            <Text variant="heading">{profile.name}</Text>
            <Text tone="muted">
              {profile.year} · {profile.school}
            </Text>
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

        {/* Sign out (demo) */}
        <SettingsGroup>
          <SettingsRow first icon={LogOut} iconColor={c.danger} label="Sign out" onPress={confirmSignOut} />
        </SettingsGroup>

        <View className="flex-row items-center justify-center gap-1.5 pt-2 opacity-60">
          <CircleUserRound size={13} color={c.faint} />
          <Text variant="caption" tone="faint">
            Aria for Students · demo build
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
