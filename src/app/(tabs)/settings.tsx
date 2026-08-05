import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Repeat, RotateCcw, Trash2 } from 'lucide-react-native';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { DemoDateBar } from '@/components/demo-date-bar';
import { SimulatedDateBanner } from '@/components/simulated-date-banner';
import { SettingsGroup, SettingsRow } from '@/components/settings-row';
import { ThemePicker } from '@/components/theme-picker';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { SYSTEM_DARK, SYSTEM_LIGHT, THEMES, useColors, useTheme } from '@/lib/colors';
import { formatLong, realToday } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { biometricSupport } from '@/lib/biometrics';
import { PRO_PITCH, promptProUpgrade } from '@/lib/pro';
import { showToast } from '@/lib/toast';
import { autoSendEnabled, useAriaStore } from '@/store/aria-store';

export default function SettingsScreen() {
  const c = useColors();
  // The theme actually on screen, whether that came from a pick or from the
  // device. Turning "match my device" off hands over exactly this one.
  const activeTheme = useTheme();
  const settings = useAriaStore((s) => s.settings);
  const setSetting = useAriaStore((s) => s.setSetting);
  const demoDate = useAriaStore((s) => s.demoDate);
  const simulating = demoDate !== realToday();
  const matchingDevice = settings.theme === 'system';

  // Offer the lock only where it can work — a device with no enrolled
  // biometrics would show a switch that locks you out of your own account.
  const [bio, setBio] = useState<{ available: boolean; label: string } | null>(null);
  useEffect(() => {
    void biometricSupport().then(setBio);
  }, []);
  const resetDemo = useAriaStore((s) => s.resetDemo);
  const clearAllData = useAriaStore((s) => s.clearAllData);
  const replayOnboarding = useAriaStore((s) => s.replayOnboarding);
  const pro = useAriaStore((s) => s.pro);
  const setPro = useAriaStore((s) => s.setPro);

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

  function confirmClearAll() {
    const doClear = () => {
      clearAllData();
      hapticSelect();
      showToast('Cleared. The planner is yours now.', 'check');
    };
    if (Platform.OS === 'web') {
      doClear();
      return;
    }
    // Named plainly rather than softened: this deletes real work if there is
    // any, and "Start fresh" on its own doesn't say that out loud.
    Alert.alert(
      'Delete everything?',
      'Every task and contact is removed, including anything you added yourself. Your account and settings stay as they are. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: doClear },
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
        // Sections need clear air now that each one ends in a grey footnote and
        // the next begins with a grey heading: at 22 the two ran together.
        contentContainerStyle={{ paddingBottom: 40, gap: 32 }}
        showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <View className="gap-3 pt-2">
          <Text variant="label" tone="muted">
            Appearance
          </Text>

          {/* A switch, not a two-option segmented control. "Match my device"
              isn't a colour you pick alongside the others — it's a rule about
              when to switch — and phrasing it as one of two modes cost a
              full-width control to say something a toggle says in a row. */}
          <SettingsGroup>
            <SettingsRow
              first
              label="Match my device"
              /* Off-state copy says what turning it on would *do*, not just
                 that it's off. Agreeing to something the app will then do by
                 itself — change appearance at dusk — only counts if the switch
                 said so before it was flipped. */
              description={
                matchingDevice
                  ? `Aria changes appearance on its own: ${THEMES[SYSTEM_LIGHT].label} while your device is in light mode, ${THEMES[SYSTEM_DARK].label} in dark.`
                  : `Staying on ${activeTheme.label}. Turn this on and Aria will switch between light and dark by itself, following your device.`
              }
              right={
                <Switch
                  value={matchingDevice}
                  onValueChange={(on) => {
                    hapticSelect();
                    // Turning it off keeps whatever is on screen right now, so
                    // the app doesn't jump to a different look at the moment
                    // you take control of it.
                    setSetting('theme', on ? 'system' : activeTheme.name);
                  }}
                />
              }
            />
          </SettingsGroup>

          {matchingDevice ? null : (
            <ThemePicker value={settings.theme} onChange={(v) => setSetting('theme', v)} />
          )}
        </View>

        {/* Automation — lead with what it does, not what tier it sits in.
            "Free plan" told users nothing and hid the feature entirely. */}
        {/* State goes inside the box in plain words; the footnote says what the
            feature does. It used to say Pro "isn't open yet", which stopped
            being true the day it opened — copy that describes availability has
            to be changed when availability changes. */}
        <SettingsGroup
          title="Automation"
          footnote="Schedule a message and Aria sends it at the time you pick, then reports back. It's part of Aria Pro.">
          <SettingsRow
            first
            label="Let Aria send things for you"
            description={
              pro
                ? 'Active, including every app connection.'
                : 'Part of Aria Pro. Tap to turn it on.'
            }
            onPress={pro ? undefined : () => promptProUpgrade(PRO_PITCH)}
            showChevron={!pro}
            right={
              pro ? (
                <Text variant="small" tone="accent" className="font-strong">
                  On
                </Text>
              ) : null
            }
          />
          {/*
            Only rendered with Pro, rather than shown disabled.

            This switch decides whether a real email reaches a real person
            without anyone seeing it first, so an account that isn't entitled to
            it should not have it on screen at all — a greyed-out control still
            advertises the behaviour as one tap away, and `Switch` here has no
            disabled state to lean on anyway. The row above is the upgrade path.

            Off is not "Aria does nothing": it still drafts, addresses and
            schedules. Off only means it asks before anything leaves.
          */}
          {pro ? (
            <SettingsRow
              label="Send without asking"
              description={
                autoSendEnabled(settings, pro)
                  ? 'Aria sends at the scheduled time and tells you afterwards.'
                  : 'Aria gets everything ready, then asks you before it sends.'
              }
              right={
                <Switch
                  value={autoSendEnabled(settings, pro)}
                  onValueChange={(v) => {
                    hapticSelect();
                    setSetting('autoSend', v);
                  }}
                />
              }
            />
          ) : null}
          {pro ? (
            <SettingsRow
              label="Aria Pro"
              right={
                <Text
                  variant="small"
                  tone="accent"
                  className="font-strong"
                  onPress={() => {
                    setPro(false);
                    hapticSelect();
                  }}>
                  Cancel
                </Text>
              }
            />
          ) : null}
        </SettingsGroup>

        {/* Aria */}
        <SettingsGroup
          title="Aria"
          footnote="Aria suggests what it can do on Today. Turn this off and it waits until you ask.">
          <SettingsRow
            first
            label="Let Aria offer to help"
            right={
              <Switch
                value={settings.proactiveAria}
                onValueChange={(v) => setSetting('proactiveAria', v)}
              />
            }
          />
        </SettingsGroup>

        {/* General */}
        {/* One card per toggle, each explained underneath. Three switches sharing
            a card meant three descriptions squeezed beside three switches. */}
        <SettingsGroup
          title="General"
          footnote="Task alarms and nudges for anything Aria has scheduled.">
          <SettingsRow
            first
            label="Notifications"
            right={
              <Switch
                value={settings.notifications}
                onValueChange={(v) => setSetting('notifications', v)}
              />
            }
          />
        </SettingsGroup>

        {bio?.available ? (
          <SettingsGroup footnote="Ask for it each time Aria opens.">
            <SettingsRow
              first
              label={`Unlock with ${bio.label}`}
              right={
                <Switch
                  value={settings.biometricLock}
                  onValueChange={(v) => setSetting('biometricLock', v)}
                />
              }
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup footnote="Vibrate on taps and confirmations.">
          <SettingsRow
            first
            label="Haptics"
            right={
              <Switch value={settings.haptics} onValueChange={(v) => setSetting('haptics', v)} />
            }
          />
        </SettingsGroup>

        {/* Demo */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Demo
          </Text>
          <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
            {/* Three tiers, each a step down in both size and contrast: the card's
                name, then what the date currently is, then the ambient
                explanation. Previously the explanation was 14px and the status
                line 13px, both muted, so the least important text was the
                largest and nothing told them apart. */}
            <View className="gap-0.5">
              <Text className="text-[16px] font-strong leading-[23px]">
                Pretend it&apos;s another day
              </Text>
              <Text
                variant="small"
                tone={simulating ? 'accent' : 'muted'}
                className="text-[14px] leading-[20px]">
                {simulating
                  ? `Simulating ${formatLong(demoDate)}`
                  : `On the real date, ${formatLong(demoDate)}`}
              </Text>
            </View>

            {/* Same banner as Today and Calendar, so the fix is one tap wherever
                you notice the date is off. */}
            <SimulatedDateBanner />

            <Text variant="caption" tone="faint" className="text-[13px] leading-[19px]">
              Jump to a date where a task is waiting, so you can see how Aria offers to help
              without waiting for the real day to arrive.
            </Text>
            <DemoDateBar compact />
          </View>
        </View>

        {/* Self-contained: the text sits in the box with the label, and the red
            glyph sits on the right where the other rows keep their control. It's
            the one destructive action here, so it reads as its own thing rather
            than as another harmless setting. */}
        <SettingsGroup>
          <SettingsRow
            first
            label="Reset demo data"
            description="Restore the original sample tasks."
            right={<RotateCcw size={19} color={c.danger} />}
            onPress={confirmReset}
          />
          {/* The way *out* of the demo. Reset only ever puts the samples back,
              so without this the only escape was deleting each task by hand. */}
          <SettingsRow
            label="Start fresh"
            description="Delete every task and contact, and use your own data."
            right={<Trash2 size={19} color={c.danger} />}
            onPress={confirmClearAll}
          />
          {/* Development only. Onboarding runs once per account, so without
              this every look at it costs a sign-out, a deleted account and a
              fresh signup — which is why it's the screen that gets checked
              least and breaks most. Stripped from release builds. */}
          {__DEV__ ? (
            <SettingsRow
              label="Replay onboarding"
              description="Development only. Shows the welcome flow again; your answers are kept."
              right={<Repeat size={19} color={c.muted} />}
              onPress={() => {
                hapticSelect();
                replayOnboarding();
              }}
            />
          ) : null}
        </SettingsGroup>

        {/* Support */}
        <SettingsGroup title="Support">
          {/* Text in the box, chevron on the right: it goes somewhere, so it
              gets the affordance that says so. */}
          <SettingsRow
            first
            label="Send feedback"
            description="Share an idea or report an issue, straight to the team."
            onPress={() => router.push('/support')}
            showChevron
          />
        </SettingsGroup>

        {/* About */}
        <SettingsGroup title="About">
          <SettingsRow first label="Version" right={<Text tone="muted" variant="small">1.0.0</Text>} />
          <SettingsRow
            label="Built with"
            right={
              <Text tone="muted" variant="small">
                Expo · React Native
              </Text>
            }
          />
        </SettingsGroup>

        {/* Same line, same treatment as the home screen footer. */}
        <Text variant="small" tone="faint" className="text-center">
          Aria plans ahead, and always takes no for an answer.
        </Text>
      </ScrollView>
    </Screen>
  );
}
