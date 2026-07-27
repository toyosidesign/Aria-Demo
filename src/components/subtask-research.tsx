import { Check, ChevronUp, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { requestDraft } from '@/lib/aria-actions';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { useAriaStore, type Subtask, type Task } from '@/store/aria-store';

type Phase = 'ask' | 'loading' | 'done';

/** A checklist item that offers per-topic research help when tapped. */
export function SubtaskRow({ task, st }: { task: Task; st: Subtask }) {
  const c = useColors();
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('ask');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  async function help() {
    hapticTap();
    setPhase('loading');
    const res = await requestDraft({
      kind: 'assignment',
      title: task.title,
      description: task.description,
      subtaskTitle: st.title,
      research: true,
    });
    setNotes(res.message);
    setPhase('done');
  }

  return (
    <View className="py-1">
      <View className="flex-row items-center gap-3 py-1.5">
        <Checkbox checked={st.done} onToggle={() => toggleSubtask(task.id, st.id)} />
        <Pressable
          onPress={() => setOpen((o) => !o)}
          className="flex-1 flex-row items-center gap-2 active:opacity-60">
          <Text
            className={st.done ? 'flex-1 line-through' : 'flex-1'}
            tone={st.done ? 'faint' : 'default'}>
            {st.title}
          </Text>
          {open ? <ChevronUp size={16} color={c.faint} /> : <Sparkles size={15} color={c.accent} />}
        </Pressable>
      </View>

      {open ? (
        <View className="ml-9 mt-1 gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-3">
          {phase === 'ask' ? (
            <>
              <View className="flex-row items-center gap-2">
                <AriaAvatar size={22} />
                <Text variant="small" className="flex-1">
                  Want help researching “{st.title}”?
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Button
                  title="Help me research"
                  size="sm"
                  className="flex-1"
                  leftIcon={<Sparkles size={15} color={c.accentInk} />}
                  onPress={help}
                />
                <Button title="Not now" size="sm" variant="ghost" onPress={() => setOpen(false)} />
              </View>
            </>
          ) : phase === 'loading' ? (
            <View className="flex-row items-center gap-2 py-1">
              <Sparkles size={15} color={c.accent} />
              <Text variant="small" tone="accent">
                Aria is researching…
              </Text>
            </View>
          ) : (
            <>
              <Text variant="label" tone="accent">
                Research notes
              </Text>
              <Text className="leading-6">{notes}</Text>
              <View className="flex-row gap-2">
                <Button
                  title={saved ? 'Saved ✓' : 'Save to draft'}
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  leftIcon={saved ? <Check size={15} color={c.success} /> : undefined}
                  onPress={() => {
                    addDraftSection(task.id, { title: st.title, content: notes });
                    setSaved(true);
                  }}
                />
                {!st.done ? (
                  <Button
                    title="Mark done"
                    size="sm"
                    onPress={() => {
                      toggleSubtask(task.id, st.id);
                      hapticSuccess();
                      setOpen(false);
                    }}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
