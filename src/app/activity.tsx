import { router } from 'expo-router';
import { AlertTriangle, CalendarClock, Check, X } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { CHANNEL_META, formatRunAt, reportLine, type Automation } from '@/lib/automations';
import { useColors } from '@/lib/colors';
import {
  selectAutomationReport,
  selectUpcomingAutomations,
  useAriaStore,
} from '@/store/aria-store';

/** Everything Aria has taken on: what's still coming, and what it has done. */
export default function ActivityScreen() {
  const c = useColors();
  const automations = useAriaStore((s) => s.automations);
  const cancelAutomation = useAriaStore((s) => s.cancelAutomation);

  const upcoming = selectUpcomingAutomations(automations);
  const report = selectAutomationReport(automations);

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle">Aria’s activity</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 22, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}>
        {!upcoming.length && !report.length ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled yet"
            subtitle="Draft a message with Aria, then choose “Let Aria handle it” to have it go out at a time you pick."
          />
        ) : null}

        {upcoming.length ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Aria will handle
            </Text>
            {upcoming.map((a) => (
              <Row key={a.id} automation={a} onCancel={() => cancelAutomation(a.id)} />
            ))}
          </View>
        ) : null}

        {report.length ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Done
            </Text>
            {report.map((a) => {
              const failed = a.status === 'failed';
              return (
                <View
                  key={a.id}
                  className="flex-row items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
                  {failed ? (
                    <AlertTriangle size={17} color={c.danger} style={{ marginTop: 1 }} />
                  ) : (
                    <Check size={17} color={c.success} style={{ marginTop: 1 }} />
                  )}
                  <View className="flex-1 gap-0.5">
                    <Text variant="small" className="font-semibold">
                      {a.taskTitle}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {reportLine(a)}
                      {a.ranAt ? ` · ${formatRunAt(a.ranAt)}` : ''}
                    </Text>
                    {a.error ? (
                      <Text variant="caption" tone="danger">
                        {a.error}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({ automation, onCancel }: { automation: Automation; onCancel: () => void }) {
  const c = useColors();
  const meta = CHANNEL_META[automation.channel];
  const Icon = meta.icon;
  return (
    <View className="flex-row items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <Icon size={17} color={c.accent} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-0.5">
        <Text variant="small" className="font-semibold">
          {automation.taskTitle}
        </Text>
        <Text variant="caption" tone="muted">
          {meta.label} to {automation.toName ?? 'them'} · {formatRunAt(automation.runAt)}
        </Text>
        <Text variant="caption" tone="faint">
          {meta.autonomous ? 'Aria sends this one' : 'Aria will have it ready to tap send'}
        </Text>
      </View>
      <Pressable onPress={onCancel} hitSlop={8} className="active:opacity-60">
        <Text variant="caption" tone="danger" className="font-semibold">
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}
