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
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TASK_KINDS, requestDraft } from '@/lib/aria-actions';
import { TaskFlowPanel } from '@/components/task-flow-panel';
import { historyForModel } from '@/lib/chat-scope';
import { requestChecklist } from '@/lib/subtasks';
import { SAVE_QUESTION, saveConfirmation, saveTarget, wantsSave, type SaveTarget } from '@/lib/save-intent';
import { exportWork } from '@/lib/export';
import { openEmailDraft } from '@/lib/send';
import {
  ackFor,
  applyTypedAnswer,
  flowDocument,
  isTypedStep,
  flowTitle,
  nextStep,
  promptFor,
  startFlow,
  toTaskInput,
  type FlowDraft,
  type FlowStep,
} from '@/lib/task-flow';
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
import { hapticSelect, hapticSuccess, hapticTap } from '@/lib/haptics';
import { KIND_ICON } from '@/lib/kind-icons';
import { useAriaStore, type TaskKind } from '@/store/aria-store';

type Msg = {
  id: string;
  from: 'aria' | 'maya';
  text: string;
  pending?: ParsedTask[];
  /** Scripted parser rather than the model. Shown in development only. */
  fallback?: boolean;
  /** A question from the guided setup, see mkPrompt. */
  flowPrompt?: boolean;
  /** Renders as a labelled rule rather than a bubble. */
  divider?: string;
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

/** A question the setup flow asked. Marked so a stranded thread is detectable. */
const mkPrompt = (text: string): Msg => ({ ...mk('aria', text), flowPrompt: true });

/** A seam between one task's setup and the next. */
const mkDivider = (label: string): Msg => ({ ...mk('aria', label), divider: label });

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
  /*
   * The conversational setup, when one is running.
   *
   * Null means ordinary chat. Non-null means Aria is part-way through building
   * something and the composer steps aside for the step's own control — a
   * calendar, a contact picker, two buttons — because the whole point is that
   * this should be less typing than the form, not more.
   */
  const [flow, setFlow] = useState<FlowDraft | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>('who');
  const [drafting, setDrafting] = useState(false);
  /*
   * A finished piece of work, waiting to be taken somewhere.
   *
   * Kept separate from the flow: the task is already saved by this point, so
   * this is an offer rather than a step, and dismissing it must not look like
   * losing the work.
   */
  const [exportable, setExportable] = useState<{ title: string; body: string; taskTitle: string } | null>(
    null,
  );
  /*
   * The last piece of work discussed, so "save this" has a referent.
   *
   * Survives the export card being dismissed: asking again later must still
   * find something, and the task it points at already holds the content.
   */
  const lastWork = useRef<{ id: string; title: string; body: string } | null>(null);
  /** True once Aria has asked where to save and is waiting on the answer. */
  const awaitingTarget = useRef(false);

  /** Carry out a save to wherever was asked for. */
  function performSave(target: SaveTarget) {
    const work = lastWork.current;
    if (!work) return;
    awaitingTarget.current = false;
    setExportable(null);
    if (target === 'note') {
      addDraftSection(work.id, { title: 'Worked out with Aria', content: work.body });
    } else if (target === 'doc') {
      void exportWork(work.title, work.body);
    } else {
      void openEmailDraft({ subject: work.title, body: work.body });
    }
    addChatMessage(mk('aria', saveConfirmation(target, work.title)));
  }
  const addTask = useAriaStore((s) => s.addTask);
  const addSubtasks = useAriaStore((s) => s.addSubtasks);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const profile = useAriaStore((s) => s.profile);

  /** Move the flow on: record the answer, echo it, ask the next thing. */
  function advanceFlow(patch: Partial<FlowDraft>, answered: FlowStep) {
    const next: FlowDraft = {
      ...flow!,
      ...patch,
      // `patch.answered` is merged, not overwritten: picking someone from the
      // contact list answers both "who" and "have I got their details", and
      // the step needs to be able to say so or the flow asks again.
      answered: { ...flow!.answered, ...(patch.answered ?? {}), [answered]: true },
    };
    const ack = ackFor(answered, next);
    if (ack) addChatMessage(mk('aria', ack));
    const step = nextStep(next);
    setFlow(next);
    setFlowStep(step);
    // The preview speaks for itself — its own panel is the message.
    if (step !== 'done') addChatMessage(mkPrompt(promptFor(step, next)));
  }

  function beginFlow(kind: TaskKind) {
    const d = startFlow(kind);
    const step = nextStep(d);
    setFlow(d);
    setFlowStep(step);
    addChatMessage(mkPrompt(promptFor(step, d)));
  }

  async function draftCardMessage(instruction?: string) {
    if (!flow) return;
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await requestDraft({
      title: flowTitle(flow),
      kind: flow.kind,
      method: flow.delivery === 'card' ? 'card' : undefined,
      contactName: flow.who,
      senderName: profile.name,
      senderContext: profile.context,
      instruction,
      previousDraft: instruction ? flow.message : undefined,
      });
      setFlow((f) => (f ? { ...f, message: res.message } : f));
    } finally {
      setDrafting(false);
    }
  }

  /**
   * Teach the topic, pitched at how this student said they learn.
   *
   * The learner profile has been sitting in the store since onboarding and only
   * subtask generation ever read it. This is the surface the welcome flow was
   * always promising: ask for an explanation and get one built around what you
   * are into, at the depth you asked for.
   */
  async function explainTopic() {
    if (!flow) return;
    if (drafting) return; // a second tap must not start a second request
    setDrafting(true);
    try {
      const res = await requestDraft({
      title: flowTitle(flow),
      kind: flow.kind,
      explain: true,
      learner: {
        studying: profile.studying,
        level: profile.level,
        interests: profile.interests,
        explainStyle: profile.explainStyle,
      },
      senderName: profile.name,
      senderContext: profile.context,
      previousDraft: flow.explanation,
      instruction: flow.explanation ? 'Go deeper, with another angle.' : undefined,
      });
      setFlow((f) => (f ? { ...f, explanation: res.message } : f));
    } finally {
      /*
       * `finally`, not a line after the await.
       *
       * requestDraft catches its own failures today, but if anything above it
       * ever throws, the spinner would stay up and the step would be stuck with
       * both buttons disabled — an actual freeze rather than a slow reply.
       */
      setDrafting(false);
    }
  }

  /**
   * Put the screen back to a blank conversation.
   *
   * The eraser used to call `clearChat()` alone, which empties the messages the
   * store holds and leaves everything the *screen* holds untouched — so the
   * calendar, or whichever step was open, stayed on a thread that no longer had
   * a question in it. Same split that stranded a half-finished setup on reopen:
   * the conversation and the flow live in different places, and anything that
   * ends one has to end the other.
   */
  function resetConversation() {
    setFlow(null);
    setFlowStep('who');
    setFocus(null);
    setDrafting(false);
    strandedChecked.current = true; // nothing left to be stranded by
    clearChat();
  }

  /** Break the work into the things it actually involves. */
  async function buildPlan() {
    if (!flow || drafting) return;
    setDrafting(true);
    try {
      const items = await requestChecklist({
        title: flowTitle(flow),
        // The approach is the difference between a generic checklist and one
        // worth reading. It goes in as the description the breakdown works from.
        description: [flow.approach, flow.explanation].filter(Boolean).join('\n\n') || undefined,
        learner: {
          studying: profile.studying,
          level: profile.level,
          interests: profile.interests,
          explainStyle: profile.explainStyle,
        },
      });
      setFlow((f) => (f ? { ...f, checklist: items } : f));
    } finally {
      setDrafting(false);
    }
  }

  /** Dig into one item of the plan and keep the answer with the task. */
  async function askAbout(item: string) {
    if (!flow || drafting) return;
    setDrafting(true);
    try {
      const res = await requestDraft({
        title: flowTitle(flow),
        kind: flow.kind,
        subtaskTitle: item,
        research: true,
        learner: {
          studying: profile.studying,
          level: profile.level,
          interests: profile.interests,
          explainStyle: profile.explainStyle,
        },
        senderName: profile.name,
        senderContext: profile.context,
      });
      setFlow((f) =>
        f
          ? {
              ...f,
              // Replace rather than append: asking the same item twice should
              // refine the answer, not stack two of them on the task.
              notes: [
                ...(f.notes ?? []).filter((n) => n.title !== item),
                { title: item, content: res.message },
              ],
            }
          : f,
      );
    } finally {
      setDrafting(false);
    }
  }

  function saveFlow() {
    if (!flow) return;
    // The explanation goes onto the task, not just into the transcript: it is
    // the thing the student will want again when they sit down to do the work.
    const input = toTaskInput(flow);
    const id = addTask(input);
    // The plan becomes the task's checklist, and everything Aria worked out
    // becomes sections on it — so the work survives the conversation.
    if (flow.checklist?.length) addSubtasks(id, flow.checklist);
    const doc = flowDocument(flow);
    if (doc) addDraftSection(id, { title: 'Worked out with Aria', content: doc });
    const title = flowTitle(flow);
    setFlow(null);
    setFlowStep('who');
    setFocus(null);
    hapticSuccess();
    // Says where it went, not just that it worked. "Saved" on its own leaves
    // the student wondering which of the app's lists now holds it.
    addChatMessage(
      mk('aria', `Done. "${title}" is saved and in your queue. You'll find it on the Tasks page.`),
    );
    // Offered only when there is something worth taking out of the app.
    if (doc) {
      lastWork.current = { id, title, body: doc };
      setExportable({ title, body: doc, taskTitle: title });
    }
  }
  /*
   * A thread that ended mid-setup must not look like a live question.
   *
   * The conversation is persisted; the flow is not. So closing chat part-way
   * through a birthday and coming back left Aria's last message reading
   * "Who's this birthday for?" with no panel under it and no category
   * selected — which looks exactly like the app having chosen birthday by
   * itself and then frozen.
   *
   * Rather than persist the whole flow, Aria says the true thing: that one
   * didn't finish, and here is how to start again. Runs once per mount, and
   * only when the thread actually ended on an unanswered prompt.
   */
  const strandedChecked = useRef(false);
  useEffect(() => {
    if (strandedChecked.current || flow || messages.length === 0) return;
    strandedChecked.current = true;
    const last = messages[messages.length - 1];
    if (last.from !== 'aria' || !last.flowPrompt) return;
    addChatMessage(
      mk('aria', "We didn't finish that one. Pick a category below when you want to start again."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

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
  }, [messages, sending, listening, flowStep, flow?.message]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    hapticTap();
    /*
     * Only this task's stretch of conversation.
     *
     * The whole thread used to go, dividers and every earlier setup included,
     * so Aria answered about the wrong task and blended details between them.
     * The transcript already draws the seams; this makes them real.
     */
    const history: AssistantTurn[] = historyForModel(messages).map((m) => ({
      role: m.from === 'aria' ? 'assistant' : 'user',
      text: m.text,
    }));
    addChatMessage(mk('maya', trimmed));
    setInput('');

    /*
     * A typed answer to a question Aria just asked belongs to the flow.
     *
     * These steps have no input of their own any more — the composer is the
     * input — so what gets typed here is the answer, not a new subject for the
     * model to reply to. Sending it on would have Aria answer "History essay"
     * as though it were a question.
     */
    if (flow && isTypedStep(flowStep)) {
      advanceFlow(applyTypedAnswer(flowStep, trimmed), flowStep);
      return;
    }

    /*
     * Saving is answered here, not by the model.
     *
     * It has to work with the API unreachable — which is the exact moment the
     * scripted fallback would otherwise answer "save this" with something
     * plausible and do nothing — and it should feel instant rather than like
     * waiting for a reply.
     */
    if (lastWork.current) {
      const named = saveTarget(trimmed);
      if (awaitingTarget.current && named) {
        performSave(named);
        return;
      }
      if (wantsSave(trimmed)) {
        if (named) {
          performSave(named);
          return;
        }
        awaitingTarget.current = true;
        addChatMessage(mk('aria', SAVE_QUESTION));
        return;
      }
    }

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
              resetConversation();
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
          {messages.map((m) =>
            m.divider ? (
              /* A labelled rule, not a bubble: this is punctuation in the
                 thread rather than something Aria said. */
              <View key={m.id} className="flex-row items-center gap-3 py-3">
                <View className="h-px flex-1 bg-border" />
                <Text variant="label" tone="faint">
                  {m.divider}
                </Text>
                <View className="h-px flex-1 bg-border" />
              </View>
            ) : (
            <View key={m.id} className="gap-2">
              <AriaBubble from={m.from}>{m.text}</AriaBubble>
              {/* Which one answered — development only.
                  The scripted fallback is written to read like a real reply, so
                  there is otherwise nothing to tell them apart. That is what let
                  a dead API key survive weeks of testing: every response looked
                  right. Stripped from release builds. */}
              {__DEV__ && m.fallback ? (
                <Text variant="caption" tone="faint" className="pl-10">
                  scripted fallback, the model was not called
                </Text>
              ) : null}
              {m.pending?.length
                ? m.pending.map((t, i) => (
                    <Pressable
                      key={`${m.id}-${i}`}
                      /*
                       * Tapping creates it, here.
                       *
                       * This used to replace the chat with the create form,
                       * pre-filled — which meant a task described in a sentence
                       * still had to be confirmed on a screen full of fields,
                       * and the conversation was closed to do it. Aria has
                       * everything it needs; the point of saying it out loud is
                       * not having to fill the form in.
                       *
                       * Long-press still opens the form, for the times the
                       * parse was close but not right.
                       */
                      onPress={() => {
                        hapticSuccess();
                        const id = addTask({
                          title: t.title,
                          date: t.date,
                          priority: t.priority,
                          kind: t.kind,
                          contactName: t.contactName,
                          contactEmail: t.contactEmail,
                          method: t.method,
                          time: t.time,
                        });
                        lastWork.current = {
                          id,
                          title: t.title,
                          body: `${t.title}\n${formatFull(t.date)}${t.time ? ` at ${formatTime(t.time)}` : ''}`,
                        };
                        addChatMessage(
                          mk('aria', `Added "${t.title}" for ${formatFull(t.date)}. Say the word if you want it saved somewhere.`),
                        );
                      }}
                      onLongPress={() => {
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
                          Add
                        </Text>
                        <ChevronRight size={15} color={c.accent} />
                      </View>
                    </Pressable>
                  ))
                : null}
            </View>
            )
          )}
            {/*
              Taking the work out of the app.

              Offered after saving, not instead of it: the task already holds a
              copy, so this is about getting it somewhere else rather than about
              not losing it. `exportWork` writes a file and opens the share
              sheet, falling back to the clipboard, so one button covers every
              destination the phone has.
            */}
            {exportable ? (
              <View className="ml-10 gap-3 rounded-2xl rounded-tl-sm border border-accent/25 bg-accent-soft/60 p-3.5">
                <Text variant="label" tone="muted">
                  Keep a copy?
                </Text>
                <View className="flex-row gap-2">
                  <Button
                    title="Save or share"
                    className="flex-1"
                    onPress={() => {
                      void exportWork(exportable.title, exportable.body);
                      setExportable(null);
                    }}
                  />
                  <Button
                    title="Email"
                    variant="secondary"
                    onPress={() => {
                      void openEmailDraft({ subject: exportable.title, body: exportable.body });
                      setExportable(null);
                    }}
                  />
                  <Button title="No" variant="secondary" onPress={() => setExportable(null)} />
                </View>
              </View>
            ) : null}

            {/*
              The controls, in the conversation.

              These were docked above the composer, which put Aria's question at
              the top of the screen and its answers at the bottom with the whole
              transcript in between — one exchange split in half and reading as
              two unrelated things. Rendering them here, straight after the
              message that asked, makes the question and its answers a single
              turn. The scroll-to-end below keeps them in view.
            */}
          {flow && flowStep !== 'done' ? (
            <View className="pb-1">
              <TaskFlowPanel
                step={flowStep}
                draft={flow}
                drafting={drafting}
                onAnswer={advanceFlow}
                onDraftMessage={() => void draftCardMessage()}
              onExplain={() => void explainTopic()}
              onPlan={() => void buildPlan()}
              onAsk={(item) => void askAbout(item)}
                onMessageChange={(text) => setFlow((f) => (f ? { ...f, message: text } : f))}
                onTone={(instruction) => void draftCardMessage(instruction)}
                onAccept={saveFlow}
                /*
                 * Changing an answer happens here, not on the task form.
                 *
                 * Edit used to push to /task/new and drop the flow. Backing out
                 * of that form without saving left the conversation stranded:
                 * the preview was gone, the questions were all answered, and
                 * there was no way to reach either the task or the flow again.
                 * Re-opening one step keeps everything in the chat, which is the
                 * whole point of doing it here.
                 */
                onEdit={(stepToRedo: FlowStep) => {
                  setFlow((f) => {
                    if (!f) return f;
                    const answered: FlowDraft['answered'] = { ...f.answered };
                    delete answered[stepToRedo];
                    delete answered.preview;
                    return { ...f, answered };
                  });
                  const reopened: FlowDraft = { ...flow, answered: { ...flow.answered } };
                  delete reopened.answered[stepToRedo];
                  delete reopened.answered.preview;
                  const step = nextStep(reopened);
                  setFlowStep(step);
                  addChatMessage(mkPrompt(promptFor(step, reopened)));
                }}
                onCancel={() => {
                  setFlow(null);
                  setFocus(null);
                  addChatMessage(mk('aria', "Dropped that one. Tell me when you're ready."));
                }}
              />
            </View>
          ) : null}

          {sending || drafting ? (
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
                    if (active) {
                      setFocus(null);
                      return;
                    }
                    setFocus(k.value);
                    /*
                     * The divider goes here, not inside beginFlow.
                     *
                     * It lived in beginFlow, which only runs for birthdays and
                     * anniversaries, so picking an event after finishing a
                     * birthday produced no seam at all: the two setups ran
                     * together exactly as before. Every category starts a new
                     * piece of work, so every category earns the rule.
                     *
                     * Skipped on an empty thread, where there is nothing yet to
                     * divide it from.
                     */
                    if (messages.length > 0) addChatMessage(mkDivider(k.label));
                    // Every category is walked now. `nextStep` decides which
                    // questions each kind actually needs.
                    beginFlow(k.value);
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
                /* The composer answers the open question now, so it says so
                   rather than offering a generic prompt beneath one. */
                placeholder={
                  flow && isTypedStep(flowStep)
                    ? 'Type your answer…'
                    : focusLabel
                      ? `Add ${focusLabel.toLowerCase()} details…`
                      : 'Message Aria…'
                }
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
