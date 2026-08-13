import { router } from 'expo-router';
import { Lock, Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { goBack } from '@/lib/nav';
import { hapticSelect } from '@/lib/haptics';
import { PRO_PITCH, promptProUpgrade } from '@/lib/pro';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

interface AppInfo {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** Pro-only integrations are locked until the user upgrades. */
  pro?: boolean;
}

const APPS: AppInfo[] = [
  { id: 'gmail', name: 'Gmail', emoji: '✉️', desc: 'Send the emails Aria drafts for you' },
  { id: 'gcal', name: 'Google Calendar', emoji: '📅', desc: 'Two-way sync with your calendar' },
  { id: 'teams', name: 'Microsoft Teams', emoji: '👥', desc: 'Post reminders and messages', pro: true },
  { id: 'm365', name: 'Microsoft 365', emoji: '🪟', desc: 'Sync Outlook mail and calendar', pro: true },
  { id: 'maps', name: 'Google Maps', emoji: '🗺️', desc: 'Add travel time to your events', pro: true },
  { id: 'bolt', name: 'Bolt', emoji: '⚡', desc: 'Book rides to your appointments', pro: true },
  { id: 'slack', name: 'Slack', emoji: '💬', desc: 'Share tasks to a channel', pro: true },
  { id: 'zoom', name: 'Zoom', emoji: '🎥', desc: 'Attach meeting links to tasks', pro: true },
];

// The free integrations start connected; the rest are Pro-locked.
const INITIAL: Record<string, boolean> = { gmail: true, gcal: true };

export default function ConnectionsScreen() {
  const c = useColors();
  const pro = useAriaStore((s) => s.pro);
  const [connected, setConnected] = useState<Record<string, boolean>>(INITIAL);

  function toggle(app: AppInfo, on: boolean) {
    setConnected((prev) => ({ ...prev, [app.id]: on }));
    showToast(on ? `Connected to ${app.name}` : `Disconnected ${app.name}`, on ? 'check' : 'trash');
  }

  function promptUpgrade(app: AppInfo) {
    hapticSelect();
    promptProUpgrade(`Connect ${app.name} and every other integration. ${PRO_PITCH}`);
  }

  const count = Object.values(connected).filter(Boolean).length;

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => goBack()} />
        <Text variant="subtitle" className="flex-1">
          Connections
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>
        {/* Pro banner */}
        <View className="gap-2 rounded-3xl border border-accent/30 bg-accent-soft p-5">
          <View className="flex-row items-center gap-2.5">
            <AriaAvatar size={30} />
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text variant="subtitle">Aria Pro</Text>
                <View className="rounded-full border border-accent/40 bg-accent px-2 py-0.5">
                  <Text variant="caption" className="font-heavy" style={{ color: c.accentInk }}>
                    PRO
                  </Text>
                </View>
              </View>
              <Text variant="caption" tone="muted">
                {count} of {APPS.length} apps connected
              </Text>
            </View>
          </View>
          <Text className="leading-6">
            {pro
              ? 'Every app is unlocked, and Aria can take work off your hands on a schedule.'
              : 'Gmail and Calendar are ready to go. Aria Pro adds scheduled work Aria handles for you, plus Teams, Maps, Bolt and the rest.'}
          </Text>
          {!pro ? (
            <Button title="Turn on Aria Pro" block onPress={() => promptProUpgrade(PRO_PITCH)} />
          ) : null}
        </View>

        {/* Integrations */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Your apps
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {APPS.map((app, i) => {
              const on = !!connected[app.id];
              const locked = !!app.pro && !pro;
              const rowClass = `flex-row items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''} ${locked ? 'opacity-60' : ''}`;
              const inner = (
                <>
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
                    <Text className="text-xl">{app.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-strong">{app.name}</Text>
                      {!locked && on ? (
                        <Text variant="caption" tone="accent" className="font-strong">
                          Connected
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {app.desc}
                    </Text>
                  </View>
                  {locked ? (
                    <View className="flex-row items-center gap-1 rounded-full border border-border bg-bg px-2.5 py-1">
                      <Lock size={11} color={c.faint} />
                      <Text variant="caption" tone="faint" className="font-heavy">
                        PRO
                      </Text>
                    </View>
                  ) : (
                    <Switch value={on} onValueChange={(v) => toggle(app, v)} />
                  )}
                </>
              );
              return locked ? (
                <Pressable
                  key={app.id}
                  onPress={() => promptUpgrade(app)}
                  className={`${rowClass} active:opacity-40`}>
                  {inner}
                </Pressable>
              ) : (
                <View key={app.id} className={rowClass}>
                  {inner}
                </View>
              );
            })}
          </View>
        </View>

        <View className="flex-row items-center justify-center gap-1.5 opacity-70">
          <Sparkles size={13} color={c.faint} />
          <Text variant="caption" tone="faint">
            {pro ? 'Included with your Aria Pro plan.' : 'Aria Pro unlocks all of these.'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
