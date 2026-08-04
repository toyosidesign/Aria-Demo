import {
  CalendarDays,
  Check,
  MessageCircleQuestion,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { formatFull, formatTime } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { pickPhoneContact, phoneContactsAvailable } from '@/lib/phone-contacts';
import { templatesFor } from '@/lib/cards';
import { TONES, flowTitle, type FlowDraft, type FlowStep } from '@/lib/task-flow';
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

/** A tappable pill. 44pt minimum, like every other tap target in the app. */
function Pill({
  label,
  onPress,
  active,
  icon,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      className={`min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 active:opacity-70 ${
        active ? 'border-accent bg-accent' : 'border-border bg-surface'
      }`}>
      {icon}
      <Text variant="small" tone={active ? 'onAccent' : 'muted'} className="font-strong">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One of a small set of answers, sized to be read rather than hunted for.
 *
 * Yes/no was two small pills floating in a box, which looked like tags rather
 * than a decision. These split the width, so the choice is the widest thing on
 * screen at the moment it is being asked.
 */
function Choice({
  label,
  onPress,
  primary,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Work is in flight. Shows a spinner and refuses further taps. */
  busy?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      disabled={busy}
      onPress={() => {
        if (busy) return;
        hapticSelect();
        onPress();
      }}
      className={`min-h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 ${
        busy ? 'opacity-60' : 'active:opacity-70'
      } ${primary ? 'border-accent bg-accent' : 'border-border bg-surface'}`}>
      {busy ? <ActivityIndicator size="small" color={primary ? c.accentInk : c.muted} /> : null}
      <Text variant="small" tone={primary ? 'onAccent' : 'muted'} className="font-strong">
        {label}
      </Text>
    </Pressable>
  );
}

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
}) {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const contacts = useAriaStore((s) => s.contacts);
  const [date, setDate] = useState(draft.date ?? demoDate);
  const [time, setTime] = useState<string | null>(draft.time ?? null);

  /*
   * Attached to the question, not floating below it.
   *
   * The controls used to sit in their own bordered card docked above the
   * composer, while Aria's question stayed up in the transcript — so the two
   * halves of a single exchange were separated by the whole conversation and
   * read as unrelated furniture. This tucks in directly under the bubble it
   * belongs to: same left inset, square top-left corner continuing the bubble's
   * tail, and the accent tint carried through so the pair reads as one turn.
   */
  const shell =
    'ml-10 -mt-1 gap-3 rounded-2xl rounded-tl-sm border border-accent/25 bg-accent-soft/60 p-3.5';

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
              // Name and contact in one move, so `contact` never has to ask.
              onAnswer(
                {
                  who: picked.name,
                  contactPhone: picked.phone,
                  contactEmail: picked.email,
                  answered: { ...draft.answered, contact: true },
                },
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
    const saved = contacts.find((ct) => ct.name === draft.who);
    return (
      <View className={shell}>
        <View className="flex-row flex-wrap gap-2">
          {saved?.phone || saved?.email ? (
            <Pill
              label={`Use ${saved.phone ?? saved.email}`}
              icon={<Check size={14} color={c.muted} />}
              onPress={() =>
                onAnswer({ contactPhone: saved.phone, contactEmail: saved.email }, 'contact')
              }
            />
          ) : null}
          {phoneContactsAvailable() ? (
            <Pill
              label="Pick from contacts"
              icon={<UserPlus size={14} color={c.muted} />}
              onPress={async () => {
                const picked = await pickPhoneContact();
                // A cancelled picker is not an answer — leave the step open
                // rather than recording "no contact" on their behalf.
                if (!picked) return;
                onAnswer(
                  {
                    who: picked.name || draft.who,
                    contactPhone: picked.phone,
                    contactEmail: picked.email,
                  },
                  'contact',
                );
              }}
            />
          ) : null}
          <Pill label="Skip" onPress={() => onAnswer({}, 'contact')} />
        </View>
      </View>
    );
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

  if (step === 'card') {
    // Three answers, not a yes/no. "No card" used to swallow "but I do want to
    // text them", and the flow went to preview with nothing to send.
    return (
      <View className={shell}>
        <View className="gap-2">
          <Choice label="Send a card" primary onPress={() => onAnswer({ delivery: 'card' }, 'card')} />
          <Choice label="Send a message" onPress={() => onAnswer({ delivery: 'message' }, 'card')} />
          <Choice label="Just remind me" onPress={() => onAnswer({ delivery: 'remind' }, 'card')} />
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
          {draft.who ? <Row label={`For ${draft.who}`} /> : null}
          {draft.contactPhone || draft.contactEmail ? (
            <Row label={draft.contactPhone ?? draft.contactEmail ?? ''} />
          ) : null}
          <Row label={draft.alarm ? 'Alarm on' : 'No alarm'} />
          {draft.delivery === 'card' ? (
            <Row label={`Card: ${templatesFor(draft.kind).find((t) => t.id === draft.cardTemplateId)?.name ?? 'default'}`} />
          ) : draft.delivery === 'message' ? (
            <Row label="Message" />
          ) : (
            <Row label="Reminder only" />
          )}
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
          {draft.delivery && draft.delivery !== 'remind' ? (
            <Pill label="Change message" onPress={() => onEdit('cardMessage')} />
          ) : null}
          {draft.delivery === 'card' ? (
            <Pill label="Change card" onPress={() => onEdit('cardStyle')} />
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
