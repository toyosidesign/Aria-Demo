import { router } from 'expo-router';
import { ArrowLeft, Check, CircleAlert, Clock, Hand, Send } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { formatLong, formatTime } from '@/lib/dates';
import { buildReview, reviewSummary, type ReviewItem } from '@/lib/daily-review';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
import { useColors } from '@/lib/colors';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * The Pro day, in one screen: here is everything, approve it and I get on with it.
 *
 * This is the difference between the two tiers. Free is a planner that reminds
 * you and hands you buttons; Pro is an assistant that asks once, in the morning,
 * and then works while you are somewhere else.
 *
 * ── Three lists, and the wording between them is the product ────────────────
 *
 * "I'll send these" means Aria completes them with nobody watching, and only
 * email is ever in it, because that is the only channel a server can finish.
 * "Ready for your tap" is everything else Aria can prepare: written, addressed
 * and waiting, but still needing a human, since no phone lets an app send a
 * text or a WhatsApp as you. "Yours today" is the rest of the day, listed so it
 * is complete and never counted as handled.
 *
 * Getting that boundary wrong is the one failure this feature can have, and it
 * is the kind discovered by the person who never received the message. The
 * rules live in `lib/daily-review.ts` and `check:review` holds them.
 */
export default function DailyReviewScreen() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const pro = useAriaStore((s) => s.pro);
  const scheduleAutomation = useAriaStore((s) => s.scheduleAutomation);
  const markDayReviewed = useAriaStore((s) => s.markDayReviewed);

  /*
   * Built once, when the screen opens.
   *
   * Every item carries the moment it would run, counted from now, so rebuilding
   * on each render would quietly move the hold forward while somebody reads the
   * list, and the times on screen would not be the times approved.
   */
  const review = useMemo(() => buildReview(tasks, demoDate), [tasks, demoDate]);

  /** Unticked items are left alone. Everything actionable starts ticked. */
  const [excluded, setExcluded] = useState<string[]>([]);
  const included = review.actionable.filter((i) => !excluded.includes(i.taskId));

  function toggle(taskId: string) {
    hapticSelect();
    setExcluded((x) => (x.includes(taskId) ? x.filter((id) => id !== taskId) : [...x, taskId]));
  }

  function approve() {
    for (const item of included) {
      if (!item.channel || !item.runAt || !item.body) continue;
      scheduleAutomation({
        taskId: item.taskId,
        taskTitle: item.title,
        channel: item.channel,
        runAt: item.runAt,
        body: item.body,
        subject: item.subject,
        toName: item.to,
        toEmail: item.channel === 'email' ? item.to : undefined,
        toPhone: item.channel === 'email' ? undefined : item.to,
      });
    }
    markDayReviewed(review.date);
    hapticSuccess();
    /*
     * Says what will happen, including the part that is still theirs.
     *
     * "Approved" alone would leave somebody believing the texts went too, which
     * is the misunderstanding this whole screen is built to prevent.
     */
    const sending = included.filter((i) => i.outcome === 'send').length;
    const preparing = included.length - sending;
    showToast(
      sending && preparing
        ? `${sending} on their way, ${preparing} ready for your tap`
        : sending
          ? `${sending} on their way. Ten minutes to stop them.`
          : `${preparing} ready for your tap`,
      'check',
    );
    router.back();
  }

  function notToday() {
    markDayReviewed(review.date);
    showToast('Left as it is. Nothing will go out.', 'undo');
    router.back();
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton icon={ArrowLeft} onPress={() => router.back()} />
        <Text variant="label" tone="muted">
          {formatLong(review.date)}
        </Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 18 }}
        showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start gap-3">
          <AriaAvatar size={34} />
          <Text className="flex-1 leading-6">{reviewSummary(review)}</Text>
        </View>

        {!pro ? (
          /*
           * Reachable without Pro only by deep link, so it says what it is
           * rather than pretending to work. Nothing here can be approved.
           */
          <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
            <Text className="font-strong">This is the Pro day</Text>
            <Text variant="small" tone="muted">
              On Free, everything below stays yours: I keep it in front of you and hand you the
              buttons. Pro is where I do the sending.
            </Text>
          </View>
        ) : null}

        {review.sending.length ? (
          <Group
            icon={<Send size={15} color={c.accent} />}
            title="I'll send these"
            note="Sent for you, with nobody watching. Ten minutes to stop them after you approve."
            items={review.sending}
            excluded={excluded}
            onToggle={toggle}
          />
        ) : null}

        {review.preparing.length ? (
          <Group
            icon={<Hand size={15} color={c.accent} />}
            title="Ready for your tap"
            note="Written and addressed at the right moment. Phones don't let an app send a text or a WhatsApp for you, so the last tap stays yours."
            items={review.preparing}
            excluded={excluded}
            onToggle={toggle}
          />
        ) : null}

        {review.blocked.length ? (
          <Group
            icon={<CircleAlert size={15} color={c.danger} />}
            title="I need one thing first"
            note="Open the task and add it, and I'll take it tomorrow."
            items={review.blocked}
            excluded={excluded}
            onToggle={toggle}
            readOnly
          />
        ) : null}

        {review.yours.length ? (
          <Group
            icon={<Clock size={15} color={c.muted} />}
            title="Yours today"
            note="I can't do these for you. They're here so the day is the whole day."
            items={review.yours}
            excluded={excluded}
            onToggle={toggle}
            readOnly
          />
        ) : null}
      </ScrollView>

      <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
        <Button
          title={
            included.length
              ? `Approve ${included.length} ${included.length === 1 ? 'thing' : 'things'}`
              : 'Nothing to approve'
          }
          block
          size="lg"
          disabled={!included.length || !pro}
          leftIcon={<Check size={18} color={c.accentInk} />}
          onPress={approve}
        />
        <Button title="Not today" variant="ghost" size="sm" block onPress={notToday} />
      </View>
    </Screen>
  );
}

function Group({
  icon,
  title,
  note,
  items,
  excluded,
  onToggle,
  readOnly,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  items: ReviewItem[];
  excluded: string[];
  onToggle: (taskId: string) => void;
  /** Nothing here is approvable, so nothing here is tickable. */
  readOnly?: boolean;
}) {
  const c = useColors();
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text variant="label" tone="muted">
          {title}
        </Text>
      </View>

      {items.map((item) => {
        const off = excluded.includes(item.taskId);
        return (
          <Pressable
            key={item.taskId}
            disabled={readOnly}
            onPress={() => onToggle(item.taskId)}
            className={`flex-row items-start gap-3 rounded-2xl border p-4 ${
              readOnly
                ? 'border-border bg-bg'
                : off
                  ? 'border-border bg-bg opacity-60'
                  : 'border-accent/40 bg-surface active:opacity-70'
            }`}>
            <View className="flex-1 gap-1">
              <Text className="font-strong" numberOfLines={2}>
                {item.title}
              </Text>
              <Text variant="small" tone={item.blocked ? 'danger' : 'muted'}>
                {item.blocked ?? item.line}
              </Text>
              {item.runAt && !item.blocked ? (
                <Text variant="caption" tone="faint">
                  {formatTime(new Date(item.runAt).toTimeString().slice(0, 5))}
                  {item.to ? ` · ${item.to}` : ''}
                </Text>
              ) : null}
            </View>

            {/* Ticked means "yes, do this". Read-only rows have no control at
                all rather than a disabled one: there is nothing to decide. */}
            {readOnly ? null : (
              <View
                className={`h-6 w-6 items-center justify-center rounded-full border ${
                  off ? 'border-border' : 'border-accent bg-accent'
                }`}>
                {off ? null : <Check size={14} color={c.accentInk} />}
              </View>
            )}
          </Pressable>
        );
      })}

      <Text variant="caption" tone="faint" className="leading-5">
        {note}
      </Text>
    </View>
  );
}
