import { router } from 'expo-router';
import { AlertTriangle, Check, Send, Sparkles, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaBubble } from '@/components/aria-bubble';
import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { runAutomation } from '@/lib/automation-runner';
import { CHANNEL_META, type Automation } from '@/lib/automations';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { claimAutomation } from '@/lib/sync';
import { selectDueAutomations, useAriaStore } from '@/store/aria-store';

type Line = { id: string; from: 'aria' | 'maya'; text: string };

let lid = 0;
const mk = (from: Line['from'], text: string): Line => ({ id: `r${lid++}`, from, text });

/**
 * Aria working through everything that has come due, one at a time, then
 * reporting what it managed. Anything it handed off is confirmed with Maya
 * rather than assumed sent.
 */
export default function AriaRunScreen() {
  const c = useColors();
  const automations = useAriaStore((s) => s.automations);
  const settleAutomation = useAriaStore((s) => s.settleAutomation);

  // Snapshot the queue on mount so settling items doesn't reshuffle it mid-run.
  const [queue] = useState<Automation[]>(() => selectDueAutomations(automations));
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [finished, setFinished] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const current = queue[index];
  const push = (l: Line) => setLines((prev) => [...prev, l]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!queue.length) {
      push(mk('aria', 'Nothing is due right now. I’ll come find you when something is.'));
      setFinished(true);
      return;
    }
    push(
      mk(
        'aria',
        queue.length === 1
          ? 'One thing is due now. Here it is.'
          : `${queue.length} things are due now. I’ll go through them one at a time.`,
      ),
    );
    void perform(queue[0], 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [lines, busy]);

  /**
   * The position is passed in, not read from `index`.
   *
   * `advance` closes over the `index` of the render that made it, and `perform`
   * calls it directly rather than through one — so perform → advance → perform
   * re-enters the same closure with `index` frozen, and a queue of three looped
   * on the second item forever.
   *
   * Only the autonomous chain hit it: a handed-off item resumes from a button
   * press, which is a fresh render with a fresh closure.
   */
  async function perform(a: Automation, at: number) {
    const meta = CHANNEL_META[a.channel];
    setBusy(true);

    /*
     * Ask the server first, for anything Aria sends on its own.
     *
     * The cron works the same queue this screen does, so without a claim an
     * email that went out at 09:00 gets sent again the moment the student opens
     * the app. Whoever moves the row out of 'scheduled' owns it; the loser is
     * told what became of it rather than quietly repeating the work.
     *
     * Only autonomous channels. A text or a WhatsApp message sits waiting for
     * the student to tap send, which can take minutes, and claiming one would
     * hand it to the server's stuck-claim sweep as an abandoned send. The cron
     * never touches those channels, so there is nothing to arbitrate.
     */
    if (meta.autonomous) {
      const claim = await claimAutomation(a.id);
      if (claim.outcome === 'taken') {
        setBusy(false);
        const who = a.toName ?? 'them';
        if (claim.status === 'sent' || claim.status === 'done') {
          push(mk('aria', `I already emailed ${who} for “${a.taskTitle}”. That one’s done.`));
          settleAutomation(a.id, { status: 'sent' });
        } else if (claim.status === 'cancelled') {
          push(mk('aria', `“${a.taskTitle}” was cancelled, so I’ve left it.`));
          settleAutomation(a.id, { status: 'cancelled' });
        } else if (claim.status === 'failed') {
          push(mk('aria', `I tried “${a.taskTitle}” already and it didn’t go through.`));
          settleAutomation(a.id, { status: 'failed', error: a.error });
        } else {
          /*
           * 'sending' — in flight elsewhere this second — or anything this
           * build doesn't recognise. Say so and settle nothing.
           *
           * The tempting `else` here writes 'failed', and that would be a lie
           * in both cases: an in-flight send has not failed, and a status a
           * newer build introduced is not evidence of anything. Leaving it
           * alone costs one repeated line on the next run and keeps the result
           * coming from whoever actually owns the send.
           */
          push(mk('aria', `I’m sending the email to ${who} for “${a.taskTitle}” right now.`));
        }
        advance(at);
        return;
      }

      if (claim.outcome === 'unreachable') {
        // Can't establish who owns this, and the mail route is a different host
        // from Supabase — so "couldn't reach the database" does not mean the
        // send would fail. Leave it scheduled and let it come round again.
        setBusy(false);
        push(
          mk(
            'aria',
            `I couldn’t check whether “${a.taskTitle}” had already gone, so I’ve left it for now rather than risk sending it twice.`,
          ),
        );
        advance(at);
        return;
      }
      // 'claimed' and 'unavailable' both mean carry on — see claimAutomation
      // for why those two are the safe ones.
    }

    push(
      mk(
        'aria',
        meta.autonomous
          ? `Sending the email to ${a.toName ?? 'them'} for “${a.taskTitle}”…`
          : `Opening ${meta.app} for “${a.taskTitle}”…`,
      ),
    );

    const outcome = await runAutomation(a);
    setBusy(false);
    push(mk('aria', outcome.note));

    if (outcome.handedOff) {
      // Aria can't see whether the user tapped send, so it has to ask.
      setAwaitingConfirm(true);
      return;
    }

    settleAutomation(a.id, { status: outcome.status, error: outcome.error });
    if (outcome.status === 'sent') hapticSuccess();
    advance(at);
  }

  function advance(at: number) {
    const next = at + 1;
    if (next >= queue.length) {
      push(mk('aria', reportSummary()));
      setFinished(true);
      return;
    }
    setIndex(next);
    void perform(queue[next], next);
  }

  function reportSummary() {
    const done = queue.length;
    return done === 1
      ? 'That’s it handled. It’s checked off your list.'
      : `That’s all ${done} handled and checked off your list.`;
  }

  function confirmSent() {
    hapticTap();
    push(mk('maya', 'Sent.'));
    settleAutomation(current.id, { status: 'done' });
    hapticSuccess();
    push(mk('aria', `✓ ${CHANNEL_META[current.channel].label} to ${current.toName ?? 'them'} done.`));
    setAwaitingConfirm(false);
    // Safe to read `index` here: a button press is a fresh render's closure.
    advance(index);
  }

  function markNotSent() {
    hapticTap();
    push(mk('maya', 'It didn’t go.'));
    settleAutomation(current.id, {
      status: 'failed',
      error: 'Not sent: the message was left unsent in the app',
    });
    push(mk('aria', 'Noted, I’ve left that one on your list so it isn’t lost.'));
    setAwaitingConfirm(false);
    // Safe to read `index` here: a button press is a fresh render's closure.
    advance(index);
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <AriaAvatar size={30} />
        <View className="flex-1">
          <Text variant="subtitle">Aria</Text>
          <Text variant="caption" tone="muted">
            {queue.length ? `Scheduled work · ${Math.min(index + 1, queue.length)} of ${queue.length}` : 'Scheduled work'}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}>
        {lines.map((l) => (
          <AriaBubble key={l.id} from={l.from}>
            {l.text}
          </AriaBubble>
        ))}

        {busy ? (
          <View className="ml-10 flex-row items-center gap-2 self-start rounded-2xl rounded-tl-md bg-accent-soft px-4 py-3">
            <Sparkles size={15} color={c.accent} />
            <Text tone="accent" variant="small">
              Working…
            </Text>
          </View>
        ) : null}

        {/* What Aria got through, once it's done */}
        {finished && queue.length ? (
          <Animated.View
            entering={FadeIn.duration(300)}
            className="ml-10 gap-2 rounded-2xl rounded-tl-md border border-border bg-surface p-4">
            <Text variant="label" tone="muted">
              Report
            </Text>
            {queue.map((a) => {
              const settled = automations.find((x) => x.id === a.id);
              const failed = settled?.status === 'failed';
              return (
                <View key={a.id} className="flex-row items-start gap-2">
                  {failed ? (
                    <AlertTriangle size={15} color={c.danger} style={{ marginTop: 2 }} />
                  ) : (
                    <Check size={15} color={c.success} style={{ marginTop: 2 }} />
                  )}
                  <View className="flex-1">
                    <Text variant="small" className="font-strong">
                      {a.taskTitle}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {CHANNEL_META[a.channel].label} to {a.toName ?? 'them'}
                      {failed ? ' · not sent' : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Animated.View>
        ) : null}
      </ScrollView>

      <View className="gap-2 border-t border-border px-4 pb-6 pt-3">
        {awaitingConfirm ? (
          <View className="flex-row gap-2">
            <Button
              title="Sent it"
              leftIcon={<Send size={18} color={c.accentInk} />}
              onPress={confirmSent}
              className="flex-1"
            />
            <Button title="Didn’t send" variant="secondary" onPress={markNotSent} />
          </View>
        ) : finished ? (
          <Button title="Done" block size="lg" onPress={() => router.back()} />
        ) : (
          <Button title="Please wait…" block size="lg" disabled loading />
        )}
      </View>
    </Screen>
  );
}
