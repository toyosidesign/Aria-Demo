import {
  Bell,
  CalendarClock,
  Info,
  RotateCcw,
  Smartphone,
  Sparkles,
  Vibrate,
} from 'lucide-react-native';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/settings-row';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { formatLong } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { DEFAULT_DEMO_DATE, useAriaStore, type ThemePref } from '@/store/aria-store';

export default function SettingsScreen() {
  const c = useColors();
  const settings = useAriaStore((s) => s.settings);
  const setSetting = useAriaStore((s) => s.setSetting);
  const demoDate = useAriaStore((s) => s.demoDate);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);
  const resetDemo = useAriaStore((s) => s.resetDemo);

  function confirmReset() {
    const doReset = () => {
      resetDemo();
      hapticSelect();
    };
    if (Platform.OS === 'web') {
      doReset();
      return;
    }
    Alert.alert(
      'Reset demo data?',
      'This restores the original sample tasks and clears anything you added.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: doReset },
      ],
    );
  }

  return (
    <Screen padded>
      <View className="pb-2 pt-3">
        <Text variant="title">Settings</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40, gap: 22 }}
        showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <View className="gap-2 pt-2">
          <Text variant="label" tone="muted" className="px-1">
            Appearance
          </Text>
          <Segmented<ThemePref>
            value={settings.theme}
            onChange={(v) => {
              setSetting('theme', v);
              hapticSelect();
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Text variant="caption" tone="faint" className="px-1">
            {settings.theme === 'system'
              ? 'Follows your device appearance.'
              : `Always ${settings.theme}.`}
          </Text>
        </View>

        {/* Aria */}
        <SettingsGroup title="Aria">
          <SettingsRow
            first
            icon={Sparkles}
            iconColor={c.accent}
            label="Proactive help"
            description="Let Aria surface tasks and offer to act on Today"
            right={
              <Switch
                value={settings.proactiveAria}
                onValueChange={(v) => setSetting('proactiveAria', v)}
              />
            }
          />
        </SettingsGroup>

        {/* General */}
        <SettingsGroup title="General">
          <SettingsRow
            first
            icon={Bell}
            label="Notifications"
            description="Remind me when tasks are due"
            right={
              <Switch
                value={settings.notifications}
                onValueChange={(v) => setSetting('notifications', v)}
              />
            }
          />
          <SettingsRow
            icon={Vibrate}
            label="Haptics"
            description="Vibrate on taps and confirmations"
            right={
              <Switch value={settings.haptics} onValueChange={(v) => setSetting('haptics', v)} />
            }
          />
        </SettingsGroup>

        {/* Demo */}
        <SettingsGroup title="Demo">
          <SettingsRow
            first
            icon={CalendarClock}
            label="Simulated date"
            description={formatLong(demoDate)}
            right={
              demoDate !== DEFAULT_DEMO_DATE ? (
                <Text
                  variant="small"
                  tone="accent"
                  className="font-semibold"
                  onPress={() => setDemoDate(DEFAULT_DEMO_DATE)}>
                  Reset
                </Text>
              ) : undefined
            }
          />
          <SettingsRow
            icon={RotateCcw}
            iconColor={c.danger}
            label="Reset demo data"
            description="Restore the original sample tasks"
            onPress={confirmReset}
          />
        </SettingsGroup>

        {/* About */}
        <SettingsGroup title="About">
          <SettingsRow first icon={Info} label="Version" right={<Text tone="muted" variant="small">1.0.0</Text>} />
          <SettingsRow
            icon={Smartphone}
            label="Built with"
            right={
              <Text tone="muted" variant="small">
                Expo · React Native
              </Text>
            }
          />
        </SettingsGroup>

        <Text variant="caption" tone="faint" className="text-center">
          Aria plans ahead — and always takes no for an answer.
        </Text>
      </ScrollView>
    </Screen>
  );
}
