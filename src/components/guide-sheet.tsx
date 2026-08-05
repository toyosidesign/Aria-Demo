import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Choice, InfoChip } from '@/components/flow-controls';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { NARROWING, type GuideDirection, type GuideMode } from '@/lib/guide';
import { requestGuide } from '@/lib/work-client';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore, type Task } from '@/store/aria-store';

/**
 * The Guide, opened from a task rather than from the setup conversation.
 *
 * Same behaviour, same words, same compass — because it is the same door. It
 * appears on the plan preview, on the definition-of-done gate, on a pinned step
 * and on anything that has rolled over twice, and if those were four different
 * controls nobody would learn that. The chat renders its own version inside the
 * flow panel; this is the one for a task that already exists.
 *
 * What it produces is kept: taking a direction writes it onto the task as a
 * section, so the decision survives the sheet being closed. A guide whose
 * output vanished on dismiss would be a diversion rather than part of the work.
 */
export function GuideSheet({
  task,
  open,
  onClose,
}: {
  task: Task;
  open: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const profile = useAriaStore((s) => s.profile);

  const mode: GuideMode = task.kind === 'assignment' ? 'assignment' : 'project';
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [directions, setDirections] = useState<GuideDirection[] | null>(null);
  const [needs, setNeeds] = useState<string | null>(null);

  async function ask(value: string) {
    setFocus(value);
    setBusy(true);
    try {
      const res = await requestGuide({
        mode,
        title: task.title,
        focus: value,
        /*
         * The context is everything Aria kept when the task was created.
         *
         * A guide that ignores the rubric is worse than none, and by this point
         * the rubric lives in the sections written at setup — so they go back
         * in rather than being re-derived from a title.
         */
        note: [task.description, ...(task.draftSections ?? []).map((s) => s.content)]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 2000),
        learner: {
          role: profile.role,
          studying: profile.studying,
          level: profile.level,
          interests: profile.interests,
          explainStyle: profile.explainStyle,
        },
        // Same rule as the chat's Guide: it protects someone being marked, and
        // onboarding is where we learned whether anyone is marking them.
        student: task.kind === 'assignment' && profile.role !== 'independent' && profile.role !== 'employed',
      });
      if (res.kind === 'needs') {
        setNeeds(res.ask);
        setDirections(null);
      } else {
        setDirections(res.directions);
        setNeeds(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function take(d: GuideDirection) {
    hapticSelect();
    addDraftSection(task.id, {
      title: 'The direction I took',
      content: [
        d.title,
        `Needs: ${d.needs}`,
        `Costs: ${d.costs}`,
        d.rewardedBy ? `Marks under: ${d.rewardedBy}` : '',
        d.questions?.length ? `Has to answer:\n${d.questions.map((q) => `- ${q}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    close();
  }

  function close() {
    setFocus(null);
    setDirections(null);
    setNeeds(null);
    onClose();
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View className="flex-1 bg-bg">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Text variant="subtitle">Guide</Text>
          <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close the guide">
            <X size={20} color={c.muted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text variant="small" tone="muted">
            {task.title}
          </Text>

          {/* One narrowing question first, always. "I'm stuck" covers two
              different problems whose answers look nothing alike. */}
          {!focus ? (
            <>
              <Text className="font-strong">{NARROWING[mode].question}</Text>
              {NARROWING[mode].options.map((o) => (
                <Choice key={o.value} label={o.label} onPress={() => void ask(o.value)} />
              ))}
            </>
          ) : null}

          {busy ? (
            <Text variant="small" tone="muted">
              Reading what I&apos;ve got on this…
            </Text>
          ) : null}

          {/* Nothing to go on, said plainly, with the one thing that fixes it. */}
          {needs ? (
            <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
              <Text variant="small">{needs}</Text>
              <Button title="Close" variant="secondary" onPress={close} />
            </View>
          ) : null}

          {directions?.map((d, i) => (
            <View key={`${d.title}-${i}`} className="gap-1.5 rounded-2xl border border-border bg-surface p-4">
              <Text className="font-strong">{d.title}</Text>
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
              {d.questions?.map((q) => (
                <Text key={q} variant="caption" tone="faint">
                  · {q}
                </Text>
              ))}
              <Button title="Take this one" className="mt-2" onPress={() => take(d)} />
            </View>
          ))}

          {directions?.length ? (
            <Choice label="None of these — ask again" onPress={() => void ask(focus ?? 'angle')} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
