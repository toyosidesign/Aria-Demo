import { router, type Href } from 'expo-router';
import { CalendarDays, ChevronRight, Eraser, Mic, Send, Sparkles, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaBubble } from '@/components/aria-bubble';
import { HeaderButton } from '@/components/header-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TASK_KINDS } from '@/lib/aria-actions';
import {
  TESTING_NOTICE,
  requestAssistant,
  wantsRealWorldAction,
  type AssistantTurn,
  type ParsedTask,
} from '@/lib/assistant';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { uuidv4 } from '@/lib/id';
import { formatFull, formatTime } from '@/lib/dates';
import { hapticSelect, hapticTap } from '@/lib/haptics';
import { KIND_ICON } from '@/lib/kind-icons';
import { useAriaStore, type TaskKind } from '@/store/aria-store';

type Msg = {
  id: string;
  from: 'aria' | 'maya';
  text: string;
  pending?: ParsedTask[];
  /** Scripted parser rather than the model. Shown in development only. */
  fallback?: boolean;
};

/** Build a pre-filled Create-task route from a parsed task. */
function createHref(t: ParsedTask): string {
  const q = [
    `title=${encodeURIComponent(t.title)}`,
    `date=${t.date}`,
    `kind=${t.kind}`,
    `priority=${t.priority}`,
    t.contactName ? `contactName=${encodeURIComponent(t.contactName)}` : '',
    t.contactEmail ? `contactEmail=${encodeURIComponent(t.contactEmail)}` : '',
    t.method ? `method=${t.method}` : '',
    t.time ? `time=${t.time}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return `/task/new?${q}`;
}

const VOICE_SCRIPTS = [
  'Remind me to submit my chemistry lab report on Friday',
  "It's Sam's birthday next Tuesday, remind me to message him",
  'Add gym on Saturday morning',
  'I have a history essay due in 3 days',
];

/**
 * A message id that survives a reload.
 *
 * This was a module-scoped counter — `c0`, `c1`, … — which was fine while the
 * thread lived in component state and died with it. Now that the conversation
 * persists, the counter still restarts at zero on every reload while the stored
 * messages keep their old ids, so the next message collided with `c0` and React
 * refused to render the list.
 */
const mk = (
  from: Msg['from'],
  text: string,
  pending?: ParsedTask[],
  fallback?: boolean,
): Msg => ({
  id: uuidv4(),
  from,
  text,
  pending,
  fallback,
});

export default function ChatScreen() {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const profileName = useAriaStore((s) => s.profile.name);
  const profileContext = useAriaStore((s) => s.profile.context);
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);

  // The thread lives in the store now, so closing the sheet keeps it.
  const messages = useAriaStore((s) => s.chat);
  const addChatMessage = useAriaStore((s) => s.addChatMessage);
  const clearChat = useAriaStore((s) => s.clearChat);

  /*
   * Greet once, into an empty thread — not on every mount.
   *
   * Seeding this as initial state meant a fresh "Hi, I'm Aria" every time the
   * sheet opened. It belongs in the history like any other turn, so it is
   * written once and then scrolls away like the rest.
   */
  useEffect(() => {
    if (messages.length > 0) return;
    addChatMessage(
      mk(
        'aria',
        `Hi ${firstName}, I'm Aria. Pick a category below so I know what to focus on, or just tell me what you need, like “remind me to submit my lab report on Friday at 5pm.” You can type, or tap the mic to speak.`,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [focus, setFocus] = useState<TaskKind | null>(null);
  const focusLabel = focus ? TASK_KINDS.find((k) => k.value === focus)?.label : null;
  const voiceIdx = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const pulse = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.4 }],
    opacity: 0.6 - pulse.value * 0.6,
  }));

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, sending, listening]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    hapticTap();
    const history: AssistantTurn[] = messages.map((m) => ({
      role: m.from === 'aria' ? 'assistant' : 'user',
      text: m.text,
    }));
    addChatMessage(mk('maya', trimmed));
    setInput('');
    setSending(true);

    const res = await requestAssistant(trimmed, demoDate, history, focus ?? undefined, profileName, profileContext);

    setSending(false);
    // Only for things Aria genuinely can't do — booking, ordering, paying.
    // Questions are answered by the model; intercepting those was the bug this
    // replaced. And only when nothing was captured: if a task came back, Aria
    // understood the message fine and the notice would just be in the way.
    const reply =
      res.tasks.length === 0 && wantsRealWorldAction(trimmed) ? TESTING_NOTICE : res.reply;
    addChatMessage(mk('aria', reply, res.tasks.length ? res.tasks : undefined, res.fallback));
  }

  function startVoice() {
    if (listening || sending) return;
    hapticSelect();
    setListening(true);
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.out(Easing.ease) }), -1, false);
    setTimeout(() => {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
      setListening(false);
      const script = VOICE_SCRIPTS[voiceIdx.current % VOICE_SCRIPTS.length];
      voiceIdx.current += 1;
      setInput(script); // dictation fills the box; Maya reviews, then sends
    }, 1600);
  }

  const hasText = input.trim().length > 0;

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-2.5 border-b border-border px-4 py-2.5">
        <AriaAvatar size={32} />
        <View className="flex-1">
          <Text variant="subtitle">Aria</Text>
          <Text variant="caption" tone="muted">
            Ask me to add anything
          </Text>
        </View>
        {/* History persists now, so there has to be a way to end a thread. */}
        {messages.length > 1 ? (
          <HeaderButton
            icon={Eraser}
            accessibilityLabel="Clear this conversation"
            onPress={() => {
              hapticSelect();
              clearChat();
            }}
          />
        ) : null}
        <HeaderButton icon={X} onPress={() => router.back()} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {messages.map((m) => (
            <View key={m.id} className="gap-2">
              <AriaBubble from={m.from}>{m.text}</AriaBubble>
              {/* Which one answered — development only.
                  The scripted fallback is written to read like a real reply, so
                  there is otherwise nothing to tell them apart. That is what let
                  a dead API key survive weeks of testing: every response looked
                  right. Stripped from release builds. */}
              {__DEV__ && m.fallback ? (
                <Text variant="caption" tone="faint" className="pl-10">
                  scripted fallback — the model was not called
                </Text>
              ) : null}
              {m.pending?.length
                ? m.pending.map((t, i) => (
                    <Pressable
                      key={`${m.id}-${i}`}
                      onPress={() => {
                        hapticSelect();
                        // Replace (not push) so the create modal opens in the chat's
                        // place — iOS won't stack a modal on top of a modal.
                        router.replace(createHref(t) as Href);
                      }}
                      className="ml-10 flex-row items-center gap-2.5 rounded-2xl border border-accent/30 bg-surface p-3 active:opacity-70">
                      <View className="h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
                        <CalendarDays size={16} color={c.accent} />
                      </View>
                      <View className="flex-1">
                        <Text variant="small" className="font-strong" numberOfLines={1}>
                          {t.title}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {formatFull(t.date)}
                          {t.time ? ` · ${formatTime(t.time)}` : ''}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-0.5">
                        <Text variant="caption" tone="accent" className="font-strong">
                          Review
                        </Text>
                        <ChevronRight size={15} color={c.accent} />
                      </View>
                    </Pressable>
                  ))
                : null}
            </View>
          ))}
          {sending ? (
            <View className="ml-10 flex-row items-center gap-2 self-start rounded-2xl rounded-tl-md bg-accent-soft px-4 py-3">
              <Sparkles size={15} color={c.accent} />
              <Text tone="accent" variant="small">
                Aria is thinking…
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Category focus chips — tell Aria what to focus on */}
        <View className="border-t border-border pt-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            {TASK_KINDS.map((k) => {
              const active = focus === k.value;
              const Icon = KIND_ICON[k.value];
              return (
                <Pressable
                  key={k.value}
                  onPress={() => {
                    hapticSelect();
                    setFocus(active ? null : k.value);
                  }}
                  className={cn(
                    'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5',
                    active ? 'border-accent bg-accent' : 'border-border bg-surface',
                  )}>
                  <Icon size={14} color={active ? c.accentInk : c.muted} />
                  <Text
                    variant="small"
                    tone={active ? 'onAccent' : 'muted'}
                    className="font-strong">
                    {k.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Composer */}
        <View className="px-3 pb-6 pt-2">
          {listening ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="mb-2 flex-row items-center justify-center gap-2 self-center rounded-full bg-accent-soft px-4 py-1.5">
              <Mic size={14} color={c.accent} />
              <Text variant="caption" tone="accent" className="font-strong">
                Listening… (simulated)
              </Text>
            </Animated.View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <View className="flex-1 justify-center rounded-3xl border border-border bg-surface px-4">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={focusLabel ? `Add ${focusLabel.toLowerCase()} details…` : 'Message Aria…'}
                placeholderTextColor={c.faint}
                multiline
                editable={!listening}
                className="max-h-28 py-2.5 text-base text-ink"
                onSubmitEditing={() => send(input)}
              />
            </View>
            {hasText ? (
              <Pressable
                onPress={() => send(input)}
                disabled={sending}
                className="h-12 w-12 items-center justify-center rounded-full bg-accent active:opacity-80">
                <Send size={20} color={c.accentInk} />
              </Pressable>
            ) : (
              <View className="h-12 w-12 items-center justify-center">
                <Animated.View
                  style={ring}
                  pointerEvents="none"
                  className="absolute h-12 w-12 rounded-full bg-accent"
                />
                <Pressable
                  onPress={startVoice}
                  className="h-12 w-12 items-center justify-center rounded-full bg-accent active:opacity-80">
                  <Mic size={20} color={c.accentInk} />
                </Pressable>
              </View>
            )}
          </View>
          <Text variant="caption" tone={focusLabel ? 'accent' : 'faint'} className="mt-1.5 text-center">
            {focusLabel
              ? `Focusing on ${focusLabel} · tap it again to clear`
              : 'Pick a category to focus Aria, or just type'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
