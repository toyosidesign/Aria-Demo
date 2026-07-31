import { router } from 'expo-router';
import { CalendarClock, Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CHANNEL_META, formatRunAt } from '@/lib/automations';
import { useColors } from '@/lib/colors';
import {
  selectAutomationReport,
  selectDueAutomations,
  selectUpcomingAutomations,
  useAriaStore,
} from '@/store/aria-store';

/**
 * Aria's scheduled work on Today: what's due right now (with a way to run it),
 * what's coming, and what it already got through.
 */
export function AutomationCard() {
  const c = useColors();
  const automations = useAriaStore((s) => s.automations);

  const due = selectDueAutomations(automations);
  const upcoming = selectUpcomingAutomations(automations);
  const doneToday = selectAutomationReport(automations).filter(
    (a) => a.ranAt && Date.now() - new Date(a.ranAt).getTime() < 24 * 60 * 60 * 1000,
  );

  if (!due.length && !upcoming.length && !doneToday.length) return null;

  // Something is due — this is the moment Aria has been waiting for.
  if (due.length) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        className="gap-3 rounded-3xl border border-accent/30 bg-accent-soft p-5">
        <View className="flex-row items-center gap-2.5">
          <AriaAvatar size={30} />
          <Text variant="subtitle" className="flex-1">
            {due.length === 1 ? 'Something’s due now' : `${due.length} things are due now`}
          </Text>
        </View>
        {/* Supporting copy, not a second heading — see aria-today-card. */}
        <Text variant="small" tone="muted" className="leading-5">
          {due.length === 1
            ? `Your ${CHANNEL_META[due[0].channel].label.toLowerCase()} for “${due[0].taskTitle}” is written and ready.`
            : 'I’ve got them all drafted and addressed. Want me to work through them?'}
        </Text>
        <Button
          title={due.length === 1 ? 'Let Aria handle it' : `Handle all ${due.length}`}
          leftIcon={<Sparkles size={18} color={c.accentInk} />}
          block
          onPress={() => router.push('/aria/run')}
        />
      </Animated.View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push('/activity')}
      className="gap-3 rounded-3xl border border-border bg-surface p-5 active:opacity-80">
      <View className="flex-row items-center gap-2.5">
        <CalendarClock size={18} color={c.accent} />
        <Text variant="subtitle" className="flex-1">
          Aria’s scheduled work
        </Text>
        <ChevronRight size={18} color={c.faint} />
      </View>

      {doneToday.length ? (
        <View className="flex-row items-center gap-2">
          <Check size={15} color={c.success} />
          <Text variant="small" tone="muted" className="flex-1">
            {doneToday.length === 1
              ? `Handled “${doneToday[0].taskTitle}” for you.`
              : `Handled ${doneToday.length} tasks for you today.`}
          </Text>
        </View>
      ) : null}

      {upcoming.length ? (
        <Text variant="small" tone="muted">
          Next: {CHANNEL_META[upcoming[0].channel].label.toLowerCase()} to{' '}
          {upcoming[0].toName ?? 'them'}, {formatRunAt(upcoming[0].runAt)}
          {upcoming.length > 1 ? ` · ${upcoming.length - 1} more scheduled` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}
