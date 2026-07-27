import { router, useLocalSearchParams } from 'expo-router';
import { Check, NotebookPen, Send, Sparkles, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaBubble } from '@/components/aria-bubble';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { HeaderButton } from '@/components/header-button';
import {
  ariaActionFor,
  ARIA_SENDER,
  draftSectionTitle,
  isMessageMethod,
  METHOD_META,
  requestDraft,
} from '@/lib/aria-actions';
import { detectSmallTalk } from '@/lib/assistant';
import { saveDraftToNotes } from '@/lib/draft';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

type Phase = 'drafting' | 'review' | 'approve' | 'sending' | 'done' | 'declined';
type Msg = { id: string; from: 'aria' | 'maya'; kind: 'text' | 'draft'; text: string };

const REWRITES = [
  { label: 'Warmer', instruction: 'make it warmer and more heartfelt' },
  { label: 'Shorter', instruction: 'make it shorter and punchier' },
  { label: 'More casual', instruction: 'make it more casual and playful' },
  { label: 'More formal', instruction: 'make it a little more polished and formal' },
];

const ASSIGNMENT_REWRITES = [
  { label: 'More detail', instruction: 'add more depth and detail' },
  { label: 'Simpler', instruction: 'make it simpler and clearer' },
  { label: 'More formal', instruction: 'make it more academic and formal' },
  { label: 'Add an example', instruction: 'add a concrete example' },
];

let msgId = 0;
const mk = (from: Msg['from'], kind: Msg['kind'], text: string): Msg => ({
  id: `m${msgId++}`,
  from,
  kind,
  text,
});

const tap = hapticTap;

export default function AriaFlowScreen() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const allTasks = useAriaStore((s) => s.tasks);
  const task = allTasks.find((t) => t.id === taskId);
  const completeTask = useAriaStore((s) => s.completeTask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);

  const action = task ? ariaActionFor(task) : null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>('drafting');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [input, setInput] = useState('');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);
  const nextIncompleteSub = (excludeId?: string) =>
    task?.subtasks.find((s) => !s.done && s.id !== excludeId) ?? null;

  async function generateSub(sub: { id: string; title: string }, instruction?: string) {
    if (!task) return;
    setActiveSubId(sub.id);
    setTyping(true);
    const res = await requestDraft({
      kind: 'assignment',
      title: task.title,
      description: task.description,
      subtaskTitle: sub.title,
      senderName: ARIA_SENDER,
      instruction,
      previousDraft: instruction ? draft : undefined,
    });
    setTyping(false);
    setDraft(res.message);
    push(mk('aria', 'draft', res.message));
    push(
      mk(
        'aria',
        'text',
        `Here’s a start for “${sub.title}.” Keep it, tweak it with the chips, or tell me what to change.`,
      ),
    );
    setPhase('review');
  }

  async function generate(instruction?: string) {
    if (!task) return;
    setTyping(true);
    const res = await requestDraft({
      kind: task.kind,
      title: task.title,
      description: task.description,
      contactName: task.contactName,
      method: task.method,
      senderName: ARIA_SENDER,
      instruction,
      previousDraft: instruction ? draft : undefined,
    });
    setTyping(false);
    setDraft(res.message);
    push(mk('aria', 'draft', res.message));
    push(
      mk(
        'aria',
        'text',
        action?.type === 'assignment'
          ? 'Here’s a start. Keep it, tweak it with the chips, or tell me what to change.'
          : 'Here’s a draft. Send it as-is, or tell me how you’d like it changed.',
      ),
    );
    setPhase('review');
  }

  // Kick off drafting on mount.
  useEffect(() => {
    if (startedRef.current || !task || !action) return;
    startedRef.current = true;
    const walkthrough = action.walkthrough;
    if (walkthrough) {
      const first = task.subtasks.find((s) => !s.done);
      if (!first) {
        push(mk('aria', 'text', 'Every part of this is already done — nice work.'));
        setPhase('done');
        return;
      }
      push(
        mk(
          'aria',
          'text',
          `Let’s work through this together — ${task.subtasks.length} parts. First up: “${first.title}.”`,
        ),
      );
      generateSub(first);
    } else {
      push(mk('aria', 'text', `On it — give me a second to write ${action.drafting}.`));
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, action]);

  // Auto-scroll to newest.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, typing]);

  if (!task || !action) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center gap-4">
          <Text tone="muted">There’s nothing for Aria to do here.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const contact = task.contactName ?? 'them';
  const meta = isMessageMethod(action.method) ? METHOD_META[action.method] : null;
  const app = meta?.app ?? 'Messages';
  const isCall = action.method === 'call';
  const hasText = input.trim().length > 0;
  const canCompose = (phase === 'review' || phase === 'approve') && !typing;
  const isWalkthrough = !!action.walkthrough;
  const rewrites = action.type === 'assignment' ? ASSIGNMENT_REWRITES : REWRITES;
  const acceptLabel = isWalkthrough
    ? nextIncompleteSub(activeSubId ?? undefined)
      ? 'Check off & continue'
      : 'Check off & finish'
    : action.needsSend
      ? 'Send it'
      : 'Keep it';

  function redraft(instruction: string) {
    if (isWalkthrough) {
      const sub = task!.subtasks.find((s) => s.id === activeSubId);
      if (sub) generateSub(sub, instruction);
    } else {
      generate(instruction);
    }
  }

  function acceptSubtask() {
    const sub = task!.subtasks.find((s) => s.id === activeSubId);
    push(mk('maya', 'text', 'Looks good.'));
    if (sub && !sub.done) toggleSubtask(task!.id, sub.id);
    addDraftSection(task!.id, { title: sub?.title ?? 'Section', content: draft });
    hapticSuccess();
    push(mk('aria', 'text', `✓ Checked off “${sub?.title ?? 'that part'}.”`));
    const next = nextIncompleteSub(sub?.id);
    if (next) {
      push(mk('aria', 'text', `Next up: “${next.title}.”`));
      generateSub(next);
    } else {
      completeTask(task!.id, { byAria: true });
      push(
        mk(
          'aria',
          'text',
          'That’s every part done — I’ve compiled it all into one draft and checked the assignment off. Want me to save it to your Notes app?',
        ),
      );
      setPhase('done');
    }
  }

  function accept() {
    tap();
    if (isWalkthrough) {
      acceptSubtask();
      return;
    }
    if (action!.needsSend) {
      push(mk('maya', 'text', 'This looks great.'));
      push(
        mk(
          'aria',
          'text',
          isCall
            ? `Ready when you are — may I open ${app} to call ${contact}?`
            : `Ready when you are — may I open ${app} to send this to ${contact}${
                action!.method === 'email' && task!.contactEmail ? ` (${task!.contactEmail})` : ''
              }?`,
        ),
      );
      setPhase('approve');
    } else {
      // Assignment/task (no walkthrough): save the draft as a section.
      push(mk('maya', 'text', 'Looks good — keep it.'));
      addDraftSection(task!.id, { title: draftSectionTitle(action!.method), content: draft });
      push(
        mk('aria', 'text', 'Saved it to this task — it’s in the “Aria’s draft” card whenever you need it.'),
      );
      setPhase('done');
    }
  }

  function approveAndSend() {
    tap();
    push(mk('maya', 'text', 'Approved — go ahead.'));
    setPhase('sending');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      push(mk('aria', 'text', `✓ ${meta ? `${meta.sentPast} ${contact}` : `Sent to ${contact}`}.`));
      completeTask(task!.id, { byAria: true });
      hapticSuccess();
      push(mk('aria', 'text', 'All done — I’ve checked this off and moved it to your Done list.'));
      setPhase('done');
    }, 1600);
  }

  function chooseRewrite(instruction: string, label: string) {
    if (typing) return;
    tap();
    push(mk('maya', 'text', `Rewrite: ${label.toLowerCase()}.`));
    redraft(instruction);
  }

  /** Maya's free-form instruction → re-draft with it (or reply to small talk). */
  function sendInstruction() {
    const trimmed = input.trim();
    if (!trimmed || typing) return;
    tap();
    push(mk('maya', 'text', trimmed));
    setInput('');
    const talk = detectSmallTalk(trimmed);
    if (talk) {
      push(mk('aria', 'text', talk));
      return;
    }
    redraft(trimmed);
  }

  /** After a completed task, jump to the next due task; else return. */
  function finish() {
    const next = allTasks
      .filter((t) => t.status === 'todo' && t.id !== task!.id)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (task!.status === 'done' && next)
      router.replace({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
    else router.back();
  }

  function decline() {
    tap();
    push(mk('maya', 'text', 'Not now, thanks.'));
    push(
      mk(
        'aria',
        'text',
        'No problem at all — I’ll leave this with you. Just tap me whenever you’re ready.',
      ),
    );
    setPhase('declined');
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <AriaAvatar size={30} />
        <View className="flex-1">
          <Text variant="subtitle">Aria</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {task.title}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {messages.map((m) =>
            m.kind === 'draft' ? (
              <Animated.View
                key={m.id}
                entering={FadeIn.duration(300)}
                className="ml-10 rounded-2xl rounded-tl-md border border-accent/30 bg-surface p-4">
                <Text variant="label" tone="accent" className="mb-1.5">
                  Draft
                </Text>
                <Text className="leading-6">{m.text}</Text>
              </Animated.View>
            ) : (
              <AriaBubble key={m.id} from={m.from}>
                {m.text}
              </AriaBubble>
            ),
          )}
          {typing ? (
            <View className="ml-10 flex-row items-center gap-2 self-start rounded-2xl rounded-tl-md bg-accent-soft px-4 py-3">
              <Sparkles size={15} color={c.accent} />
              <Text tone="accent" variant="small">
                {phase === 'sending' ? `Opening ${app}…` : 'Aria is writing…'}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Controls */}
        <View className="gap-3 border-t border-border px-4 pb-6 pt-3">
          {/* Quick rewrite chips (review only) */}
          {phase === 'review' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {rewrites.map((r) => (
                <Pressable
                  key={r.label}
                  onPress={() => chooseRewrite(r.instruction, r.label)}
                  className="rounded-full border border-accent bg-accent-soft px-3.5 py-2 active:opacity-70">
                  <Text variant="small" tone="accent" className="font-semibold">
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* Free-form instruction composer (review & approve) */}
          {canCompose ? (
            <View className="flex-row items-end gap-2">
              <View className="flex-1 justify-center rounded-3xl border border-border bg-surface px-4">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder={
                    phase === 'approve'
                      ? 'Want a change before sending?'
                      : 'Tell Aria what to change…'
                  }
                  placeholderTextColor={c.faint}
                  multiline
                  className="max-h-24 py-2.5 text-base text-ink"
                  onSubmitEditing={sendInstruction}
                />
              </View>
              <Pressable
                onPress={sendInstruction}
                disabled={!hasText}
                className={`h-11 w-11 items-center justify-center rounded-full ${hasText ? 'bg-accent active:opacity-80' : 'bg-border'}`}>
                <Send size={18} color={hasText ? c.accentInk : c.faint} />
              </Pressable>
            </View>
          ) : null}

          {/* Primary actions */}
          {phase === 'review' ? (
            <View className="gap-2">
              <View className="flex-row gap-2">
                <Button
                  title={acceptLabel}
                  leftIcon={<Check size={18} color={c.accentInk} />}
                  onPress={accept}
                  className="flex-1"
                />
                <Button title="Not now" variant="secondary" onPress={decline} />
              </View>
            </View>
          ) : null}

          {phase === 'approve' ? (
            <View className="gap-2">
              <Button
                title={isCall ? `Approve & call ${contact}` : `Approve & open ${app}`}
                leftIcon={<Send size={18} color={c.accentInk} />}
                block
                onPress={approveAndSend}
              />
              <Button title="Not now" variant="ghost" size="sm" block onPress={decline} />
            </View>
          ) : null}

          {phase === 'done' || phase === 'declined' ? (
            <View className="gap-2">
              {phase === 'done' && (task.draftSections?.length ?? 0) > 0 ? (
                <Button
                  title="Save to Notes"
                  leftIcon={<NotebookPen size={18} color={c.accentInk} />}
                  block
                  onPress={() => saveDraftToNotes(task)}
                />
              ) : null}
              <Button
                title="Done"
                variant={
                  phase === 'done' && (task.draftSections?.length ?? 0) > 0 ? 'secondary' : 'primary'
                }
                block
                size="lg"
                onPress={finish}
              />
            </View>
          ) : null}

          {phase === 'drafting' || phase === 'sending' ? (
            <Button title="Please wait…" block size="lg" disabled loading />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
