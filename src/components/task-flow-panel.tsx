import {
  CalendarDays,
  Check,
  MessageCircleQuestion,
  Repeat2,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ContactField } from '@/components/contact-field';
import { Choice, PANEL_SHELL, Pill } from '@/components/flow-controls';
import { MonthCalendar } from '@/components/month-calendar';
import { PhotoField } from '@/components/photo-field';
import { TimeField } from '@/components/time-field';
import {
  BriefStep,
  CommitmentsStep,
  DefinitionGate,
  ExtractionCard,
  GuideAsk,
  GuideDirections,
  MilestonesStep,
  PlanPreview,
  ReflectCard,
  ScopeStep,
  type WorkHandlers,
} from '@/components/work-panels';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { REPEAT_LABEL, REPEAT_OPTIONS, formatFull, formatTime } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { pickPhoneContact, phoneContactsAvailable } from '@/lib/phone-contacts';
import { templatesFor } from '@/lib/cards';
import {
  EVENT_HANDLING,
  METHOD_NEEDS,
  TONES,
  contactSatisfied,
  needsContact,
  flowTitle,
  type FlowDraft,
  type FlowStep,
} from '@/lib/task-flow';
import { useAriaStore } from '@/store/aria-store';

/**
 * The answer control for whatever Aria just asked.
 *
 * One component per step rather than a free-text box for all of them, because
 * the point of doing this in chat is that it should be *easier* than the form,
 * not the same form with extra typing. A date gets a calendar, a yes/no gets
 * two buttons, a contact gets the picker.
 *
 * It renders only the current step. Earlier answers are already in the
 * transcript as Aria's acknowledgements, which is what makes this read as a
 * conversation rather than a wizard with a progress bar.
 */

export function TaskFlowPanel({
  step,
  draft,
  drafting,
  onAnswer,
  onDraftMessage,
  onExplain,
  onPlan,
  onAsk,
  onTone,
  onMessageChange,
  onAccept,
  onEdit,
  onCancel,
  work,
  guide,
  busyDates,
  fixedDays,
  onFixedDays,
}: {
  step: FlowStep;
  draft: FlowDraft;
  /** True while Aria is writing the card message. */
  drafting?: boolean;
  onAnswer: (patch: Partial<FlowDraft>, step: FlowStep) => void;
  onDraftMessage: () => void;
  /** Teach the topic, using the learner profile from onboarding. */
  onExplain: () => void;
  /** Break the work down, using the title and the approach just given. */
  onPlan: () => void;
  /** Dig into one item and keep the answer. */
  onAsk: (item: string) => void;
  onTone: (instruction: string) => void;
  /**
   * The card message is owned by the caller, not held here.
   *
   * It was local state seeded from `draft.message`, which broke drafting
   * outright: `useState` reads its initial value once, so a draft arriving from
   * the model updated the flow and never reached this box. The text simply
   * didn't appear.
   *
   * Re-syncing with an effect would have fixed the display and left a worse
   * bug behind — typed text would diverge from `draft.message`, and the tone
   * buttons send `previousDraft: flow.message`, so "Warmer" would have
   * rewritten a stale draft instead of what was on screen. One owner removes
   * both faults.
   */
  onMessageChange: (text: string) => void;
  onAccept: () => void;
  /** Re-open one answered step, so a change never leaves the chat. */
  onEdit: (step: FlowStep) => void;
  onCancel: () => void;
  /**
   * Everything the work steps need.
   *
   * Grouped rather than spread across a dozen more props: an assignment's steps
   * upload files, call the model twice and rebuild a plan, and threading each
   * of those through this signature individually would make the occasion steps
   * — which need none of it — harder to read for no benefit.
   */
  work?: Omit<WorkHandlers, 'onAnswer' | 'onEdit' | 'onAccept' | 'onCancel' | 'busy'>;
  /** Guide plumbing: pick a focus, choose a direction, ask again, close. */
  guide?: {
    onFocus: (value: string) => void;
    onChoose: (index: number) => void;
    onAgain: () => void;
    onClose: () => void;
  };
  /** Dates already spoken for between now and the deadline. */
  busyDates?: string[];
  fixedDays?: number[];
  onFixedDays?: (days: number[]) => void;
}) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const [date, setDate] = useState(draft.date ?? demoDate);
  const [time, setTime] = useState<string | null>(draft.time ?? null);

  const shell = PANEL_SHELL;

  /*
   * ── The work steps ────────────────────────────────────────────────────────
   *
   * Routed out to `work-panels.tsx` and handed one object of callbacks. This
   * panel decides *which* card, and nothing about what any of them contain —
   * the same division that keeps the occasion steps readable.
   */
  if (work && guide) {
    const handlers: WorkHandlers = {
      ...work,
      onAnswer,
      onEdit,
      onAccept,
      onCancel,
      busy: drafting,
    };
    if (step === 'brief') return <BriefStep draft={draft} on={handlers} />;
    if (step === 'extraction') return <ExtractionCard draft={draft} on={handlers} />;
    if (step === 'commitments') {
      return (
        <CommitmentsStep
          draft={draft}
          on={handlers}
          fromCalendar={busyDates ?? []}
          fixedDays={fixedDays ?? []}
          onFixedDays={onFixedDays ?? (() => {})}
        />
      );
    }
    if (step === 'definition') return <DefinitionGate draft={draft} on={handlers} />;
    if (step === 'reflect') return <ReflectCard draft={draft} on={handlers} />;
    if (step === 'scope') return <ScopeStep draft={draft} on={handlers} />;
    if (step === 'milestones') return <MilestonesStep draft={draft} on={handlers} />;
    if (step === 'planPreview') return <PlanPreview draft={draft} on={handlers} />;
    if (step === 'guideAsk') {
      return <GuideAsk draft={draft} onFocus={guide.onFocus} onClose={guide.onClose} />;
    }
    if (step === 'guideDirections') {
      return (
        <GuideDirections
          draft={draft}
          busy={drafting}
          onChoose={guide.onChoose}
          onAgain={guide.onAgain}
          onClose={guide.onClose}
        />
      );
    }
  }

  if (step === 'approach') {
    return (
      <View className={shell}>
        {/* Type the answer in the composer. This is only the way out. */}
        <Choice label="Just schedule it" onPress={() => onAnswer({}, 'approach')} />
      </View>
    );
  }

  if (step === 'plan') {
    const items = draft.checklist ?? [];
    if (!items.length) {
      return (
        <View className={shell}>
          <Choice
            label={drafting ? 'Working it out…' : 'Break it down'}
            primary
            busy={drafting}
            onPress={onPlan}
          />
        </View>
      );
    }
    return (
      <View className={shell}>
        {/* Each item is a question waiting to be asked, so each one is a
            control rather than a bullet. */}
        {items.map((item) => {
          const answered = draft.notes?.some((n) => n.title === item);
          return (
            <Pressable
              key={item}
              disabled={drafting}
              onPress={() => {
                hapticSelect();
                onAsk(item);
              }}
              className={`min-h-[44px] flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                answered ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
              } ${drafting ? 'opacity-60' : 'active:opacity-70'}`}>
              {answered ? (
                <Check size={14} color={c.accent} />
              ) : (
                <MessageCircleQuestion size={14} color={c.muted} />
              )}
              <Text variant="small" tone={answered ? 'accent' : 'muted'} className="flex-1">
                {item}
              </Text>
            </Pressable>
          );
        })}
        {draft.notes?.length ? (
          <View className="gap-2">
            {draft.notes.map((n) => (
              <View key={n.title} className="rounded-xl border border-border bg-bg p-3">
                <Text variant="label" tone="muted">
                  {n.title}
                </Text>
                <Text variant="small" tone="muted" className="mt-1">
                  {n.content}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          <Choice
            label={drafting ? 'Thinking…' : 'Done, carry on'}
            primary
            busy={drafting}
            onPress={() => onAnswer({}, 'plan')}
          />
        </View>
      </View>
    );
  }

  if (step === 'who') {
    /*
     * The contact list first, and no suggested names.
     *
     * This used to lead with pills of saved contacts, which guessed at the
     * answer and made picking the *real* contact the fallback option. It also
     * meant a name could be captured with no phone or email behind it, so the
     * flow then had to ask for the contact separately — two questions for one
     * fact. Choosing from the phone's own list answers both at once.
     */
    return (
      <View className={shell}>
        {phoneContactsAvailable() ? (
          <Button
            title="Choose from contacts"
            block
            leftIcon={<UserPlus size={17} color={c.accentInk} />}
            onPress={async () => {
              const picked = await pickPhoneContact();
              // A cancelled picker is not an answer. Leave the step open.
              if (!picked) return;
              /*
               * Their details come too, but this does not answer `contact`.
               *
               * It used to mark that step done, which was right when a contact
               * was a nice-to-have. Now the method decides what is actually
               * needed — a text with no number is not a text — so the contact
               * step still runs and confirms what was picked, collapsed to a
               * summary because the fields it would show are already filled.
               */
              onAnswer(
                { who: picked.name, contactPhone: picked.phone, contactEmail: picked.email },
                'who',
              );
            }}
          />
        ) : null}
        {/* Or just type the name in the composer. */}
      </View>
    );
  }

  if (step === 'contact') {
    return <ContactStep shell={shell} draft={draft} onAnswer={onAnswer} />;
  }

  if (step === 'date') {
    return (
      <View className={shell}>
        <MonthCalendar value={date} onSelect={setDate} />
        <Button title={`Use ${formatFull(date)}`} block onPress={() => onAnswer({ date }, 'date')} />
      </View>
    );
  }

  if (step === 'time') {
    return (
      <View className={shell}>
        <TimeField value={time} onChange={setTime} />
        <View className="flex-row gap-2">
          <Button
            title={time ? `Use ${formatTime(time)}` : 'Set a time'}
            className="flex-1"
            disabled={!time}
            onPress={() => onAnswer({ time }, 'time')}
          />
          <Button title="No time" variant="secondary" onPress={() => onAnswer({ time: null }, 'time')} />
        </View>
      </View>
    );
  }

  if (step === 'priority') {
    const levels: { value: 'low' | 'medium' | 'high'; label: string; dot: string }[] = [
      { value: 'low', label: 'Low', dot: 'bg-priority-low' },
      { value: 'medium', label: 'Medium', dot: 'bg-priority-medium' },
      { value: 'high', label: 'High', dot: 'bg-priority-high' },
    ];
    return (
      <View className={shell}>
        <View className="flex-row gap-2">
          {levels.map((l) => (
            <Pressable
              key={l.value}
              onPress={() => {
                hapticSelect();
                onAnswer({ priority: l.value }, 'priority');
              }}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 active:opacity-70 ${
                draft.priority === l.value ? 'border-accent bg-accent' : 'border-border bg-surface'
              }`}>
              <View className={`h-2 w-2 rounded-full ${l.dot}`} />
              <Text
                variant="small"
                tone={draft.priority === l.value ? 'onAccent' : 'muted'}
                className="font-strong">
                {l.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (step === 'repeat') {
    /*
     * The two answers people actually give, and the rest behind them.
     *
     * "Every year" is the whole question for a birthday and the common answer
     * for an event, so it is a button rather than the fifth row of a list. The
     * other intervals are the same set the create form offers — one vocabulary
     * for repeats across the app, from `REPEAT_OPTIONS`.
     */
    const others = REPEAT_OPTIONS.filter((o) => o.value !== 'yearly');
    return (
      <View className={shell}>
        <View className="flex-row gap-2">
          <Choice
            label="Every year"
            primary
            onPress={() => onAnswer({ repeat: 'yearly' }, 'repeat')}
          />
          <Choice label="Just the once" onPress={() => onAnswer({ repeat: undefined }, 'repeat')} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          {others.map((o) => (
            <Pill
              key={o.value}
              label={o.label}
              icon={<Repeat2 size={14} color={c.muted} />}
              active={draft.repeat === o.value}
              onPress={() => onAnswer({ repeat: o.value }, 'repeat')}
            />
          ))}
        </View>
      </View>
    );
  }

  if (step === 'method') {
    /*
     * The six answers to "How should Aria handle it?", in HANDOFF §4's order.
     *
     * This replaced a three-way card / message / reminder question that made
     * Aria guess the channel from whichever detail the contact happened to
     * carry. Each of these decides what gets asked next — which is why they are
     * whole rows rather than pills: it is the most consequential tap in the
     * flow.
     */
    return (
      <View className={shell}>
        <View className="gap-2">
          {EVENT_HANDLING.map((m) => (
            <Choice
              key={m.value}
              label={m.label}
              primary={draft.handling === m.value}
              onPress={() => onAnswer({ handling: m.value }, 'method')}
            />
          ))}
        </View>
      </View>
    );
  }

  if (step === 'photo') {
    return <PhotoStep shell={shell} draft={draft} onAnswer={onAnswer} />;
  }

  if (step === 'alarm') {
    return (
      <View className={shell}>
        <View className="flex-row gap-2">
          <Choice label="Yes" primary onPress={() => onAnswer({ alarm: true }, 'alarm')} />
          <Choice label="No" onPress={() => onAnswer({ alarm: false }, 'alarm')} />
        </View>
      </View>
    );
  }

  if (step === 'cardStyle') {
    /*
     * Cards shown as cards.
     *
     * A list of names — Balloons, Confetti, Make a wish — asks the student to
     * imagine each one. The templates already carry their own art and tint, so
     * the picker can just draw them and the choice becomes a glance.
     */
    const templates = templatesFor(draft.kind);
    return (
      <View className={shell}>
        <View className="flex-row flex-wrap gap-2">
          {templates.slice(0, 6).map((t) => {
            const on = draft.cardTemplateId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  hapticSelect();
                  onAnswer({ cardTemplateId: t.id }, 'cardStyle');
                }}
                style={{ borderColor: on ? t.tint : c.border, backgroundColor: `${t.tint}1A` }}
                className="min-h-[44px] w-[31%] items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 active:opacity-70">
                <Text variant="small">{t.art}</Text>
                <Text variant="caption" tone="muted" className="font-strong">
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (step === 'cardMessage') {
    const message = draft.message ?? '';
    return (
      <View className={shell}>
        <TextInput
          value={message}
          onChangeText={onMessageChange}
          placeholder="Write it yourself, or let Aria draft it…"
          placeholderTextColor={c.faint}
          multiline
          className="min-h-[88px] rounded-2xl border border-border bg-bg px-4 py-3"
          style={{ color: c.ink }}
        />
        {/* Tones only once there is something to change. Offering "warmer" on an
            empty box asks the student to imagine the thing being adjusted. */}
        {message.trim() ? (
          <View className="flex-row flex-wrap gap-2">
            {TONES.map((t) => (
              <Pill key={t.label} label={t.label} onPress={() => onTone(t.instruction)} />
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          {/* The label follows the state. Offering "Draft it for me" over an
              existing draft reads as though the first one didn't take. */}
          <Button
            title={message.trim() ? 'Rewrite' : 'Draft it for me'}
            variant="secondary"
            loading={drafting}
            leftIcon={<Sparkles size={16} color={c.accent} />}
            onPress={onDraftMessage}
            className="flex-1"
          />
          <Button
            title="Done"
            disabled={!message.trim()}
            onPress={() => onAnswer({ message: message.trim() }, 'cardMessage')}
          />
        </View>
      </View>
    );
  }

  if (step === 'preview') {
    return (
      <View className={shell}>
        <Text variant="label" tone="muted">
          Preview
        </Text>
        <Text className="font-strong">{flowTitle(draft)}</Text>
        <View className="gap-1">
          <Row icon={<CalendarDays size={14} color={c.muted} />} label={draft.date ? formatFull(draft.date) : 'Not set'} />
          {draft.time ? <Row label={formatTime(draft.time)} /> : null}
          {draft.repeat ? <Row label={REPEAT_LABEL[draft.repeat]} /> : null}
          {draft.who ? <Row label={`For ${draft.who}`} /> : null}
          {/* Whichever detail the chosen method will actually use: a text goes
              to the number, an email to the address. Showing both would leave
              you guessing which one Aria picked. */}
          {contactDetailShown(draft) ? <Row label={contactDetailShown(draft)!} /> : null}
          {draft.handling ? (
            <Row
              label={
                draft.handling === 'card'
                  ? `Card: ${templatesFor(draft.kind).find((t) => t.id === draft.cardTemplateId)?.name ?? 'default'}`
                  : (EVENT_HANDLING.find((m) => m.value === draft.handling)?.label ?? '')
              }
            />
          ) : (
            <Row label={draft.alarm ? 'Alarm on' : 'No alarm'} />
          )}
          {/* Not sending, and not able to: the flow asked for a text and the
              number never arrived, so the task saves as a reminder. Better said
              here than discovered on Today. */}
          {draft.handling && !contactSatisfied(draft) ? (
            <Row label="No contact for that — saving it as a reminder" />
          ) : null}
        </View>
        {draft.message ? (
          <View className="rounded-xl border border-border bg-bg p-3">
            <Text variant="small" tone="muted">
              {draft.message}
            </Text>
          </View>
        ) : null}
        {/* Named changes rather than one vague "Edit". You already know which
            bit is wrong, and this reopens exactly that question. */}
        <View className="flex-row flex-wrap gap-2">
          <Pill label="Change date" onPress={() => onEdit('date')} />
          <Pill label="Change time" onPress={() => onEdit('time')} />
          {draft.handling ? <Pill label="Change how" onPress={() => onEdit('method')} /> : null}
          {draft.handling && METHOD_NEEDS[draft.handling].message ? (
            <Pill label="Change message" onPress={() => onEdit('cardMessage')} />
          ) : null}
          {draft.handling === 'card' ? (
            <Pill label="Change card" onPress={() => onEdit('cardStyle')} />
          ) : null}
          {draft.handling && needsContact(draft.handling) ? (
            <Pill label="Change who" onPress={() => onEdit('contact')} />
          ) : null}
        </View>
        <View className="flex-row gap-2">
          <Button title="Save it" className="flex-1" onPress={onAccept} />
          <Button title="Cancel" variant="secondary" leftIcon={<X size={16} color={c.muted} />} onPress={onCancel} />
        </View>
      </View>
    );
  }

  return null;
}

/**
 * Who it's going to, asking only for what this method cannot do without.
 *
 * The same `ContactField` the create form uses, for the rule in HANDOFF §4:
 * choose someone from your contacts and the fields it filled disappear, leaving
 * the person and a way to clear them. A field reappearing after that means the
 * contact genuinely lacks a detail this method needs — a text to someone with
 * no number — and the field says which.
 *
 * Local state, committed on the button. Editing straight into the draft would
 * put a half-typed number through `nextStep` on every keystroke.
 */
function ContactStep({
  shell,
  draft,
  onAnswer,
}: {
  shell: string;
  draft: FlowDraft;
  onAnswer: (patch: Partial<FlowDraft>, step: FlowStep) => void;
}) {
  const saved = useAriaStore((s) => s.contacts).find((ct) => ct.name === draft.who);
  const [name, setName] = useState(draft.who ?? '');
  // Anything Aria already knows about them, whether it came from the picker a
  // question ago or from a contact saved in the app.
  const [email, setEmail] = useState(draft.contactEmail ?? saved?.email ?? '');
  const [phone, setPhone] = useState(draft.contactPhone ?? saved?.phone ?? '');

  const needs = draft.handling ? METHOD_NEEDS[draft.handling] : METHOD_NEEDS.remind;
  const filled: FlowDraft = {
    ...draft,
    who: name,
    contactEmail: email,
    contactPhone: phone,
  };
  const ready = contactSatisfied(filled);

  return (
    <View className={shell}>
      <ContactField
        label={needs.phone === 'required' && needs.name === 'none' ? 'Their number' : "Who's it for?"}
        name={name}
        onName={setName}
        email={email}
        onEmail={setEmail}
        phone={phone}
        onPhone={setPhone}
        requireEmail={needs.email === 'required'}
        needsPhone={needs.phone === 'required'}
        phoneOnly={needs.name === 'none'}
        // Someone was picked at the "who" question, so open on their summary
        // rather than on the boxes that picking them already filled in.
        startPicked={Boolean(draft.who && (draft.contactPhone || draft.contactEmail))}
      />
      <Button
        title={ready ? 'Use these details' : 'Still need one more detail'}
        block
        disabled={!ready}
        onPress={() =>
          onAnswer({ who: name.trim(), contactEmail: email.trim(), contactPhone: phone.trim() }, 'contact')
        }
      />
      {/*
        A way out that isn't a dead end.

        Required means required — there is no texting someone with no number —
        so without this, a student who doesn't have the detail is stuck on a
        question they cannot answer, in a flow with no back button. This is the
        sixth answer to "How should Aria handle it?", offered where it is needed.
      */}
      <Choice
        label="Just remind me instead"
        onPress={() => onAnswer({ handling: 'remind' }, 'contact')}
      />
    </View>
  );
}

/** The picture that goes out with it, chosen before anything is written. */
function PhotoStep({
  shell,
  draft,
  onAnswer,
}: {
  shell: string;
  draft: FlowDraft;
  onAnswer: (patch: Partial<FlowDraft>, step: FlowStep) => void;
}) {
  const [uri, setUri] = useState(draft.photoUri);
  return (
    <View className={shell}>
      <PhotoField value={uri} onChange={setUri} />
      <Button
        title="Use this picture"
        block
        disabled={!uri}
        onPress={() => onAnswer({ photoUri: uri }, 'photo')}
      />
    </View>
  );
}

/**
 * The one contact detail the preview should show.
 *
 * Whichever the chosen method will actually use, because that is the thing
 * worth checking before saving. Showing both an address and a number leaves you
 * working out which of them Aria is about to send to.
 */
function contactDetailShown(d: FlowDraft): string | null {
  if (d.handling === 'email') return d.contactEmail?.trim() || null;
  if (d.handling === 'sms' || d.handling === 'call') return d.contactPhone?.trim() || null;
  return d.contactPhone?.trim() || d.contactEmail?.trim() || null;
}

function Row({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      {icon}
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}
