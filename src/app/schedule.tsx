import { router, useLocalSearchParams } from 'expo-router';
import { CalendarClock, Check, Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { ContactField } from '@/components/contact-field';
import { HeaderButton } from '@/components/header-button';
import { InlineError } from '@/components/inline-error';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { AUTO_CHANNELS, CHANNEL_META, formatRunAt, toRunAt, type AutoChannel } from '@/lib/automations';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { isValidEmails } from '@/lib/contacts';
import { hapticSuccess } from '@/lib/haptics';
import { PRO_FEATURES, PRO_PITCH, promptProUpgrade } from '@/lib/pro';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Hand a drafted message to Aria to send later. Reached from the draft screen
 * ("Schedule it instead") or from a task that already has a draft.
 */
export default function ScheduleScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ taskId?: string; body?: string; channel?: string }>();

  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const scheduleAutomation = useAriaStore((s) => s.scheduleAutomation);
  const pro = useAriaStore((s) => s.pro);
  const proWaitlisted = useAriaStore((s) => s.proWaitlisted);

  const task = tasks.find((t) => t.id === params.taskId);

  const [channel, setChannel] = useState<AutoChannel>(
    AUTO_CHANNELS.includes(params.channel as AutoChannel)
      ? (params.channel as AutoChannel)
      : task?.method === 'email'
        ? 'email'
        : 'sms',
  );
  const [name, setName] = useState(task?.contactName ?? '');
  const [email, setEmail] = useState(task?.contactEmail ?? '');
  const [phone, setPhone] = useState(task?.contactPhone ?? '');
  const [subject, setSubject] = useState(task?.title ?? '');
  const [body, setBody] = useState(params.body ?? task?.draftSections?.[0]?.content ?? '');
  const [date, setDate] = useState(task?.date ?? demoDate);
  const [time, setTime] = useState<string | null>(task?.time ?? '09:00');

  const meta = CHANNEL_META[channel];
  const runAt = time ? toRunAt(date, time) : null;
  const inFuture = !!runAt && new Date(runAt).getTime() > Date.now();
  const recipientOk =
    channel === 'email' ? isValidEmails(email) : phone.trim().length > 0;
  const canSchedule = !!task && body.trim().length > 0 && recipientOk && inFuture;

  function confirm() {
    if (!canSchedule || !runAt || !task) return;
    scheduleAutomation({
      taskId: task.id,
      taskTitle: task.title,
      channel,
      runAt,
      body: body.trim(),
      subject: channel === 'email' ? subject.trim() || task.title : undefined,
      toName: name.trim() || undefined,
      toEmail: email.trim() || undefined,
      toPhone: phone.trim() || undefined,
    });
    hapticSuccess();
    showToast('Aria will handle it', 'clock');
    router.back();
  }

  if (!task) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center gap-4">
          <Text tone="muted">There’s no task to schedule.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  // Handing work over to Aria is the paid tier.
  if (!pro) {
    return (
      <Screen edges={['top']}>
        <View className="flex-row items-center justify-between px-5 py-2">
          <HeaderButton icon={X} onPress={() => router.back()} />
          <Text variant="subtitle">Aria Pro</Text>
          <View className="w-10" />
        </View>

      <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}>
          <View className="gap-3 rounded-3xl border border-accent/30 bg-accent-soft p-5">
            <View className="flex-row items-center gap-2.5">
              <AriaAvatar size={30} />
              <View className="flex-row items-center gap-2">
                <Text variant="subtitle">Aria Pro</Text>
                <View className="rounded-full bg-accent px-2 py-0.5">
                  <Text variant="caption" className="font-bold" style={{ color: c.accentInk }}>
                    PRO
                  </Text>
                </View>
              </View>
            </View>
            <Text className="leading-6">
              Right now you tell me what to write and you send it. With Pro I take it from there,
              at a time you pick.
            </Text>
          </View>

          <View className="gap-3">
            {PRO_FEATURES.map((f) => (
              <View key={f} className="flex-row items-start gap-2.5">
                <Check size={17} color={c.success} style={{ marginTop: 2 }} />
                <Text className="flex-1 leading-6">{f}</Text>
              </View>
            ))}
          </View>

          <Text variant="caption" tone="faint" className="leading-5">
            Texts and WhatsApp messages still need your tap to send. No app is allowed to send
            those for you. Pro has them written and addressed the moment they’re due.
          </Text>

          {proWaitlisted ? (
            <View className="flex-row items-start gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5">
              <Check size={16} color={c.success} style={{ marginTop: 1 }} />
              <Text variant="small" tone="muted" className="flex-1 leading-5">
                You’re on the waiting list. I’ll tell you the moment Pro opens up.
              </Text>
            </View>
          ) : null}
      </ScrollView>

        <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
          <Button
            title={proWaitlisted ? 'You’re on the waiting list' : 'Join the Pro waiting list'}
            leftIcon={<Sparkles size={18} color={c.accentInk} />}
            block
            size="lg"
            disabled={proWaitlisted}
            onPress={() => promptProUpgrade(PRO_PITCH)}
          />
          <Button title="Go back" variant="ghost" size="sm" block onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle">Let Aria handle it</Text>
        <View className="w-10" />
      </View>

      <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20, paddingTop: 4 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          <Text tone="muted">
            For “{task.title}”. I’ll take this on at the time you pick.
          </Text>

          {/* Channel */}
          <View className="gap-2">
            <Text variant="label" tone="muted">
              How should it go out?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {AUTO_CHANNELS.map((ch) => {
                const m = CHANNEL_META[ch];
                const active = channel === ch;
                const Icon = m.icon;
                return (
                  <Pressable
                    key={ch}
                    onPress={() => setChannel(ch)}
                    className={cn(
                      'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <Icon size={16} color={active ? c.accent : c.muted} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Exactly what will happen — never imply more than the OS allows. */}
            <View
              className={cn(
                'flex-row items-start gap-2 rounded-2xl px-3.5 py-3',
                meta.autonomous ? 'bg-accent-soft' : 'border border-border bg-surface',
              )}>
              <CalendarClock size={15} color={meta.autonomous ? c.accent : c.muted} style={{ marginTop: 1 }} />
              <Text
                variant="caption"
                tone={meta.autonomous ? 'accent' : 'muted'}
                className="flex-1 leading-5">
                {meta.promise}
              </Text>
            </View>
          </View>

          <ContactField
            label="Who's it going to?"
            name={name}
            onName={setName}
            email={email}
            onEmail={setEmail}
            phone={phone}
            onPhone={setPhone}
            requireEmail={channel === 'email'}
            needsPhone={channel !== 'email'}
          />

          {channel === 'email' ? (
            <Input label="Subject" placeholder="Subject line" value={subject} onChangeText={setSubject} />
          ) : null}

          <Input
            label="Message Aria will send"
            placeholder="What should it say?"
            value={body}
            onChangeText={setBody}
            multiline
          />

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Date
            </Text>
            <MonthCalendar value={date} onSelect={setDate} />
          </View>

          <TimeField value={time} onChange={setTime} />

          {runAt && !inFuture ? (
            <InlineError>That moment has already passed. Pick a later date or time.</InlineError>
          ) : null}
      </ScrollView>

        <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
          {canSchedule && runAt ? (
            <Text variant="caption" tone="muted" className="text-center">
              {meta.autonomous ? 'Sending' : 'Ready'} {formatRunAt(runAt)}
            </Text>
          ) : null}
          <Button
            title="Schedule it"
            leftIcon={<Check size={18} color={c.accentInk} />}
            block
            size="lg"
            disabled={!canSchedule}
            onPress={confirm}
          />
        </View>
    </Screen>
  );
}
