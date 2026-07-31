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
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore, type ExplainStyle } from '@/store/aria-store';

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
    body: 'Nothing is sent or changed without your OK. You’re in control the whole way.',
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
 * reads — these cover the common cases, and the questions that can't be closed
 * sets take a typed answer as well.
 */
const SUBJECTS = [
  'Law', 'Medicine', 'Engineering', 'Computer Science', 'Business',
  'Psychology', 'Nursing', 'Economics', 'Biology', 'Chemistry',
  'Physics', 'History', 'English', 'Education', 'Art & Design',
] as const;

const LEVELS = ['1st year', '2nd year', '3rd year', 'Final year', 'Postgrad'] as const;

const INTERESTS = [
  'Basketball', 'Football', 'Music', 'Gaming', 'Cooking', 'Film',
  'Art', 'Fitness', 'Anime', 'Reading', 'Photography', 'Dance',
  'Fashion', 'Travel', 'Cars', 'Podcasts',
] as const;

const EXPLAIN: { value: ExplainStyle; label: string; hint: string }[] = [
  {
    value: 'examples',
    label: 'Use examples from what I’m into',
    hint: 'Projectile motion explained through a jump shot.',
  },
  { value: 'direct', label: 'Straight to the point', hint: 'Just the answer, no warm-up.' },
  { value: 'stepwise', label: 'Step by step, slowly', hint: 'Small pieces, checking in as we go.' },
];

/** Intro, then one question per screen. */
const LAST_STEP = 4;
/** The payoff after the last question — not a question, so not in the progress bar. */
const CELEBRATE = 5;

export default function WelcomeScreen() {
  const c = useColors();
  const firstName = useAriaStore((s) => s.profile.name.split(' ')[0]);
  const completeOnboarding = useAriaStore((s) => s.completeOnboarding);
  const updateProfile = useAriaStore((s) => s.updateProfile);

  const [step, setStep] = useState(0);

  /*
   * Everything starts empty and stays optional.
   *
   * The profile ships with a demo persona — psychology sophomore, plays
   * basketball. Pre-filling from it would put words in a new student's mouth,
   * and because these values feed Aria's prompts, Aria would then address
   * someone using facts they never gave.
   */
  const [subjects, setSubjects] = useState<string[]>([]);
  const [otherSubject, setOtherSubject] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [otherInterest, setOtherInterest] = useState('');
  const [explain, setExplain] = useState<ExplainStyle[]>([]);

  const studying = otherSubject.trim() || subjects[0] || '';
  const level = levels[0] ?? '';
  const allInterests = [
    ...interests,
    ...otherInterest.split(',').map((i) => i.trim()).filter(Boolean),
  ];

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
   * Built from the actual answers rather than being fixed copy — the point of
   * this screen is showing that the four questions changed something. A student
   * who skipped everything gets the generic lines instead of a screen making
   * claims about a person it knows nothing about.
   */
  const highlights = [
    studying
      ? { Icon: Sparkles, text: `I'll break your ${studying} work into steps you can actually start.` }
      : { Icon: Sparkles, text: 'I’ll break big pieces of work into steps you can actually start.' },
    allInterests.length
      ? {
          Icon: MessageCircle,
          text: `When something won’t click, I’ll explain it through ${allInterests[0].toLowerCase()}.`,
        }
      : { Icon: MessageCircle, text: 'Tell me what’s coming up and I’ll set it all up for you.' },
    { Icon: ShieldCheck, text: 'Nothing gets sent without your OK. Always.' },
  ];

  function saveAnswers() {
    /*
     * Written whether or not anything was answered — that's the point.
     *
     * Skipping has to *clear* the demo persona, not leave it standing. A
     * student who skipped every question would otherwise get drafts pitched at
     * a psychology sophomore who plays basketball. An empty profile means Aria
     * knows nothing about them, which is far better than Aria being confidently
     * wrong about them.
     */
    updateProfile({
      studying,
      level,
      interests: allInterests,
      explainStyle: explain[0],
      // The one-line description the drafting prompts already read. Composed
      // from the structured answers, so those prompts improve without asking a
      // fifth question.
      context: [level, studying && `studying ${studying}`].filter(Boolean).join(' '),
    });
  }

  function enterApp() {
    hapticSelect();
    /*
     * `completeOnboarding` last, and only here.
     *
     * It flips `onboarded`, which the auth gate watches — the moment it's true
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
  const answered = [true, !!studying, !!level, allInterests.length > 0, explain.length > 0][step];

  return (
    <Screen padded edges={['top', 'bottom']}>
      {/* Back and progress disappear on the last screen — there's nothing left
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
          <Step
            title="What are you studying?"
            blurb="So when I break down an assignment, the steps belong to your subject instead of being generic.">
            <ChoiceGroup options={SUBJECTS} value={subjects} onChange={setSubjects} single />
            <Input
              label="Something else"
              placeholder="e.g. Architecture"
              value={otherSubject}
              onChangeText={setOtherSubject}
              returnKeyType="done"
            />
          </Step>
        ) : null}

        {step === 2 ? (
          <Step
            title="Where are you up to?"
            blurb="This sets how deep I go. A first-year and a finalist asking the same question need different answers.">
            <ChoiceGroup options={LEVELS} value={levels} onChange={setLevels} single />
          </Step>
        ) : null}

        {step === 3 ? (
          <Step
            title="What are you into?"
            blurb="This one does the most work. When something abstract won't land, I'll explain it through something you already know well.">
            <ChoiceGroup options={INTERESTS} value={interests} onChange={setInterests} />
            <Input
              label="Anything else"
              placeholder="e.g. chess, baking — separate with commas"
              value={otherInterest}
              onChangeText={setOtherInterest}
              returnKeyType="done"
            />
          </Step>
        ) : null}

        {step === 4 ? (
          <Step
            title="How should I explain things?"
            blurb="You can change any of this later in your profile.">
            <View className="gap-2">
              {EXPLAIN.map((o) => {
                const on = explain[0] === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      hapticSelect();
                      setExplain(on ? [] : [o.value]);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`gap-1 rounded-2xl border p-4 active:opacity-70 ${
                      on ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                    }`}>
                    <Text className="font-strong" tone={on ? 'accent' : 'default'}>
                      {o.label}
                    </Text>
                    <Text variant="small" tone="muted">
                      {o.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>
        ) : null}

        {step === CELEBRATE ? (
          <View className="flex-1 items-center justify-center gap-8 py-6">
            <View className="items-center justify-center" style={{ height: 120, width: 120 }}>
              {/* The halo sits behind and is purely decorative — no text, no
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
                a block — the whole point is that each line is specific to them. */}
            <View className="gap-4 self-stretch px-2">
              {highlights.map((h, i) => (
                <Animated.View
                  key={h.text}
                  entering={FadeInDown.delay(420 + i * 170).duration(420)}
                  className="flex-row items-start gap-3">
                  {/* A bare icon in a box exactly one line tall.
                      Two things were wrong before. The icon sat in a 40px
                      square while the first text line is 24px, so `items-start`
                      put its centre 8px below the line it belongs to — the
                      lower the icon, the more it looked like it belonged to the
                      second line. Matching the box to `leading-6` centres it on
                      the first line at any text size.
                      And the filled accent-soft container was the same
                      treatment StatusBadge and PriorityBadge use. Those mean
                      something — late, due, high priority — so wearing their
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
