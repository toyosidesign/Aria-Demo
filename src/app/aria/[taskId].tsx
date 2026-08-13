import { router, useLocalSearchParams, type Href } from 'expo-router';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Lock,
  Mail,
  Send,
  Share2,
  Sparkles,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type View as RNView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaBubble } from '@/components/aria-bubble';
import { ScriptedNote } from '@/components/scripted-note';
import { uuidv4 } from '@/lib/id';
import { goBack } from '@/lib/nav';
import { looksLikeQuestion } from '@/lib/question';
import { handInReadiness } from '@/lib/ready';
import { WORKING_SECTION, ownInstruction, workingDraft, writtenSections } from '@/lib/sections';
import { UNCHANGED_NOTICE } from '@/lib/assistant';
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
import { WhatsAppIcon } from '@/components/brand-icons';
import { CardCanvas } from '@/components/card-canvas';
import { PhotoCanvas } from '@/components/photo-canvas';
import { cardTemplate, renderCard } from '@/lib/cards';
import { cardSharingAvailable, shareCardImage } from '@/lib/card-image';
import { exportWork, sectionsToText } from '@/lib/export';
import { emailSubject, openEmailDraft, openSmsDraft, openWhatsAppDraft } from '@/lib/send';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { selectNextDue, useAriaStore } from '@/store/aria-store';

type Phase =
  | 'drafting'
  | 'review'
  | 'approve'
  /** Written and accepted: where should it live? */
  | 'keep'
  | 'sending'
  | 'done'
  | 'declined';
type Msg = {
  id: string;
  from: 'aria' | 'maya';
  kind: 'text' | 'draft';
  text: string;
  /** The scripted stand-in answered rather than the model. Shown in dev. */
  scripted?: boolean;
};

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

/*
 * Ids are uuids now, not a counter.
 *
 * Two reasons, both real. They are a primary key in Postgres since migration
 * 006, and the counter restarted at every mount, so a thread restored from
 * storage and then added to produced two messages called "m1": React keyed them
 * together and the server would have treated the second as an edit of the first.
 */
const mk = (from: Msg['from'], kind: Msg['kind'], text: string, scripted?: boolean): Msg => ({
  id: uuidv4(),
  from,
  kind,
  text,
  scripted,
});

const tap = hapticTap;

/*
 * One array for "no thread yet", not a fresh one per render.
 *
 * A selector that returns `?? []` builds a new array every call, and zustand
 * compares by identity, so this screen would re-render forever.
 */
const EMPTY_THREAD: Msg[] = [];

export default function AriaFlowScreen() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const allTasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const task = allTasks.find((t) => t.id === taskId);
  const completeTask = useAriaStore((s) => s.completeTask);
  const reopenTask = useAriaStore((s) => s.reopenTask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const removeDraftSection = useAriaStore((s) => s.removeDraftSection);
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);
  const pro = useAriaStore((s) => s.pro);
  // Aria writes and signs as whoever is signed in, never the demo persona.
  const senderName = useAriaStore((s) => s.profile.name) || ARIA_SENDER;
  const senderContext = useAriaStore((s) => s.profile.context);

  const action = task ? ariaActionFor(task) : null;

  /*
   * The thread lives in the store, not in this screen.
   *
   * It used to be `useState`, so it died with the screen: reopening a task Aria
   * had worked on for an hour showed an empty page, and everything asked and
   * answered was gone. Reported as Continue starting afresh, and from the
   * screen's point of view it was.
   */
  const messages = useAriaStore((s) => s.workChats[taskId ?? '']?.messages) ?? EMPTY_THREAD;
  const savedChat = useAriaStore((s) => s.workChats[taskId ?? '']);
  const pushWorkMessage = useAriaStore((s) => s.pushWorkMessage);
  const setWorkChatState = useAriaStore((s) => s.setWorkChatState);

  const [phase, setPhaseLocal] = useState<Phase>('drafting');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [input, setInput] = useState('');
  const [activeSubId, setActiveSubIdLocal] = useState<string | null>(null);
  const setActiveSubId = (id: string | null) => {
    setActiveSubIdLocal(id);
    if (taskId) setWorkChatState(taskId, { phase, activeSubId: id ?? undefined });
  };
  /** Waiting to ask whether the handoff actually got sent. */
  const [backCheck, setBackCheck] = useState(false);
  /** Cards go out as text, so Maya picks Mail or WhatsApp to carry them. */
  const [cardVia, setCardVia] = useState<'email' | 'whatsapp'>('email');
  // Kept alongside sendCardImage below: the "send as a picture" CTA is out for
  // now, and both are what a future one would call again.
  const canShareCard = cardSharingAvailable();
  // Essays and projects are worth keeping outside Aria; a sent text isn't.
  const isAssignmentKind = task?.kind === 'assignment' || task?.kind === 'project';
  const cardRef = useRef<RNView>(null);
  const photoRef = useRef<RNView>(null);
  const startedRef = useRef(false);
  const handedOffRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const push = (m: Msg) => {
    if (taskId) pushWorkMessage(taskId, m);
  };

  /** Kept with the thread, so reopening lands on the step it was left on. */
  const setPhase = (next: Phase) => {
    setPhaseLocal(next);
    if (taskId) setWorkChatState(taskId, { phase: next, activeSubId: activeSubId ?? undefined });
  };
  const nextIncompleteSub = (excludeId?: string) =>
    task?.subtasks.find((s) => !s.done && s.id !== excludeId) ?? null;

  /*
   * Hold the draft where it will survive the screen being closed.
   *
   * Accepted work becomes a section and sections sync, so a part somebody
   * checked off is still there tomorrow on another device. An unaccepted draft
   * lived in this component and died with it, which is why "Continue" produced
   * different text and lost every tweak: it was not continuing, it was writing
   * again from scratch. It is now held as a reserved section, see lib/sections.
   */
  function keepWorking(text: string, subId?: string) {
    setDraft(text);
    if (!task) return;
    addDraftSection(task.id, {
      title: WORKING_SECTION,
      content: subId ? `${subId}\n${text}` : text,
    });
  }

  /** Accepted, so the unfinished copy has nothing left to say. */
  function clearWorking() {
    if (!task) return;
    removeDraftSection(task.id, WORKING_SECTION);
  }

  async function generateSub(sub: { id: string; title: string }, instruction?: string) {
    if (!task) return;
    setActiveSubId(sub.id);
    setTyping(true);
    const res = await requestDraft({
      kind: 'assignment',
      title: task.title,
      description: task.description,
      subtaskTitle: sub.title,
      senderName,
      senderContext,
      instruction,
      // Their words outrank everything this route would otherwise decide.
      ownInstruction: ownInstruction(task.draftSections),
      previousDraft: instruction ? draft : undefined,
    });
    setTyping(false);

    /*
     * A rewrite that changed nothing is said out loud.
     *
     * "Aria is unable to rewrite a note" was reported as a bug and was not one:
     * the key was dead, the stand-in returned the same text, and the screen
     * re-rendered the identical draft with no sign anything had happened. A
     * tweak that silently no-ops is indistinguishable from a broken button.
     */
    if (instruction && res.message.trim() === draft.trim()) {
      push(mk('aria', 'text', UNCHANGED_NOTICE, res.fallback));
      setPhase('review');
      return;
    }

    keepWorking(res.message, sub.id);
    push(mk('aria', 'draft', res.message, res.fallback));
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
      senderName,
      senderContext,
      instruction,
      ownInstruction: ownInstruction(task.draftSections),
      previousDraft: instruction ? draft : undefined,
    });
    setTyping(false);

    if (instruction && res.message.trim() === draft.trim()) {
      push(mk('aria', 'text', UNCHANGED_NOTICE, res.fallback));
      setPhase('review');
      return;
    }

    keepWorking(res.message);
    push(mk('aria', 'draft', res.message, res.fallback));
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

  /*
   * Opening the screen, which is usually not the beginning.
   *
   * This used to greet everybody with "let's work through this together, 6
   * parts" and write the next part again from scratch, whether they had never
   * seen it or had four parts behind them. Reported as Continue restarting the
   * task, and it was: the position was right, but nothing that had happened was
   * on screen and an unfinished draft was replaced by a different one.
   *
   * So it now reads what is stored before it says anything. Ticked parts and
   * accepted sections say how far in they are; a reserved working section says
   * whether they stopped mid-draft, and if they did, that exact text comes back
   * rather than a fresh attempt at it. Regenerating is what loses somebody's
   * tweaks, and it is indistinguishable from being ignored.
   */
  useEffect(() => {
    if (startedRef.current || !task || !action) return;
    startedRef.current = true;

    /*
     * A thread that already exists is the whole answer.
     *
     * Nothing is written, nothing is greeted and nothing is generated: the
     * conversation is on screen, the draft they were looking at comes back with
     * it, and the screen reopens on the step it was left on. Saying "picking up
     * where we left off" above a conversation somebody can already see would be
     * narrating the obvious.
     */
    if (savedChat?.messages.length) {
      const leftOn = workingDraft(task.draftSections)?.content ?? '';
      if (leftOn) {
        const [head, ...rest] = leftOn.split('\n');
        const known = task.subtasks.some((s) => s.id === head);
        setDraft(known ? rest.join('\n') : leftOn);
        if (known) setActiveSubIdLocal(head);
      } else if (savedChat.activeSubId) {
        setActiveSubIdLocal(savedChat.activeSubId);
      }
      setPhaseLocal((savedChat.phase as Phase) ?? 'review');
      return;
    }

    const saved = workingDraft(task.draftSections);
    const done = task.subtasks.filter((s) => s.done).length;
    const wrote = writtenSections(task.draftSections).length;
    const returning = done > 0 || wrote > 0 || !!saved?.content?.trim();

    /** The part a stored draft belongs to, and the text without its marker. */
    const savedFor = (() => {
      const raw = saved?.content ?? '';
      if (!raw.trim()) return null;
      const [head, ...rest] = raw.split('\n');
      const sub = task.subtasks.find((s) => s.id === head);
      return sub ? { sub, text: rest.join('\n') } : { sub: null, text: raw };
    })();

    const walkthrough = action.walkthrough;
    if (walkthrough) {
      const first = task.subtasks.find((s) => !s.done);
      if (!first) {
        push(mk('aria', 'text', 'Every part of this is already done. Nice work.'));
        setPhase('done');
        return;
      }

      push(
        mk(
          'aria',
          'text',
          returning
            ? `Picking up where we left off. ${done} of ${task.subtasks.length} parts done, and we were on “${(savedFor?.sub ?? first).title}.”`
            : `Let’s work through this together, ${task.subtasks.length} parts. First up: “${first.title}.”`,
        ),
      );

      /*
       * The draft they left, not a new one that happens to be about the same
       * thing. Only when it belongs to the part still open: an older scrap from
       * a part since accepted would be putting finished work back in front of
       * them as though it were unfinished.
       */
      if (savedFor && (!savedFor.sub || savedFor.sub.id === first.id)) {
        const sub = savedFor.sub ?? first;
        setActiveSubId(sub.id);
        setDraft(savedFor.text);
        push(mk('aria', 'draft', savedFor.text));
        push(
          mk(
            'aria',
            'text',
            `That’s where we got to on “${sub.title}.” Carry on from here, tweak it with the chips, or tell me what to change.`,
          ),
        );
        setPhase('review');
        return;
      }

      generateSub(first);
    } else if (savedFor?.text) {
      // Same rule off the walkthrough: an unfinished draft comes back as it was.
      setDraft(savedFor.text);
      push(mk('aria', 'text', 'Picking up where we left off.'));
      push(mk('aria', 'draft', savedFor.text));
      push(
        mk(
          'aria',
          'text',
          'That’s where we got to. Carry on from here, or tell me what to change.',
        ),
      );
      setPhase('review');
    } else if (action.method === 'card' && task.description?.trim()) {
      // The message was written on the task itself, use it rather than
      // replacing what Maya already decided the card should say.
      const written = task.description.trim();
      setDraft(written);
      push(mk('aria', 'draft', written));
      push(
        mk(
          'aria',
          'text',
          'Here’s the message you wrote for the card. Send it as-is, or tell me how to change it.',
        ),
      );
      setPhase('review');
    } else {
      push(mk('aria', 'text', `On it. Give me a second to write ${action.drafting}.`));
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, action]);

  // Auto-scroll to newest.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, typing]);

  // Coming back from Mail / Messages. Aria checked the task off when it opened
  // the app, but it can't see whether Maya actually hit send, so ask, and give
  // her a one-tap way to put it back if she didn't.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !handedOffRef.current) return;
      handedOffRef.current = false;
      push(mk('aria', 'text', 'Welcome back. Did that send OK?'));
      setBackCheck(true);
    });
    return () => sub.remove();
  }, []);

  if (!task || !action) {
    return (
      <Screen padded edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center gap-5 px-6">
          <Text tone="muted" className="text-center leading-6">
            {task
              ? 'There’s nothing for Aria to do on this one.'
              : 'I can’t find that task any more. It may have been completed or deleted.'}
          </Text>
          {/* replace, not back: whatever was behind this may be gone too */}
          <View className="w-full gap-2">
            <Button title="Back to my tasks" block onPress={() => router.replace('/(tabs)/tasks')} />
            <Button
              title="Go home"
              variant="secondary"
              block
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        </View>
      </Screen>
    );
  }

  const contact = task.contactName ?? 'them';
  const meta = isMessageMethod(action.method) ? METHOD_META[action.method] : null;
  const app = meta?.app ?? 'Messages';
  const recipient =
    action.method === 'email' ? task.contactEmail : action.method === 'sms' ? task.contactPhone : undefined;
  const hasText = input.trim().length > 0;
  const canCompose = (phase === 'review' || phase === 'approve') && !typing;
  const isWalkthrough = !!action.walkthrough;

  /*
   * Whether this is finished, asked rather than assumed. See lib/ready.ts.
   */
  const readiness = handInReadiness(task);
  const upNext = nextIncompleteSub(activeSubId ?? undefined);
  const rewrites = action.type === 'assignment' ? ASSIGNMENT_REWRITES : REWRITES;
  const acceptLabel = isWalkthrough
    ? nextIncompleteSub(activeSubId ?? undefined)
      ? 'Check off & continue'
      : 'Check off & finish'
    : action.needsSend
      ? 'Send it'
      : 'Done';

  function redraft(instruction: string) {
    if (isWalkthrough) {
      const sub = task!.subtasks.find((s) => s.id === activeSubId);
      if (sub) generateSub(sub, instruction);
    } else {
      generate(instruction);
    }
  }

  /** Keep it on the task, which is where Aria's own drafts live. */
  function keepOnTask() {
    tap();
    clearWorking();
    addDraftSection(task!.id, { title: draftSectionTitle(action!.method), content: draft });
    push(mk('maya', 'text', 'Keep it here.'));
    push(
      mk(
        'aria',
        'text',
        'Saved. You’ll find it on this task under “Aria’s draft”, and tasks holding one are marked Draft in your lists.',
      ),
    );
    setPhase('done');
  }

  /**
   * Out to a document, which is also the way into Notes.
   *
   * The share sheet is the phone's own answer to "where does this go": Notes,
   * Files, Drive, Mail, whatever is installed. Kept on the task as well rather
   * than instead, because a file somebody saved and then lost track of should
   * not mean the work has left the app.
   */
  function keepAsDocument() {
    tap();
    clearWorking();
    addDraftSection(task!.id, { title: draftSectionTitle(action!.method), content: draft });
    push(mk('maya', 'text', 'Put it in a document.'));
    void exportWork(task!.title, draft);
    push(
      mk(
        'aria',
        'text',
        'There you go. Pick Notes, Files, or wherever suits. I’ve kept a copy on the task too, so it isn’t only in that file.',
      ),
    );
    setPhase('done');
  }

  function acceptSubtask() {
    const sub = task!.subtasks.find((s) => s.id === activeSubId);
    push(mk('maya', 'text', 'Looks good.'));
    clearWorking();
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
          'That’s every part done. I’ve compiled it all into one draft and checked the assignment off. Want me to save it to your Notes app?',
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
          action!.method === 'photo'
            ? `Ready when you are. I'll put your picture and the message together, then hand it to WhatsApp for ${contact}.`
            : action!.method === 'card'
            ? `Ready when you are. Shall it go to ${contact} by Mail or on WhatsApp?`
            : `Ready when you are. May I open ${app} with this ready to send to ${contact}${
                recipient ? ` (${recipient})` : ''
              }? You'll tap send yourself, I never send anything on your behalf.`,
        ),
      );
      setPhase('approve');
    } else {
      /*
       * Accepted, and then asked where it should live.
       *
       * It used to save itself onto the task and announce that it had. That is
       * one destination decided on somebody's behalf, and the destination is
       * the part they care about: a draft they will come back to belongs on the
       * task, and a draft they are about to work on elsewhere belongs in their
       * own notes or a file. Asking costs one tap and removes the copy-and-paste
       * that followed the old behaviour.
       */
      push(mk('maya', 'text', 'That works.'));
      push(mk('aria', 'text', 'Where would you like it? I can keep it here, or put it in a document.'));
      setPhase('keep');
    }
  }

  /** The finished text, wrapped in the chosen card design when there is one. */
  function outgoingBody(): string {
    const template = cardTemplate(task!.cardTemplateId);
    if (action!.method !== 'card' || !template) return draft;
    return renderCard({
      template,
      toName: task!.contactName,
      body: draft,
      fromName: senderName,
    });
  }

  /**
   * Share the picture with the message burned onto it.
   *
   * One image through the share sheet is what reaches WhatsApp, Facebook and
   * Instagram alike, none of them accept a caption handed over from another
   * app, so the words have to be part of the picture.
   */
  async function sharePhoto() {
    tap();
    push(mk('maya', 'text', 'Share it.'));
    setPhase('sending');
    setTyping(true);
    addDraftSection(task!.id, { title: 'Message', content: draft });

    const result = await shareCardImage(photoRef, { dialogTitle: `Share with ${contact}` });
    setTyping(false);

    if (result !== 'shared') {
      push(mk('aria', 'text', 'I couldn’t put that together as an image. Want to try again?'));
      setPhase('approve');
      return;
    }

    handedOffRef.current = true;
    push(
      mk(
        'aria',
        'text',
        `✓ Your picture and message are ready. Pick WhatsApp when the share sheet opens.`,
      ),
    );
    completeTask(task!.id, { byAria: true });
    hapticSuccess();
    push(mk('aria', 'text', 'I’ve checked this off and moved it to your Done list.'));
    setPhase('done');
  }

  /**
   * Send the card as an actual image. No mail or message link can carry an
   * attachment, so this goes through the system share sheet, which means the
   * recipient is chosen there rather than pre-filled by Aria.
   */
  async function sendCardImage() {
    tap();
    push(mk('maya', 'text', 'Send it as a card.'));
    setPhase('sending');
    setTyping(true);
    addDraftSection(task!.id, { title: 'Card', content: outgoingBody() });

    const result = await shareCardImage(cardRef, { dialogTitle: `Send ${contact} a card` });
    setTyping(false);

    if (result !== 'shared') {
      push(
        mk(
          'aria',
          'text',
          'I couldn’t turn that into an image here. You can still send it as a message instead.',
        ),
      );
      setPhase('approve');
      return;
    }

    handedOffRef.current = true;
    push(
      mk(
        'aria',
        'text',
        `✓ Your card is ready to send to ${contact}. Pick where it goes and tap send.`,
      ),
    );
    completeTask(task!.id, { byAria: true });
    hapticSuccess();
    push(mk('aria', 'text', 'I’ve checked this off and moved it to your Done list.'));
    setPhase('done');
  }

  /** Hand the finished draft to the phone's own Mail / Messages app. */
  async function approveAndSend() {
    tap();
    push(mk('maya', 'text', 'Approved. Go ahead.'));
    setPhase('sending');
    setTyping(true);

    const body = outgoingBody();
    // Keep a copy on the task, the draft shouldn't be lost in the handoff.
    addDraftSection(task!.id, { title: meta?.label ?? 'Draft', content: body });

    const method = action!.method;
    // A card is plain text, so it rides on Mail or WhatsApp, never SMS, where
    // the layout falls apart.
    const res =
      method === 'email' || (method === 'card' && cardVia === 'email')
        ? await openEmailDraft({
            to: task!.contactEmail,
            subject: emailSubject(task!.title, task!.kind),
            body,
          })
        : method === 'card'
          ? await openWhatsAppDraft({ phone: task!.contactPhone, body })
          : await openSmsDraft({ phone: task!.contactPhone, body });

    // Only expect a return trip if we actually left the app.
    handedOffRef.current = !res.copied;

    setTyping(false);
    const noun = meta?.short ?? 'message';
    push(
      mk(
        'aria',
        'text',
        res.copied
          ? `I couldn’t open ${res.app} on this device, so I’ve copied the ${noun} to your clipboard. Paste it in and send.`
          : `✓ Opened ${res.app} with the ${noun} ready for ${contact}. Read it over and tap send.`,
      ),
    );
    completeTask(task!.id, { byAria: true });
    hapticSuccess();
    push(mk('aria', 'text', 'I’ve checked this off and moved it to your Done list.'));
    setPhase('done');
  }

  /** "Yes, it sent", leave the task checked off. */
  function confirmSent() {
    tap();
    push(mk('maya', 'text', 'Yes, it sent.'));
    push(mk('aria', 'text', 'Lovely. That one’s off your plate.'));
    setBackCheck(false);
  }

  /** "It didn't send", put the task back so it isn't quietly lost. */
  function undoSent() {
    tap();
    push(mk('maya', 'text', 'It didn’t send.'));
    reopenTask(task!.id);
    push(
      mk(
        'aria',
        'text',
        'No problem, I’ve put it back on your list. The draft is still here, tap Send it whenever you want another go.',
      ),
    );
    setBackCheck(false);
    setPhase('review');
  }

  function chooseRewrite(instruction: string, label: string) {
    if (typing) return;
    tap();
    push(mk('maya', 'text', `Rewrite: ${label.toLowerCase()}.`));
    redraft(instruction);
  }

  /** A free-form instruction → re-draft with it (or reply to small talk). */
  /**
   * Answer a question about the draft, and leave the draft alone.
   *
   * The screen keeps its phase and its text: nothing about being asked "why is
   * this second?" means the work should change.
   */
  async function answerAbout(question: string) {
    if (!task) return;
    setTyping(true);
    const sub = task.subtasks.find((s) => s.id === activeSubId);
    const res = await requestDraft({
      kind: task.kind,
      title: task.title,
      description: task.description,
      subtaskTitle: sub?.title,
      senderName,
      senderContext,
      question,
      previousDraft: draft,
      ownInstruction: ownInstruction(task.draftSections),
    });
    setTyping(false);
    push(mk('aria', 'text', res.message, res.fallback));
  }

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
    /*
     * Asked, or told. Everything used to be told.
     *
     * "Why did you put the Berlin example second?" was handled by writing the
     * section again, which is why Aria appeared to repeat itself: it answered a
     * question nobody asked and ignored the one that was.
     */
    if (looksLikeQuestion(trimmed) && draft.trim()) {
      void answerAbout(trimmed);
      return;
    }
    redraft(trimmed);
  }

  /** After a completed task, jump to the next due or late task; else return. */
  function finish() {
    const next = selectNextDue(allTasks, demoDate, task!.id);
    if (task!.status === 'done' && next)
      router.replace({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
    else goBack('/(tabs)/tasks');
  }

  /**
   * Check the task off from here.
   *
   * Drafting an assignment saves the work but leaves the task open, which is
   * right: writing a section isn't finishing the essay. What was missing was any
   * way to say it *is* finished without leaving for the task screen, so a task
   * could sit labelled "Draft" with no route to done from where the work ended.
   */
  function markComplete() {
    hapticSuccess();
    const next = selectNextDue(allTasks, demoDate, task!.id);
    completeTask(task!.id);
    if (next) router.replace({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
    else router.replace('/(tabs)/tasks');
  }

  function decline() {
    tap();
    push(mk('maya', 'text', 'Not now, thanks.'));
    push(
      mk(
        'aria',
        'text',
        'No problem at all. Want to put it in for another day and time instead? Otherwise I’ll leave it with you.',
      ),
    );
    setPhase('declined');
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => goBack('/(tabs)/tasks')} />
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
                <ScriptedNote show={m.scripted} className="pt-2" />
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
                  <Text variant="small" tone="accent" className="font-strong">
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

          {/* Accepted, and choosing where it goes. */}
          {phase === 'keep' ? (
            <View className="gap-2">
              <Button
                title="Keep it on this task"
                leftIcon={<Check size={18} color={c.accentInk} />}
                block
                onPress={keepOnTask}
              />
              <Button
                title="Save it as a document"
                variant="secondary"
                leftIcon={<Share2 size={18} color={c.ink} />}
                block
                onPress={keepAsDocument}
              />
            </View>
          ) : null}

          {/* Primary actions */}
          {phase === 'review' ? (
            <View className="gap-2">
              {/*
                Nothing to decline when the button says "Done".

                Accepting a draft no longer sends anything or finishes anything:
                it asks where the work should live. Sitting a "Not now" beside
                that offered a refusal to a question that was not being put, and
                on the one screen where somebody is in the middle of working it
                read as Aria angling for the exit. Leaving is still a tap away
                in the corner, and the composer is right there to say what to
                change instead.

                A send keeps its refusal, because "do not send this to them" is
                a real answer to a real question.
              */}
              <View className="flex-row gap-2">
                <Button
                  title={acceptLabel}
                  leftIcon={<Check size={18} color={c.accentInk} />}
                  onPress={accept}
                  className="flex-1"
                />
                {action.needsSend ? (
                  <Button title="Not now" variant="secondary" onPress={decline} />
                ) : null}
              </View>
              {/* Hand the finished draft to Aria to send at a chosen moment. */}
              {action.needsSend ? (
                <Button
                  title={pro ? 'Let Aria send it for you' : 'Let Aria send it for you · Pro'}
                  variant="ghost"
                  size="sm"
                  block
                  leftIcon={
                    pro ? (
                      <CalendarClock size={16} color={c.accent} />
                    ) : (
                      <Lock size={14} color={c.accent} />
                    )
                  }
                  onPress={() => {
                    tap();
                    router.push({
                      pathname: '/schedule',
                      params: {
                        taskId: task.id,
                        body: draft,
                        channel: action.method === 'email' ? 'email' : 'sms',
                      },
                    });
                  }}
                />
              ) : null}
            </View>
          ) : null}

          {phase === 'approve' ? (
            <View className="gap-2">
              {action.method === 'photo' ? (
                <Button
                  title="Share on WhatsApp"
                  leftIcon={<WhatsAppIcon size={19} color={c.accentInk} />}
                  block
                  disabled={!task.photoUri}
                  onPress={sharePhoto}
                />
              ) : action.method === 'card' ? (
                <View className="gap-2">
                  <Text variant="label" tone="muted">
                    Send it via
                  </Text>
                  <View className="flex-row gap-2">
                    <Button
                      title="Mail"
                      leftIcon={<Mail size={17} color={c.accentInk} />}
                      className="flex-1"
                      onPress={() => {
                        setCardVia('email');
                        void approveAndSend();
                      }}
                    />
                    <Button
                      title="WhatsApp"
                      variant="secondary"
                      leftIcon={<WhatsAppIcon size={18} />}
                      className="flex-1"
                      onPress={() => {
                        setCardVia('whatsapp');
                        void approveAndSend();
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title={`Approve & open ${app}`}
                  leftIcon={<Send size={18} color={c.accentInk} />}
                  block
                  onPress={approveAndSend}
                />
              )}
              <Button title="Not now" variant="ghost" size="sm" block onPress={decline} />
            </View>
          ) : null}

          {/* Just back from Mail / Messages, did it actually go? */}
          {backCheck ? (
            <View className="flex-row gap-2">
              <Button
                title="Yes, it sent"
                leftIcon={<Check size={18} color={c.accentInk} />}
                onPress={confirmSent}
                className="flex-1"
              />
              <Button title="It didn’t" variant="secondary" onPress={undoSent} />
            </View>
          ) : null}

          {!backCheck && (phase === 'done' || phase === 'declined') ? (
            <View className="gap-2">
              {/* Declining shouldn't dead-end, offer a new slot for it. */}
              {phase === 'declined' ? (
                <Button
                  title="Pick another day & time"
                  leftIcon={<CalendarClock size={18} color={c.accentInk} />}
                  block
                  onPress={() => {
                    tap();
                    router.push({ pathname: '/reschedule', params: { id: task.id } });
                  }}
                />
              ) : null}
              {/*
                Work is put down until the day it is needed, not ticked off.

                "Mark complete" was the wrong question at the end of a piece of
                work. An essay written on Tuesday is done, not finished: it still
                has to go in on Friday, and ticking it off closes the one thing
                that would have reminded anybody. Everything else Aria finishes,
                a card, a message, is genuinely over when it is sent, so those
                keep completing here.
              */}
              {/*
                Work ends by being sent or saved, not by being scheduled here.

                This used to offer "Schedule for later", which put a second
                calendar in front of somebody who had just finished writing and
                asked them to set a hand-in date they may not know yet. The day
                a piece of work is due belongs on the task, where it already is;
                what belongs at the end of the writing is what happens to the
                writing. Everything Aria finishes that is genuinely over when it
                is sent, a card, a message, still completes here.
              */}
              {phase === 'done' && task.status === 'todo' && !isAssignmentKind ? (
                <Button
                  title="Mark complete"
                  leftIcon={<CheckCircle2 size={19} color={c.accentInk} />}
                  block
                  size="lg"
                  onPress={markComplete}
                />
              ) : null}

              {/*
                Still unfinished, so the loud button is the work itself.

                Offering an ending to somebody a sixth of the way through says
                Aria thinks they have finished. The next step says the opposite,
                and names which step it is.
              */}
              {phase === 'done' && task.status === 'todo' && isAssignmentKind && !readiness.ready ? (
                <>
                  <Button
                    title={upNext ? `Keep going: ${upNext.title}` : 'Keep working on it'}
                    leftIcon={<ArrowRight size={19} color={c.accentInk} />}
                    block
                    size="lg"
                    onPress={() => {
                      tap();
                      if (upNext) void generateSub(upNext);
                      else router.replace(`/task/${task.id}`);
                    }}
                  />
                  <Text variant="caption" tone="muted" className="text-center">
                    {readiness.blocker}
                  </Text>
                </>
              ) : null}

              {/*
                What happens to the work Aria just produced, in two real options.

                "Save to…" was one button and one destination, and it hid the
                thing people actually need from a finished piece of work: getting
                it to somebody at a particular moment. A tutor, a supervisor, a
                submission address. Saving it is the other half, and they are
                different acts rather than two names for one.
              */}
              {phase === 'done' && isAssignmentKind && (task.draftSections?.length ?? 0) > 0 ? (
                <>
                  {/* Promoted now that scheduling has gone: sending it is the
                      likeliest ending for a finished piece of work, and with
                      nothing above it there was no primary left on the screen. */}
                  <Button
                    title="Email it, at a time I pick"
                    leftIcon={<Mail size={18} color={c.accentInk} />}
                    block
                    size="lg"
                    onPress={() => router.push(`/email-it/${task.id}` as Href)}
                  />
                  <Button
                    title="Save as a document"
                    variant="secondary"
                    leftIcon={<Share2 size={18} color={c.ink} />}
                    block
                    onPress={() =>
                      void exportWork(task.title, sectionsToText(writtenSections(task.draftSections)))
                    }
                  />
                </>
              ) : null}
              {/* Calling this "Done" while the task is still open was the whole
                  problem: it read as completion and only navigated away. */}
              <Button
                title={
                  phase === 'declined' || (phase === 'done' && task.status === 'todo')
                    ? 'Leave it for now'
                    : 'Done'
                }
                variant={
                  phase === 'declined' || (phase === 'done' && task.status === 'todo')
                    ? 'ghost'
                    : 'primary'
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

      {/* Off-screen, but mounted: captureRef can only snapshot a live view. */}
      {action.method === 'photo' ? (
        <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
          <PhotoCanvas
            ref={photoRef}
            photoUri={task.photoUri}
            message={draft}
            fromName={senderName}
          />
        </View>
      ) : null}
      {action.method === 'card' ? (
        <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
          <CardCanvas
            ref={cardRef}
            templateId={task.cardTemplateId}
            toName={task.contactName}
            message={draft}
            fromName={senderName}
          />
        </View>
      ) : null}
    </Screen>
  );
}
