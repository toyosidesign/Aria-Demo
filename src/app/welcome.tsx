import { router } from 'expo-router';
import {
  CalendarDays,
  ChevronLeft,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { ChoiceGroup } from '@/components/ui/choice-chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { ThemePicker } from '@/components/theme-picker';
import { ariaActionFor } from '@/lib/aria-actions';
import { nextTourDate } from '@/lib/demo';
import { ensureAlarmPermission } from '@/lib/alarms';
import { useColors, useTheme } from '@/lib/colors';
import { formatLong, realToday } from '@/lib/dates';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore, type WorkRole } from '@/store/aria-store';

/**
 * The one-line description every drafting prompt reads.
 *
 * Composed from the answers rather than asked for, and phrased per role: "2nd
 * year studying Law" and "Running my own thing: an agency or studio" are not
 * the same sentence, and Aria writes to them differently. Empty when nothing
 * was answered, which has to read as Aria knowing nothing rather than as a
 * half-built sentence about a person who does not exist.
 */
/**
 * The day the tour jumps to: the soonest one with something Aria can offer help
 * on, and never the day you are already standing on.
 *
 * The rule lives in `nextTourDate` so `check:plan` can hold it, this shipped
 * once as "today or later", which resolved to today (three seeds fall on the
 * current day), set the date it was already on, and left the switch flicking
 * back the instant it was touched.
 */
function tourDateNow(): string | undefined {
  const { tasks } = useAriaStore.getState();
  return nextTourDate(
    tasks.filter((t) => t.status === 'todo' && ariaActionFor(t)).map((t) => t.date),
    realToday(),
  );
}

function describeContext(role: WorkRole | null, field: string, level: string): string {
  const f = field.trim();
  if (role === 'employed') return f ? `Works in ${f}` : 'Employed';
  if (role === 'independent') return f ? `Running my own thing: ${f}` : 'Running my own thing';
  if (role === 'student') return [level, f && `studying ${f}`].filter(Boolean).join(' ');
  return [level, f && `studying ${f}`].filter(Boolean).join(' ');
}

const FEATURES: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: MessageCircle,
    title: 'Just tell me what you need',
    body: 'Type or speak it, like “remind me to email Prof. Lee Friday at 5pm,” and I’ll set it up with the right date and time.',
  },
  {
    Icon: Sparkles,
    title: 'I plan ahead',
    body: 'On the day, I’ll surface your task and offer to help: draft a message, work through an assignment, and more.',
  },
  {
    Icon: ShieldCheck,
    title: 'I always ask first',
    body: 'Nothing is sent or changed without your OK. On Pro you can let scheduled sends go on their own, and I’ll report back every time.',
  },
  {
    Icon: CalendarDays,
    title: 'See it all on your Calendar',
    body: 'Everything you add shows up by day, week, and month. I’ll help you rebalance a packed week.',
  },
];

/*
 * The option lists.
 *
 * Deliberately short. A chip list long enough to be exhaustive is one nobody
 * reads, these cover the common cases, and the questions that can't be closed
 * sets take a typed answer as well.
 */
const SUBJECTS = [
  'Law', 'Medicine', 'Engineering', 'Computer Science', 'Business',
  'Psychology', 'Nursing', 'Economics', 'Biology', 'Chemistry',
  'Physics', 'History', 'English', 'Education', 'Art & Design',
] as const;

const LEVELS = ['1st year', '2nd year', '3rd year', 'Final year', 'Postgrad'] as const;

/**
 * The first question, and the one the rest hang off.
 *
 * It used to be "What are you studying?", which answers itself inside the
 * question: someone employed, or running their own thing, had to either lie or
 * skip, and every prompt afterwards addressed them as a student, because that
 * was the only shape the profile had.
 *
 * The three lines underneath are what actually distinguishes them, and they are
 * about the *work* rather than about status: coursework arrives with a brief
 * and a deadline, employed work is assigned by somebody, and your own thing is
 * work you scope yourself. Those are the three flows this app already has.
 */
const ROLES: { value: WorkRole; label: string; line: string }[] = [
  { value: 'student', label: 'Studying', line: 'Coursework, deadlines' },
  { value: 'employed', label: 'Employed', line: 'Work someone assigns' },
  { value: 'independent', label: 'Running my own thing', line: 'Work you scope' },
];

/** Fields for someone employed. Broad, because the point is the register Aria
 *  writes in, not a taxonomy. */
const AREAS = [
  'Design', 'Engineering', 'Product', 'Marketing', 'Sales', 'Operations',
  'Finance', 'People & HR', 'Legal', 'Healthcare', 'Education', 'Research',
] as const;

/** And for someone running their own thing, what they run, not what they do. */
const VENTURES = [
  'Freelance', 'Consulting', 'An agency or studio', 'A startup',
  'A shop', 'Creator work', 'A trade or service', 'A side project',
] as const;

/**
 * The switches worth deciding before the app opens, rather than after.
 *
 * Deliberately four and not the whole Settings screen. Each one changes
 * something a person would otherwise be surprised by: whether Aria speaks up on
 * its own, whether the phone makes a sound at the right moment, whether the app
 * opens to anyone holding the phone, and, on Pro, whether things go out
 * without a final tap.
 */
const ESSENTIALS = [
  {
    key: 'proactiveAria' as const,
    label: 'Let Aria offer to help',
    hint: 'On the day, Aria says what it can do. Off, it waits until you ask.',
  },
  {
    key: 'notifications' as const,
    label: 'Notifications',
    hint: 'Alarms on tasks, and a nudge when something is due.',
  },
] as const;

/**
 * How a send actually happens, which is the one thing Free and Pro differ on.
 *
 * Asked during onboarding rather than discovered at the moment something needs
 * to go out. The difference is not a feature list, it is who presses send , 
 * and someone who thinks Aria will handle it and then finds an unsent draft on
 * the morning of a deadline has been misled by the setup, not by the tier.
 *
 * Free is first and is a complete answer, not a crippled one: Aria does the
 * work and the last tap is yours. That ordering is deliberate. A paywall placed
 * before anyone has seen the app work is asking for money on trust.
 */
const PLANS = [
  {
    value: 'free' as const,
    label: 'Free',
    line: 'I write it, attach the document, and you tap send.',
    note: 'Nothing leaves without you.',
  },
  {
    value: 'pro' as const,
    label: 'Pro',
    line: 'I send it for you, on the schedule we agreed, and tell you when it has gone.',
    note: 'You approve once, at the review. Ten minutes to stop it.',
  },
];

/**
 * Intro, then one question per screen.
 *
 *   0  intro
 *   1  which fits you            role
 *   2  the follow-up that fits   year · area · what you run
 *   3  who sends it              Free or Pro
 *   4  the essentials            the switches, applied as you tap them
 *
 * Free/Pro sits at 3, immediately before the essentials, and that order is
 * load-bearing rather than aesthetic: the last switch on the essentials screen
 * is "send at the scheduled time", which exists only on Pro. Asked the other
 * way round, that screen would have to either hide the switch from someone who
 * had not been asked yet, or show a control whose availability was undecided.
 *
 * It is also the earliest point where the question means anything: by then Aria
 * has said what it will do with their answers, so "who presses send" is a
 * decision about something concrete rather than a price list shown to someone
 * who has not seen the app work.
 */
const LAST_STEP = 4;
/** The payoff after the last question, not a question, so not in the progress bar. */
const CELEBRATE = 5;

export default function WelcomeScreen() {
  const c = useColors();
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);
  const completeOnboarding = useAriaStore((s) => s.completeOnboarding);
  const updateProfile = useAriaStore((s) => s.updateProfile);
  const setPro = useAriaStore((s) => s.setPro);

  const [step, setStep] = useState(0);

  /*
   * Everything starts empty and stays optional.
   *
   * The profile ships with a demo persona, psychology sophomore, plays
   * basketball. Pre-filling from it would put words in a new student's mouth,
   * and because these values feed Aria's prompts, Aria would then address
   * someone using facts they never gave.
   */
  const [role, setRole] = useState<WorkRole | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [otherSubject, setOtherSubject] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  /** Free or Pro, who taps send. Defaults to the one that exists today. */
  const [plan, setPlan] = useState<'free' | 'pro'>('free');

  const settings = useAriaStore((s) => s.settings);
  const setSetting = useAriaStore((s) => s.setSetting);
  const demoDate = useAriaStore((s) => s.demoDate);
  const setDemoDate = useAriaStore((s) => s.setDemoDate);
  const setSampleData = useAriaStore((s) => s.setSampleData);
  /*
   * Whether the samples are actually there, which is what the switch is about.
   *
   * Read from the data rather than from the simulated date, and off to begin
   * with. The switch used to show the date state while the tasks were seeded
   * regardless, so somebody who never touched it still arrived to a planner
   * full of Jane's birthday and a chemistry lab report.
   */
  const hasSamples = useAriaStore((s) => s.sampleIds.length > 0);

  const studying = otherSubject.trim() || subjects[0] || '';
  const level = levels[0] ?? '';
  // The theme actually on screen, whether that came from a pick or from the
  // device, the same distinction the Settings screen draws.
  const activeTheme = useTheme();
  const matchingDevice = settings.theme === 'system';
  const simulating = demoDate !== realToday();
  /**
   * A halo behind the avatar on the last screen.
   *
   * Slow and low-contrast on purpose: this is a moment of arrival, not a
   * notification. Anything faster reads as "something needs your attention".
   */
  const halo = useSharedValue(0);
  useEffect(() => {
    if (step !== CELEBRATE) return;
    halo.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(halo);
  }, [step, halo]);
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + halo.value * 0.55 }],
    opacity: 0.35 - halo.value * 0.35,
  }));

  /**
   * What Aria will now do, in their own terms.
   *
   * Built from the actual answers rather than being fixed copy, the point of
   * this screen is showing that the four questions changed something. A student
   * who skipped everything gets the generic lines instead of a screen making
   * claims about a person it knows nothing about.
   */
  const highlights = [
    /*
     * The field only reads as an adjective for two of the three roles.
     *
     * "Your Law work" and "your Design work" are both sentences a person would
     * say. "Your A startup work" is not, a venture is a thing you run, not a
     * subject your work is in, so that branch says what it is instead of
     * splicing the answer into the middle of a phrase.
     */
    role === 'independent'
      ? { Icon: Sparkles, text: 'I’ll turn what you’re scoping into steps you can actually start.' }
      : studying
        ? { Icon: Sparkles, text: `I'll break your ${studying} work into steps you can actually start.` }
        : { Icon: Sparkles, text: 'I’ll break big pieces of work into steps you can actually start.' },
    { Icon: MessageCircle, text: 'Tell me what’s coming up and I’ll set it all up for you.' },
    /*
     * The promise now matches the answer they just gave.
     *
     * "Nothing gets sent without your OK" was the only line here, and on Pro it
     * would be false the first time the scheduler sends something at 9am, the
     * approval happens once, at the review, rather than at the send. Saying the
     * wrong one of these is worse than saying neither.
     */
    /*
     * The promise follows the switch, not the tier.
     *
     * Pro with auto-send off still asks every time, so promising autonomous
     * sending to someone who left it off would be as wrong as the old line was
     * for someone who turned it on. Three states, three true sentences.
     */
    plan === 'pro' && settings.autoSend
      ? {
          Icon: ShieldCheck,
          text: 'You approve it at the review, then I send it. Ten minutes to stop it if you change your mind.',
        }
      : { Icon: ShieldCheck, text: 'I get it ready. You tap send. Nothing leaves without you.' },
  ];

  function saveAnswers() {
    /*
     * Written whether or not anything was answered, that's the point.
     *
     * Skipping has to *clear* the demo persona, not leave it standing. A
     * student who skipped every question would otherwise get drafts pitched at
     * a psychology sophomore who plays basketball. An empty profile means Aria
     * knows nothing about them, which is far better than Aria being confidently
     * wrong about them.
     */
    updateProfile({
      role: role ?? undefined,
      studying,
      // A year belongs to a student. Left blank for anyone else, so nothing
      // downstream reads "3rd year" off a freelancer's profile.
      level: role === 'student' ? level : '',
      /*
       * Cleared rather than left alone.
       *
       * Onboarding no longer asks what you're into, and the seeded demo persona
       * lists basketball and music. Skipping the write would leave a brand-new
       * account carrying someone else's hobbies into every prompt, Aria
       * explaining projectile motion through a jump shot to a person who never
       * mentioned basketball. Not asked has to mean not known.
       */
      interests: [],
      // The one-line description the drafting prompts already read. Composed
      // from the structured answers, and phrased per role, "2nd year studying
      // Law" and "Running my own thing: an agency" are not the same sentence,
      // and Aria writes differently to each.
      context: describeContext(role, studying, level),
    });
    /*
     * Pro is open now, so choosing it turns it on.
     *
     * `setPro` writes `profiles.pro`, the column the Edge Function reads before
     * sending on somebody's behalf, so this is the entitlement itself rather
     * than a preference about one.
     *
     * It is deliberately not the same as agreeing to autonomous sending. That
     * is `settings.autoSend`, the last switch on the next screen, and
     * `autoSendEnabled` requires both: Pro is permission to have the feature,
     * the switch is the decision to use it. Conflating them would mail somebody
     * the moment an account upgraded.
     */
    // `setPro` rather than `turnOnPro`: that one raises a confirmation alert,
    // and the screen this leads to *is* the confirmation.
    if (plan === 'pro') setPro(true);
  }

  function enterApp() {
    hapticSelect();
    /*
     * `completeOnboarding` last, and only here.
     *
     * It flips `onboarded`, which the auth gate watches, the moment it's true
     * this screen is redirected away. Calling it with the answers would have
     * meant the celebration never rendered at all.
     */
    completeOnboarding();
    router.replace('/');
  }

  const next = () => {
    hapticSelect();
    if (step === CELEBRATE) {
      enterApp();
    } else if (step === LAST_STEP) {
      saveAnswers();
      setStep(CELEBRATE);
    } else {
      setStep((s) => s + 1);
    }
  };
  const back = () => {
    hapticSelect();
    setStep((s) => Math.max(0, s - 1));
  };

  /** Whether this step has an answer. Changes the button's wording, never blocks. */
  const answered = [true, !!role, !!studying || !!level, true, true][step];

  return (
    <Screen padded edges={['top', 'bottom']}>
      {/* Back and progress disappear on the last screen, there's nothing left
          to go back to, and a progress bar on a "you're done" screen is a
          contradiction. */}
      <View className="flex-row items-center gap-3" style={{ height: 44 }}>
        {step > 0 && step !== CELEBRATE ? (
          <>
            <Pressable
              onPress={back}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="active:opacity-60">
              <ChevronLeft size={24} color={c.muted} />
            </Pressable>
            {/* Shown from the first question onward. A progress bar on a screen
                you haven't started reads as a chore rather than a welcome. */}
            <View className="flex-row gap-1.5">
              {Array.from({ length: LAST_STEP }, (_, i) => (
                <View
                  key={i}
                  style={{ backgroundColor: i < step ? c.accent : c.border }}
                  className="h-1.5 w-6 rounded-full"
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, gap: 24, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <Animated.View entering={FadeIn.duration(260)} className="gap-7">
            <View className="items-center gap-4 pt-2">
              <AriaAvatar size={72} />
              <View className="items-center gap-1.5">
                <Text variant="title">Hi {firstName} 👋</Text>
                <Text tone="muted" className="text-center">
                  I&apos;m Aria. Here&apos;s how I can help.
                </Text>
              </View>
            </View>

            <View className="gap-5">
              {FEATURES.map((f) => (
                <View key={f.title} className="flex-row items-start gap-3.5">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
                    <f.Icon size={20} color={c.accent} />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text variant="subtitle">{f.title}</Text>
                    <Text variant="small" tone="muted" className="leading-5">
                      {f.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {step === 1 ? (
          <Step title="Which fits you?" blurb="Changeable later.">
            <View className="gap-2">
              {ROLES.map((r) => {
                const on = role === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      hapticSelect();
                      /*
                       * Switching role clears the follow-up.
                       *
                       * "3rd year" is not an answer to "what's your area", and
                       * carrying it across would put a student's year on a
                       * freelancer's profile, where `describeLearner` would
                       * read it back as fact.
                       */
                      if (role !== r.value) {
                        setSubjects([]);
                        setOtherSubject('');
                        setLevels([]);
                      }
                      setRole(r.value);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`gap-1 rounded-2xl border p-4 active:opacity-70 ${
                      on ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                    }`}>
                    <Text className="font-strong" tone={on ? 'accent' : 'default'}>
                      {r.label}
                    </Text>
                    <Text variant="small" tone="muted">
                      {r.line}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>
        ) : null}

        {/*
          One screen, three questions, whichever one their answer earned.

          A student gets the year, because it sets how deep an explanation goes;
          the other two get their field, because that is what makes a breakdown
          belong to the actual work instead of being scaffolding. The subject
          stays for students for the same reason: "Law" is what turns a generic
          essay checklist into one about this essay.
        */}
        {step === 2 && role === 'student' ? (
          <Step
            title="Where are you up to?"
            blurb="This sets how deep I go. A first-year and a finalist asking the same question need different answers.">
            <ChoiceGroup options={LEVELS} value={levels} onChange={setLevels} single />
            <ChoiceGroup options={SUBJECTS} value={subjects} onChange={setSubjects} single />
            <Input
              label="Studying something else"
              placeholder="e.g. Architecture"
              value={otherSubject}
              onChangeText={setOtherSubject}
              returnKeyType="done"
            />
          </Step>
        ) : null}

        {step === 2 && role === 'employed' ? (
          <Step
            title="What's your area?"
            blurb="So I write to you as a colleague who knows the field, rather than explaining it to you.">
            <ChoiceGroup options={AREAS} value={subjects} onChange={setSubjects} single />
            <Input
              label="Something else"
              placeholder="e.g. Logistics"
              value={otherSubject}
              onChangeText={setOtherSubject}
              returnKeyType="done"
            />
          </Step>
        ) : null}

        {step === 2 && role === 'independent' ? (
          <Step
            title="What are you running?"
            blurb="Your time is the thing in short supply, so I'll be concrete about what each piece of work costs.">
            <ChoiceGroup options={VENTURES} value={subjects} onChange={setSubjects} single />
            <Input
              label="Something else"
              placeholder="e.g. A bakery"
              value={otherSubject}
              onChangeText={setOtherSubject}
              returnKeyType="done"
            />
          </Step>
        ) : null}

        {/* Nothing picked at step 1, so there is no follow-up to ask. Said out
            loud rather than shown as an empty screen. */}
        {step === 2 && !role ? (
          <Step title="Nothing to ask yet" blurb="Go back and pick one, or carry on. None of this is required.">
            <View />
          </Step>
        ) : null}

        {step === 3 ? (
          <Step
            title="When something's ready to go, who sends it?"
            blurb="Either way I do the work. This is only about the last step.">
            <View className="gap-2">
              {PLANS.map((p) => {
                const on = plan === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => {
                      hapticSelect();
                      setPlan(p.value);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`gap-1 rounded-2xl border p-4 active:opacity-70 ${
                      on ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                    }`}>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-strong" tone={on ? 'accent' : 'default'}>
                        {p.label}
                      </Text>
                      {p.value === 'pro' ? (
                        /* `rounded-md`, because it is a label rather than a
                           control. Shape is the affordance, see badge.tsx. */
                        <View className="rounded-md bg-accent-soft px-2 py-0.5">
                          <Text variant="caption" tone="accent" className="font-strong">
                            Available
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="small" tone="muted">
                      {p.line}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {p.note}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {plan === 'pro' ? (
              /*
               * Says what is still true, not just what changed.
               *
               * "Pro is on" reads as consent to autonomous sending, and it is
               * not: that is the last switch on the next screen. Someone who
               * upgrades and then finds an email already sent was told the
               * wrong thing here.
               */
              <Text variant="caption" tone="accent">
                Pro goes on when you finish here. I&apos;ll still ask before anything leaves until
                you say otherwise on the next screen.
              </Text>
            ) : null}
          </Step>
        ) : null}

        {/*
          The last screen before the app, and the only one that changes
          something immediately.

          Each switch is applied the moment it is tapped rather than saved at
          the end, because these are the real settings, the same store, the
          same toggles as the Settings screen. A copy that had to be committed
          later is a copy that can disagree with what the switch was showing.
        */}
        {step === 4 ? (
          <Step
            title="A few things to switch on"
            blurb="All of these live in Settings too, so nothing here is final.">
            <View className="gap-2">
              {ESSENTIALS.map((row) => (
                <View
                  key={row.key}
                  className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                  <View className="flex-1 gap-1">
                    <Text className="font-strong">{row.label}</Text>
                    <Text variant="small" tone="muted">
                      {row.hint}
                    </Text>
                  </View>
                  <Switch
                    value={settings[row.key]}
                    onValueChange={(v) => {
                      hapticSelect();
                      setSetting(row.key, v);
                      /*
                       * Ask the OS at the moment it is switched on.
                       *
                       * A notifications toggle that says "on" while iOS has
                       * never been asked is a promise the app cannot keep, and
                       * the first thing to break is the one alarm somebody
                       * actually needed.
                       */
                      if (row.key === 'notifications' && v) void ensureAlarmPermission();
                    }}
                  />
                </View>
              ))}

              {/*
                Appearance, on the screen where the rest of the switches are.

                It is the setting people look for first and the one they change
                on day one, and it is the only one here whose effect is visible
                the instant it is tapped, the screen you are standing on
                changes colour. "Match my device" is a rule about when to
                switch rather than a colour, so it stays a switch above the
                swatches, exactly as Settings has it.
              */}
              <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="font-strong">Match my device</Text>
                    <Text variant="small" tone="muted">
                      {matchingDevice
                        ? 'Aria switches between light and dark on its own.'
                        : `Staying on ${activeTheme.label}.`}
                    </Text>
                  </View>
                  <Switch
                    value={matchingDevice}
                    onValueChange={(on) => {
                      hapticSelect();
                      // Turning it off keeps whatever is on screen right now, so
                      // the app doesn't jump at the moment you take control.
                      setSetting('theme', on ? 'system' : activeTheme.name);
                    }}
                  />
                </View>
                {matchingDevice ? null : (
                  <ThemePicker value={settings.theme} onChange={(v) => setSetting('theme', v)} />
                )}
              </View>

              {/*
                The demo, offered rather than assumed.

                Everything Aria does that is worth seeing happens *on the day* a
                task is due, and a brand-new account has no such day. Without
                this, the first run is an empty list and a promise. Jumping the
                date is the one control that makes the app demonstrate itself,
                so it belongs where someone is already deciding how the app
                should behave, and it is a switch, not a surprise.
              */}
              <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="font-strong">Show me around with sample tasks</Text>
                    <Text variant="small" tone="muted">
                      {hasSamples
                        ? simulating
                          ? `A week of examples, and it's ${formatLong(demoDate)} so you can watch Aria offer to help.`
                          : 'A week of examples to look through. Turn this off to start with an empty planner.'
                        : 'Start empty, with only what you add yourself.'}
                    </Text>
                  </View>
                  <Switch
                    value={hasSamples}
                    onValueChange={(on) => {
                      hapticSelect();
                      /*
                       * The switch owns the data, and the date follows it.
                       *
                       * On restores the samples and moves to a day something is
                       * waiting, which is the only way to see Aria act. Off
                       * takes them away and puts the real date back, so nobody
                       * is left in a pretend week with an empty planner and no
                       * visible way out. Anything they made themselves survives
                       * both directions.
                       */
                      setSampleData(on);
                      /*
                       * Read back *after* the restore, not before.
                       *
                       * The day to jump to is chosen from the tasks that exist,
                       * and turning the switch on is what makes them exist , 
                       * computing it from the render's snapshot would pick from
                       * the empty list and jump nowhere.
                       */
                      setDemoDate(on ? (tourDateNow() ?? realToday()) : realToday());
                    }}
                  />
                </View>
              </View>

              {/*
                Shown only to someone who chose Pro, and it is a real switch.

                This is what the whole ordering exists for. It is the second
                half of the previous question, Pro is permission to send
                without you, this is the decision to actually do it, and the
                two are deliberately separate: `autoSendEnabled` requires both,
                so an upgrade on its own never mails anybody.

                Off is not "Aria does nothing". It still drafts, addresses and
                schedules; off only means it asks before anything leaves. The
                description says so, because "off" on a screen full of switches
                otherwise reads as the feature being disabled.
              */}
              {plan === 'pro' ? (
                <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                  <View className="flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-strong">Send at the scheduled time</Text>
                      <View className="rounded-md bg-accent-soft px-2 py-0.5">
                        <Text variant="caption" tone="accent" className="font-strong">
                          Pro
                        </Text>
                      </View>
                    </View>
                    <Text variant="small" tone="muted">
                      {settings.autoSend
                        ? 'Aria sends at the time you picked and tells you afterwards.'
                        : 'Aria gets it ready and asks you first. Nothing leaves without you.'}
                    </Text>
                  </View>
                  <Switch
                    value={settings.autoSend}
                    onValueChange={(v) => {
                      hapticSelect();
                      setSetting('autoSend', v);
                    }}
                  />
                </View>
              ) : null}
            </View>
          </Step>
        ) : null}

        {step === CELEBRATE ? (
          <View className="flex-1 items-center justify-center gap-8 py-6">
            <View className="items-center justify-center" style={{ height: 120, width: 120 }}>
              {/* The halo sits behind and is purely decorative, no text, no
                  control, nothing a screen reader needs to announce. */}
              <Animated.View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  haloStyle,
                  { position: 'absolute', height: 104, width: 104, borderRadius: 52, backgroundColor: c.accent },
                ]}
              />
              <Animated.View entering={ZoomIn.springify().damping(11).stiffness(120)}>
                <AriaAvatar size={92} />
              </Animated.View>
            </View>

            <Animated.View entering={FadeInDown.delay(200).duration(420)} className="items-center gap-2">
              <Text variant="title" className="text-center">
                You&apos;re all set, {firstName}
              </Text>
              <Text tone="muted" className="text-center leading-6">
                Here&apos;s what I&apos;ll do with that.
              </Text>
            </Animated.View>

            {/* Staggered so they're read one at a time rather than arriving as
                a block, the whole point is that each line is specific to them. */}
            <View className="gap-4 self-stretch px-2">
              {highlights.map((h, i) => (
                <Animated.View
                  key={h.text}
                  entering={FadeInDown.delay(420 + i * 170).duration(420)}
                  className="flex-row items-start gap-3">
                  {/* A bare icon in a box exactly one line tall.
                      Two things were wrong before. The icon sat in a 40px
                      square while the first text line is 24px, so `items-start`
                      put its centre 8px below the line it belongs to, the
                      lower the icon, the more it looked like it belonged to the
                      second line. Matching the box to `leading-6` centres it on
                      the first line at any text size.
                      And the filled accent-soft container was the same
                      treatment StatusBadge and PriorityBadge use. Those mean
                      something, late, due, high priority, so wearing their
                      look for decoration reads as a status that isn't there. */}
                  <View style={{ height: 24 }} className="w-5 items-center justify-center">
                    <h.Icon size={18} color={c.accent} strokeWidth={2} />
                  </View>
                  <Text variant="small" tone="muted" className="flex-1 leading-6">
                    {h.text}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-auto gap-3 pt-2">
          {/* Held back until the lines have landed. Arriving with them would
              invite a tap through the thing we just built. */}
          <Animated.View entering={step === CELEBRATE ? FadeIn.delay(1150).duration(400) : undefined}>
            <Button
              title={
                step === CELEBRATE
                  ? 'Take me in'
                  : step === 0
                    ? 'Get started'
                    : answered
                      ? 'Continue'
                      : 'Skip for now'
              }
              block
              size="lg"
              onPress={next}
            />
          </Animated.View>
          {step === CELEBRATE ? (
            <Animated.View entering={FadeIn.delay(1300).duration(400)}>
              <Text variant="caption" tone="faint" className="text-center leading-5">
                You can change any of this later in your profile.
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** One question: heading, why it's being asked, then the controls. */
function Step({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} className="gap-5">
      <View className="gap-2">
        <Text variant="heading">{title}</Text>
        {/* Every question says what the answer buys. People answer honestly
            when they can see what it's for, and guess when they can't. */}
        <Text variant="small" tone="muted" className="leading-5">
          {blurb}
        </Text>
      </View>
      {children}
    </Animated.View>
  );
}
