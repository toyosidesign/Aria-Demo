import { router, useLocalSearchParams } from 'expo-router';
import { Check, NotebookPen, Send, Share2, Sparkles, X } from 'lucide-react-native';
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
import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { requestDraft } from '@/lib/aria-actions';
import {
  ALL_SUGGESTIONS_USED,
  FOLLOW_UP_NO_CHANGE,
  OFF_SCRIPT_NOTICE,
  OUT_OF_SCOPE_NOTICE,
  detectSmallTalk,
} from '@/lib/assistant';
import { useColors } from '@/lib/colors';
import { exportWork } from '@/lib/export';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

type Msg = { id: string; from: 'aria' | 'maya'; kind: 'text' | 'notes'; text: string };

let msgId = 0;
const mk = (from: Msg['from'], kind: Msg['kind'], text: string): Msg => ({
  id: `r${msgId++}`,
  from,
  kind,
  text,
});

/**
 * Research questions Aria can actually answer.
 *
 * Each one maps to something the research prompt already covers: key facts and
 * dates, the people involved, the competing angles, and what to go and read.
 * Keeping them aligned with the prompt is the point, so a tap can't ask for
 * something Aria was never set up to produce.
 *
 * Phrased generally rather than stitched to the topic, because the whole chat
 * is already scoped to one checklist item.
 */
const SUGGESTIONS = [
  'What are the key facts and dates?',
  'Who are the main people involved?',
  'What are the main viewpoints?',
  'What should I read or look up?',
];

/** Loose match, so typing a suggested question by hand counts as asking it. */
const normalise = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/, '')
    .replace(/\s+/g, ' ');

/** The canonical suggestion a message asks for, so typed and tapped agree. */
const matchSuggestion = (s: string) => SUGGESTIONS.find((q) => normalise(q) === normalise(s));

/** A focused research chat for a single checklist item. */
export default function ResearchScreen() {
  const c = useColors();
  const { taskId, subId } = useLocalSearchParams<{ taskId: string; subId: string }>();
  const tasks = useAriaStore((s) => s.tasks);
  const task = tasks.find((t) => t.id === taskId);
  const sub = task?.subtasks.find((s) => s.id === subId);
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [notes, setNotes] = useState('');
  const [input, setInput] = useState('');
  /** Questions already put to Aria, so each is offered only once. */
  const [asked, setAsked] = useState<string[]>([]);
  const startedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);

  async function research(instruction?: string) {
    if (!task || !sub) return;
    setTyping(true);
    const res = await requestDraft({
      kind: 'assignment',
      title: task.title,
      description: task.description,
      subtaskTitle: sub.title,
      research: true,
      instruction,
      previousDraft: instruction ? notes : undefined,
    });
    setTyping(false);

    // Tapping the same question twice would otherwise append the same block
    // again, which is how this screen came to look like it was repeating.
    if (instruction && notes.includes(res.message.trim())) {
      push(mk('aria', 'text', FOLLOW_UP_NO_CHANGE));
      return;
    }

    // A follow-up answer adds to what's there; only the opening pass sets the
    // notes outright. Replacing would quietly drop the original research the
    // moment someone asked a question, and Save to draft would keep only the
    // answer.
    setNotes((prev) => (instruction && prev ? `${prev}\n\n${res.message}` : res.message));
    push(mk('aria', 'notes', res.message));

    // `asked` hasn't caught up with this turn yet, so the current question is
    // excluded by hand. Without it Aria points at suggestions that are gone.
    const left = SUGGESTIONS.filter(
      (q) => !asked.includes(q) && normalise(q) !== normalise(instruction ?? ''),
    ).length;
    push(
      mk(
        'aria',
        'text',
        !instruction
          ? 'Tap one of the suggested questions below, or mark this off when you’re happy with it.'
          : left > 0
            ? 'Added that. Try another suggested question, or mark this off when you’re happy.'
            : 'That’s everything I can cover on this one. Save it to your draft, or mark it off when you’re happy.',
      ),
    );
  }

  // Kick off the research on mount.
  useEffect(() => {
    if (startedRef.current || !task || !sub) return;
    startedRef.current = true;
    // Said before anything is produced, not after. A caveat that arrives under
    // finished-looking notes is one nobody reads.
    push(mk('aria', 'text', OUT_OF_SCOPE_NOTICE));
    push(mk('aria', 'text', `Let’s dig into “${sub.title}.” Give me a second.`));
    research();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, sub]);

  // Auto-scroll to newest.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, typing]);

  if (!task || !sub) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center gap-4">
          <Text tone="muted">This checklist item no longer exists.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const hasText = input.trim().length > 0;
  const remaining = SUGGESTIONS.filter((q) => !asked.includes(q));

  /** One path for both a typed question and a tapped suggestion. */
  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    hapticTap();
    push(mk('maya', 'text', trimmed));
    const talk = detectSmallTalk(trimmed);
    if (talk) {
      push(mk('aria', 'text', talk));
      return;
    }
    // While Aria is in testing it answers a known list and nothing else. Saying
    // so straight away beats sending an open question off to be half-answered,
    // and it costs nothing to refuse here rather than after a wait.
    const matched = matchSuggestion(trimmed);
    if (!matched) {
      push(mk('aria', 'text', remaining.length > 0 ? OFF_SCRIPT_NOTICE : ALL_SUGGESTIONS_USED));
      return;
    }
    // Retired from the row: an answered question offering itself again is just
    // clutter over the ones still worth asking.
    setAsked((prev) => (prev.includes(matched) ? prev : [...prev, matched]));
    research(matched);
  }

  function ask() {
    if (!input.trim() || typing) return;
    const text = input;
    setInput('');
    submit(text);
  }

  /**
   * Keep the research and step away.
   *
   * Nothing is ticked or completed: saving your working notes is not the same as
   * declaring the work finished, and this is the option for someone who intends
   * to come back to it. "Mark done" is what closes the item off.
   */
  function saveToDraft() {
    if (!notes) return;
    hapticTap();
    addDraftSection(task!.id, { title: sub!.title, content: notes });
    showToast('Saved to draft', 'check');
    router.replace('/(tabs)');
  }

  /** Satisfied: check the item off, keep the research, and return to the task. */
  function markDone() {
    hapticSuccess();
    if (notes) addDraftSection(task!.id, { title: sub!.title, content: notes });
    if (!sub!.done) toggleSubtask(task!.id, sub!.id);
    showToast(`Checked off “${sub!.title}”`, 'check');
    router.back();
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <AriaAvatar size={30} />
        <View className="flex-1">
          <Text variant="subtitle">Aria</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            Researching {sub.title}
          </Text>
        </View>
        {/* Straight out to Notes, Docs, Drive or Files, without first having to
            save into the task and find the draft there. */}
        {notes ? (
          <HeaderButton icon={Share2} onPress={() => void exportWork(sub.title, notes)} />
        ) : null}
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
            m.kind === 'notes' ? (
              <Animated.View
                key={m.id}
                entering={FadeIn.duration(300)}
                className="ml-10 rounded-2xl rounded-tl-md border border-accent/30 bg-surface p-4">
                <Text variant="label" tone="accent" className="mb-1.5">
                  Research notes
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
                Aria is researching…
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Controls */}
        <View className="gap-3 border-t border-border px-4 pb-6 pt-3">
          {/* Only once there are notes to act on, and never mid-answer: these
              reshape what's on screen, so before that they'd do nothing. They
              stay visible while Aria is on scripted text, because a tap then
              gets an honest "still in testing" answer, which is the point. */}
          {notes && !typing && remaining.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
              {remaining.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => submit(q)}
                  className="flex-row items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3.5 py-2 active:opacity-70">
                  <Sparkles size={13} color={c.accent} />
                  <Text variant="small" tone="accent" className="font-strong">
                    {q}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View className="flex-row items-end gap-2">
            <View className="flex-1 justify-center rounded-3xl border border-border bg-surface px-4">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Tap a suggested question above…"
                placeholderTextColor={c.faint}
                multiline
                className="max-h-24 py-2.5 text-base text-ink"
                onSubmitEditing={ask}
              />
            </View>
            <Pressable
              onPress={ask}
              disabled={!hasText}
              className={`h-11 w-11 items-center justify-center rounded-full ${hasText ? 'bg-accent active:opacity-80' : 'bg-border'}`}>
              <Send size={18} color={hasText ? c.accentInk : c.faint} />
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <Button
              title="Save to draft"
              variant="secondary"
              className="flex-1"
              leftIcon={<NotebookPen size={17} color={c.ink} />}
              disabled={!notes || typing}
              onPress={saveToDraft}
            />
            <Button
              title={sub.done ? 'Back to task' : 'Mark done'}
              className="flex-1"
              leftIcon={<Check size={18} color={c.accentInk} />}
              disabled={typing}
              onPress={markDone}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
