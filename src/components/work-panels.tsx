import {
  CalendarDays,
  Check,
  Compass,
  FileUp,
  Image as ImageIcon,
  Minus,
  Plus,
  Sparkles,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Choice, InfoChip, PANEL_SHELL, Pill } from '@/components/flow-controls';
import { MonthCalendar } from '@/components/month-calendar';
import { SourceList } from '@/components/source-list';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  BRIEF_SLOTS,
  CONFIDENCE_LABEL,
  GAP_ACTIONS,
  briefGaps,
  hasSlot,
  type BriefSlot,
  type Confidence,
} from '@/lib/brief';
import { useColors } from '@/lib/colors';
import { formatFull } from '@/lib/dates';
import { NARROWING } from '@/lib/guide';
import { hapticSelect } from '@/lib/haptics';
import {
  DEFAULT_SUBMIT_TIME,
  SUBMIT_OPTIONS,
  guideModeFor,
  workDeadline,
  type FlowDraft,
  type FlowStep,
} from '@/lib/task-flow';

/**
 * The steps that only an assignment or a project has.
 *
 * Kept out of `task-flow-panel.tsx` because they are a different size of thing:
 * an occasion's step is a row of buttons, and these are cards you read. The
 * panel routes to them and knows nothing else about them.
 */

export interface WorkHandlers {
  /** Record an answer and move on. Same signature the rest of the panel uses. */
  onAnswer: (patch: Partial<FlowDraft>, step: FlowStep) => void;
  /** Open the file picker, the camera, or fall back to filling it in. */
  onUpload: (source: 'file' | 'photo') => void;
  /** Do something about a fact the brief did not contain. */
  onGap: (slot: BriefSlot, action: (typeof GAP_ACTIONS)[number]['action']) => void;
  /** Build (or rebuild) the plan from what is known. */
  onBuildPlan: () => void;
  /** Ask Aria to say the project's intent back. */
  onReflect: () => void;
  /** Open the Guide from wherever we are. */
  onGuide: (from: FlowStep) => void;
  /** Re-open an answered step, for a card that turned out to be wrong. */
  onEdit: (step: FlowStep) => void;
  /** Save it. */
  onAccept: () => void;
  onCancel: () => void;
  /** True while a model call is in flight. */
  busy?: boolean;
}

// ── 1 · Create ───────────────────────────────────────────────────────────────

/**
 * Upload is the primary button, and it is a whole-width one.
 *
 * The brief already exists. Everything on this screen after an upload was read
 * out of it rather than typed, so anything that makes uploading look like the
 * advanced option, a small link, a row of equals, costs the student the
 * entire feature. Typing it in is still there, one line down, for the
 * assignment that arrived as a sentence in a lecture.
 */
export function BriefStep({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const c = useColors();
  const project = draft.kind === 'project';
  return (
    <View className={PANEL_SHELL}>
      <Button
        title={project ? 'Upload a brief' : 'Upload the brief'}
        block
        leftIcon={<FileUp size={17} color={c.accentInk} />}
        onPress={() => on.onUpload('file')}
      />
      <View className="flex-row flex-wrap gap-2">
        <Pill
          label="Photo of it"
          icon={<ImageIcon size={14} color={c.muted} />}
          onPress={() => on.onUpload('photo')}
        />
        <Pill
          label={project ? "I'll describe it" : "I'll fill it in"}
          onPress={() => on.onAnswer({ brief: { source: 'manual' } }, 'brief')}
        />
      </View>
      <Text variant="caption" tone="faint">
        {project
          ? 'Or just type what it is below. PDF, image or text if you have one.'
          : 'Or paste the brief below. PDF, image or text, I read the criteria too.'}
      </Text>
    </View>
  );
}

// ── 2 · Extraction ───────────────────────────────────────────────────────────

const CONFIDENCE_TONE: Record<Confidence, 'muted' | 'accent' | 'danger'> = {
  high: 'accent',
  medium: 'muted',
  low: 'danger',
};

/**
 * What the brief says, with Aria's certainty attached to each line.
 *
 * A gap is not shown as an empty value. It is shown as three things the student
 * can do about it, because "weighting: , " is a shrug and "Ask tutor" is a way
 * out. The three are deliberately different in kind: ask the person who knows,
 * look somewhere else it might be written down, or tell Aria yourself.
 */
export function ExtractionCard({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const c = useColors();
  const facts = draft.facts;
  const gaps = briefGaps(facts);

  return (
    <View className={PANEL_SHELL}>
      {BRIEF_SLOTS.map(({ slot, label }) => {
        const present = hasSlot(facts, slot);
        return (
          <View key={slot} className="gap-1.5 border-b border-border/50 pb-2.5 last:border-b-0">
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="label" tone="muted">
                {label}
              </Text>
              {present ? (
                <InfoChip
                  label={CONFIDENCE_LABEL[confidenceOf(draft, slot)]}
                  tone={CONFIDENCE_TONE[confidenceOf(draft, slot)]}
                />
              ) : null}
            </View>

            {present ? (
              <Text variant="small">{valueOf(draft, slot)}</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2 pt-0.5">
                {GAP_ACTIONS.map((g) => (
                  <Pill key={g.action} label={g.label} onPress={() => on.onGap(slot, g.action)} />
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* One button, and it says what happens next rather than "Continue" , 
          the plan is the thing they are actually here for. */}
      <Button
        title={gaps.length ? 'Carry on without those' : 'Looks right'}
        block
        onPress={() => on.onAnswer({}, 'extraction')}
      />
    </View>
  );
}

function confidenceOf(d: FlowDraft, slot: BriefSlot): Confidence {
  if (slot === 'criteria') return d.facts?.criteria?.confidence ?? 'low';
  return d.facts?.[slot]?.confidence ?? 'low';
}

function valueOf(d: FlowDraft, slot: BriefSlot): string {
  if (slot === 'criteria') {
    return (d.facts?.criteria?.items ?? [])
      .map((i) => (i.weight ? `${i.label} (${i.weight}%)` : i.label))
      .join(' · ');
  }
  return d.facts?.[slot]?.value ?? '';
}

// ── 3 · Commitments ──────────────────────────────────────────────────────────

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * What the week already holds, read rather than asked for.
 *
 * The calendar is the first answer because it is already true, anything Aria
 * has to ask for is a thing the student has to remember, and they are here to
 * stop holding it all in their head. The fixed hours question is asked once and
 * kept (`settings.fixedDays`), because "I have lectures on Mondays" does not
 * change between assignments.
 */
export function CommitmentsStep({
  draft,
  on,
  fromCalendar,
  fixedDays,
  onFixedDays,
}: {
  draft: FlowDraft;
  on: WorkHandlers;
  /** Dates between now and the deadline that already have something on them. */
  fromCalendar: string[];
  fixedDays: number[];
  onFixedDays: (days: number[]) => void;
}) {
  const [days, setDays] = useState<number[]>(fixedDays);

  function toggle(day: number) {
    hapticSelect();
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  return (
    <View className={PANEL_SHELL}>
      <Text variant="small" tone="muted">
        {fromCalendar.length
          ? `You've got something on ${fromCalendar.length} ${fromCalendar.length === 1 ? 'day' : 'days'} between now and then. I'll work around ${fromCalendar.length === 1 ? 'it' : 'them'}.`
          : "Your calendar is clear between now and then, so I'll spread this out evenly."}
      </Text>

      <Text variant="label" tone="muted">
        Days that are always spoken for
      </Text>
      <View className="flex-row gap-1.5">
        {WEEKDAYS.map((label, i) => {
          const on_ = days.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              className={`h-11 flex-1 items-center justify-center rounded-xl border active:opacity-70 ${
                on_ ? 'border-accent bg-accent' : 'border-border bg-surface'
              }`}>
              <Text variant="small" tone={on_ ? 'onAccent' : 'muted'} className="font-strong">
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="faint">
        Lectures, shifts, anything weekly. I only ask this once.
      </Text>

      <Button
        title="That's my week"
        block
        onPress={() => {
          onFixedDays(days);
          on.onAnswer(
            { busyDates: fromCalendar, fixedDays: days },
            'commitments',
          );
        }}
      />
    </View>
  );
}

// ── 4 · The plan ─────────────────────────────────────────────────────────────

/**
 * The plan, and the run-up to the deadline drawn as part of it.
 *
 * Two things are deliberately visible rather than implied. The buffer is a row,
 * because reserved time that nobody can see is time that gets scheduled over.
 * And a struck step stays on screen with a line through it, because "I'm not
 * doing that" is a decision worth being able to reverse, a plan that silently
 * loses rows when tapped is one nobody taps.
 */
export function PlanPreview({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const c = useColors();
  const steps = draft.plan ?? [];
  const project = draft.kind === 'project';

  if (!steps.length) {
    return (
      <View className={PANEL_SHELL}>
        <Choice
          label={on.busy ? 'Working it out…' : 'Build the plan'}
          primary
          busy={on.busy}
          onPress={on.onBuildPlan}
        />
        <GuideButton onPress={() => on.onGuide('planPreview')} label="Not sure where to start?" />
      </View>
    );
  }

  const tight = steps.length > 1 && steps.every((s) => s.due === steps[0].due);

  return (
    <View className={PANEL_SHELL}>
      {tight ? (
        <View className="rounded-xl border border-danger/30 bg-danger/10 p-2.5">
          <Text variant="caption" tone="danger">
            There isn&apos;t room for this before the deadline. Strike something, or move the date.
          </Text>
        </View>
      ) : null}

      {steps.map((s) => (
        <Pressable
          key={`${s.title}-${s.due}`}
          disabled={s.buffer}
          onPress={() => {
            hapticSelect();
            on.onAnswer(
              { plan: steps.map((x) => (x.title === s.title ? { ...x, struck: !x.struck } : x)) },
              'planPreview',
            );
          }}
          className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
            s.buffer ? 'border-accent/40 bg-accent-soft' : 'border-border bg-surface active:opacity-70'
          }`}>
          <View className="w-[70px]">
            <Text variant="caption" tone={s.buffer ? 'accent' : 'muted'} className="font-strong">
              {shortDate(s.due)}
            </Text>
          </View>
          <Text
            variant="small"
            tone={s.struck ? 'faint' : s.buffer ? 'accent' : 'default'}
            className={`flex-1 ${s.struck ? 'line-through' : ''}`}>
            {s.title}
          </Text>
          {s.buffer ? null : s.struck ? (
            <Plus size={14} color={c.muted} />
          ) : (
            <Minus size={14} color={c.muted} />
          )}
        </Pressable>
      ))}

      <Text variant="caption" tone="faint">
        Tap anything to strike it out. {project ? 'Milestones keep their forcing functions.' : 'Dates work back from the deadline.'}
      </Text>

      <GuideButton onPress={() => on.onGuide('planPreview')} label="Not sure where to start?" />

      <View className="flex-row gap-2">
        <Button title="Accept" className="flex-1" onPress={on.onAccept} />
        <Button
          title="Rebuild"
          variant="secondary"
          loading={on.busy}
          leftIcon={<Sparkles size={16} color={c.accent} />}
          onPress={on.onBuildPlan}
        />
      </View>
    </View>
  );
}

function shortDate(iso: string): string {
  // "Mon 14 Sep" is too wide for a 70pt column; the day and month are what the
  // eye is scanning for anyway.
  return formatFull(iso).replace(/^[A-Za-z]+,?\s*/, '').replace(/\s\d{4}$/, '');
}

// ── Project: the gate ────────────────────────────────────────────────────────

/**
 * The definition-of-done gate.
 *
 * Nothing else renders until this is answered, and that is the feature. The
 * second button is not a skip: saying you cannot state it yet is a real answer
 * that makes working it out the first task, which is what was actually true
 * all along.
 */
export function DefinitionGate({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  return (
    <View className={PANEL_SHELL}>
      <Text variant="caption" tone="muted">
        One sentence. &ldquo;Done when the three pages are live and someone outside the team can use
        them without asking me anything.&rdquo;
      </Text>
      <GuideButton onPress={() => on.onGuide('definition')} label="Help me work it out" />
      <Choice
        label="I can't say yet"
        onPress={() => on.onAnswer({ definitionDeferred: true, definition: undefined }, 'definition')}
      />
    </View>
  );
}

/** Aria's reading of the intent, said back, with how sure it is. */
export function ReflectCard({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const reflect = draft.reflect;
  if (!reflect) {
    return (
      <View className={PANEL_SHELL}>
        <Choice
          label={on.busy ? 'Reading it back…' : 'Say it back to me'}
          primary
          busy={on.busy}
          onPress={on.onReflect}
        />
      </View>
    );
  }
  return (
    <View className={PANEL_SHELL}>
      <View className="rounded-xl border border-border bg-bg p-3">
        <Text variant="small">{reflect.text}</Text>
      </View>
      {/* Labelled, not hidden. A reading built from one line and a title is a
          guess, and saying so is what makes the corrections happen here rather
          than in week three. */}
      <View className="flex-row items-center gap-2">
        <InfoChip label={CONFIDENCE_LABEL[reflect.confidence]} tone={CONFIDENCE_TONE[reflect.confidence]} />
        <Text variant="caption" tone="faint">
          from what you&apos;ve told me so far
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Choice label="That's it" primary onPress={() => on.onAnswer({}, 'reflect')} />
        {/* Wrong reading, so go back to the sentence it was read from rather
            than asking them to correct Aria's paraphrase of their own project. */}
        <Choice label="Not quite" onPress={() => on.onEdit('definition')} />
      </View>
    </View>
  );
}

// ── Project: scope ───────────────────────────────────────────────────────────

/**
 * In and out, and the out-list is the one that matters.
 *
 * Everybody can list what they are doing. The list people actually return to is
 * the one saying what they decided not to do, three weeks later when it starts
 * looking necessary again, so it is collected here, kept on the task, and
 * written into the document rather than left in a conversation.
 */
export function ScopeStep({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const [inList, setIn] = useState<string[]>(draft.scopeIn ?? []);
  const [outList, setOut] = useState<string[]>(draft.scopeOut ?? []);

  return (
    <View className={PANEL_SHELL}>
      <ScopeList label="In" items={inList} onChange={setIn} placeholder="What this includes" />
      <ScopeList
        label="Not doing"
        items={outList}
        onChange={setOut}
        placeholder="What you're deliberately leaving out"
      />
      <Button
        title="That's the shape of it"
        block
        onPress={() => on.onAnswer({ scopeIn: inList, scopeOut: outList }, 'scope')}
      />
    </View>
  );
}

function ScopeList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const c = useColors();
  const [text, setText] = useState('');

  function add() {
    const value = text.trim();
    if (!value) return;
    hapticSelect();
    onChange([...items, value]);
    setText('');
  }

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {items.map((item, i) => (
        <View key={`${item}-${i}`} className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Text variant="small" className="flex-1">
            {item}
          </Text>
          <Pressable
            onPress={() => onChange(items.filter((_, x) => x !== i))}
            hitSlop={8}
            accessibilityLabel={`Remove ${item}`}>
            <X size={14} color={c.muted} />
          </Pressable>
        </View>
      ))}
      <View className="flex-row items-center gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.faint}
          onSubmitEditing={add}
          returnKeyType="done"
          className="min-h-[44px] flex-1 rounded-xl border border-border bg-bg px-3 py-2.5"
          style={{ color: c.ink }}
        />
        <Pressable
          onPress={add}
          className="h-11 w-11 items-center justify-center rounded-xl border border-accent bg-accent-soft active:opacity-70">
          <Plus size={18} color={c.accent} />
        </Pressable>
      </View>
    </View>
  );
}

// ── Project: milestones ──────────────────────────────────────────────────────

/**
 * A milestone with nothing forcing it is a wish.
 *
 * "Finish the draft by the 14th" moves. "Send the draft to Sam on the 14th"
 * does not, because someone is expecting it. So every milestone gets a field
 * for the thing that makes it happen, and one left empty is flagged with an
 * offer rather than accepted quietly, a null here is the single best predictor
 * of the date slipping.
 */
export function MilestonesStep({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const c = useColors();
  const [items, setItems] = useState(draft.milestones ?? []);
  const [title, setTitle] = useState('');
  const [forcing, setForcing] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  function add() {
    const value = title.trim();
    if (!value) return;
    hapticSelect();
    setItems([...items, { title: value, due: due ?? undefined, forcing: forcing.trim() || undefined }]);
    setTitle('');
    setForcing('');
    setDue(null);
    setPicking(false);
  }

  return (
    <View className={PANEL_SHELL}>
      {items.map((m, i) => (
        <View key={`${m.title}-${i}`} className="gap-1 rounded-xl border border-border bg-surface p-3">
          <View className="flex-row items-center gap-2">
            <Text variant="small" className="flex-1 font-strong">
              {m.title}
            </Text>
            {m.due ? <InfoChip label={shortDate(m.due)} /> : null}
            <Pressable
              onPress={() => setItems(items.filter((_, x) => x !== i))}
              hitSlop={8}
              accessibilityLabel={`Remove ${m.title}`}>
              <X size={14} color={c.muted} />
            </Pressable>
          </View>
          {m.forcing ? (
            <Text variant="caption" tone="muted">
              Forced by: {m.forcing}
            </Text>
          ) : (
            /* The offer, made where the null is rather than in a summary at the
               end, this is the moment they can still answer it. */
            <View className="flex-row items-center gap-2 pt-1">
              <Text variant="caption" tone="danger" className="flex-1">
                Nothing forces this one.
              </Text>
              <Pill
                label="Add one"
                onPress={() => {
                  setTitle(m.title);
                  setDue(m.due ?? null);
                  setItems(items.filter((_, x) => x !== i));
                }}
              />
            </View>
          )}
        </View>
      ))}

      <View className="gap-2 rounded-xl border border-border bg-bg p-3">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Milestone: what's true when it's hit"
          placeholderTextColor={c.faint}
          className="min-h-[44px] rounded-xl border border-border bg-surface px-3 py-2.5"
          style={{ color: c.ink }}
        />
        <TextInput
          value={forcing}
          onChangeText={setForcing}
          placeholder="What forces it: a review, a demo, someone waiting"
          placeholderTextColor={c.faint}
          className="min-h-[44px] rounded-xl border border-border bg-surface px-3 py-2.5"
          style={{ color: c.ink }}
        />
        <Pressable
          onPress={() => setPicking((p) => !p)}
          className="min-h-[44px] flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 active:opacity-70">
          <CalendarDays size={15} color={c.muted} />
          <Text variant="small" tone={due ? 'default' : 'faint'}>
            {due ? formatFull(due) : 'When by?'}
          </Text>
        </Pressable>
        {picking ? (
          <MonthCalendar
            value={due ?? ''}
            onSelect={(date: string) => {
              setDue(date);
              setPicking(false);
            }}
          />
        ) : null}
        <Button title="Add milestone" variant="secondary" block disabled={!title.trim()} onPress={add} />
      </View>

      <GuideButton onPress={() => on.onGuide('milestones')} label="Not sure what the checkpoints are?" />

      <Button
        title={items.length ? 'These are the checkpoints' : 'No checkpoints for now'}
        block
        onPress={() => on.onAnswer({ milestones: items }, 'milestones')}
      />
    </View>
  );
}

// ── The Guide ────────────────────────────────────────────────────────────────

/**
 * One icon, one word, everywhere.
 *
 * The Guide is reachable from the plan preview, the definition gate, the
 * milestones step and an offer after two rollovers. If it were a link in one
 * place and a button in another, nobody would learn that they are the same
 * door, so this is the only way it is ever drawn, and the label varies while
 * the shape and the compass do not.
 */
export function GuideButton({ onPress, label = 'Guide' }: { onPress: () => void; label?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Guide: ${label}`}
      className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-full border border-accent bg-accent-soft px-4 py-2.5 active:opacity-70">
      <Compass size={16} color={c.accent} />
      <Text variant="small" tone="accent" className="font-strong">
        {label}
      </Text>
    </Pressable>
  );
}

/** The one narrowing question, before anything is generated. */
/**
 * Leaving the Guide, said as returning rather than as closing.
 *
 * The Guide is a detour inside a conversation that is still going: somebody is
 * halfway through setting a piece of work up, they asked for directions, and
 * now they are choosing. Labelling the way out "Close" made Aria look like it
 * was offering to end the exchange while they were still in the middle of it,
 * which was the report. Nothing is being closed. The setup carries on at the
 * question it left, so that is what the button says.
 *
 * One constant for all three exits, because a person who learns what this does
 * in one panel should not have to relearn it in the next, and three separate
 * strings is how two of them end up saying different things.
 */
const GUIDE_EXIT = 'Carry on without it';

export function GuideAsk({ draft, onFocus, onClose }: {
  draft: FlowDraft;
  onFocus: (value: string) => void;
  onClose: () => void;
}) {
  const mode = guideModeFor(draft.kind);
  return (
    <View className={PANEL_SHELL}>
      <View className="gap-2">
        {NARROWING[mode].options.map((o) => (
          <Choice key={o.value} label={o.label} onPress={() => onFocus(o.value)} />
        ))}
      </View>
      <Pressable onPress={onClose} hitSlop={8} className="self-center active:opacity-60">
        <Text variant="caption" tone="muted">
          {GUIDE_EXIT}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Three or four directions, each with its price.
 *
 * `needs` and `costs` are not decoration and are never collapsed away: a
 * direction without them is a suggestion, and with them it is a decision
 * someone can actually make.
 */
export function GuideDirections({
  draft,
  busy,
  onChoose,
  onAgain,
  onClose,
}: {
  draft: FlowDraft;
  busy?: boolean;
  onChoose: (index: number) => void;
  onAgain: () => void;
  onClose: () => void;
}) {
  const c = useColors();
  const guide = draft.guide;

  // Nothing to go on. Said plainly, with the one thing that would fix it , 
  // four generic directions would have been worse than this.
  if (guide?.needs) {
    return (
      <View className={PANEL_SHELL}>
        <Text variant="small" tone="muted">
          Add it below and ask me again.
        </Text>
        <Choice label={GUIDE_EXIT} onPress={onClose} />
      </View>
    );
  }

  const directions = guide?.directions ?? [];
  if (!directions.length) {
    return (
      <View className={PANEL_SHELL}>
        <Choice label={busy ? 'Thinking…' : 'Show me'} primary busy={busy} onPress={onAgain} />
      </View>
    );
  }

  return (
    <View className={PANEL_SHELL}>
      {directions.map((d, i) => (
        <View key={`${d.title}-${i}`} className="gap-1.5 rounded-xl border border-border bg-surface p-3">
          <Text variant="small" className="font-strong">
            {d.title}
          </Text>
          <Text variant="caption" tone="muted">
            Needs: {d.needs}
          </Text>
          <Text variant="caption" tone="muted">
            Costs: {d.costs}
          </Text>
          {d.rewardedBy ? (
            <View className="flex-row pt-0.5">
              <InfoChip label={`Marks under ${d.rewardedBy}`} tone="accent" />
            </View>
          ) : null}
          {d.questions?.length ? (
            <View className="gap-0.5 pt-1">
              {d.questions.map((q) => (
                <Text key={q} variant="caption" tone="faint">
                  · {q}
                </Text>
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              hapticSelect();
              onChoose(i);
            }}
            className="mt-1 min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-accent bg-accent-soft active:opacity-70">
            <Check size={15} color={c.accent} />
            <Text variant="small" tone="accent" className="font-strong">
              Take this one
            </Text>
          </Pressable>
        </View>
      ))}

      {/* Under the set, not against one direction: the material shaped all of
          them, and pinning it to one would claim more than is true. */}
      {guide?.sources?.length ? <SourceList sources={guide.sources} /> : null}

      {guide?.fallback ? (
        <Text variant="caption" tone="faint">
          These are the general shapes, I couldn&apos;t reach the model just now.
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Choice label={busy ? 'Thinking…' : 'None of these'} busy={busy} onPress={onAgain} />
        <Choice label={GUIDE_EXIT} onPress={onClose} />
      </View>
    </View>
  );
}

/**
 * When the finished thing gets handed in.
 *
 * Its own question, and its own reminder afterwards, because finishing the work
 * and handing it in are two jobs and the second is the one people lose. The
 * default is the day before: nothing left to do on the day itself is worth more
 * than the few extra hours, and somebody who disagrees is one tap from saying so.
 */
export function SubmitWhenStep({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState(workDeadline(draft) ?? draft.date ?? '');
  const [time, setTime] = useState<string | null>(DEFAULT_SUBMIT_TIME);

  if (custom) {
    return (
      <View className={PANEL_SHELL}>
        <MonthCalendar value={date} onSelect={setDate} />
        <TimeField value={time} onChange={setTime} />
        <Button
          title="Remind me then"
          block
          onPress={() =>
            on.onAnswer(
              { submitWhen: 'custom', submitDate: date, submitTime: time ?? DEFAULT_SUBMIT_TIME },
              'submitWhen',
            )
          }
        />
      </View>
    );
  }

  return (
    <View className={PANEL_SHELL}>
      {SUBMIT_OPTIONS.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            hapticSelect();
            if (o.value === 'custom') {
              setCustom(true);
              return;
            }
            on.onAnswer({ submitWhen: o.value, submitTime: DEFAULT_SUBMIT_TIME }, 'submitWhen');
          }}
          className="gap-0.5 rounded-xl border border-border bg-surface p-3 active:opacity-70">
          <Text variant="small" className="font-strong">
            {o.label}
          </Text>
          <Text variant="caption" tone="muted">
            {o.hint}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The offer to begin, which is the point of the whole change.
 *
 * A plan accepted and left alone is a plan nobody started. The first step is
 * named rather than described, because "make a start" is a decision about
 * effort and "Read the sources" is a decision about the next twenty minutes.
 */
export function StartNowStep({ draft, on }: { draft: FlowDraft; on: WorkHandlers }) {
  const first = (draft.plan ?? []).find((s) => !s.buffer && !s.struck);
  return (
    <View className={PANEL_SHELL}>
      <Choice
        label={first ? `Start: ${first.title}` : 'Make a start now'}
        primary
        onPress={() => on.onAnswer({ startedNow: true }, 'startNow')}
      />
      <Choice label="Later, it is on the plan" onPress={() => on.onAnswer({ startedNow: false }, 'startNow')} />
    </View>
  );
}
