import { router } from 'expo-router';
import { Sparkles, X } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { useAriaStore, type Subtask, type Task } from '@/store/aria-store';

/** A checklist item. Tapping the label opens an Aria research chat for it. */
export function SubtaskRow({ task, st }: { task: Task; st: Subtask }) {
  const c = useColors();
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);
  const removeSubtask = useAriaStore((s) => s.removeSubtask);

  /*
   * A part can be dropped, not only ticked.
   *
   * Aria's plan is a proposal. Now that finishing is what unlocks sending, a
   * part nobody intends to do would hold the whole assignment shut, and the way
   * out somebody would actually take is ticking it off untouched, which makes
   * every tick on the list mean less. Asked first, because deleting a step
   * takes its research and its draft section with it in spirit if not in fact,
   * and an undo would be a bigger promise than this needs.
   */
  const drop = () =>
    Alert.alert(`Drop "${st.title}"?`, 'It comes off the plan. Nothing else changes.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Drop it', style: 'destructive', onPress: () => removeSubtask(task.id, st.id) },
    ]);

  return (
    <View className="flex-row items-center gap-3 py-2">
      <Checkbox checked={st.done} onToggle={() => toggleSubtask(task.id, st.id)} />
      <Pressable
        onPress={() => router.push(`/research/${task.id}?subId=${st.id}`)}
        className="flex-1 flex-row items-center gap-2 active:opacity-60">
        <Text
          className={st.done ? 'flex-1 line-through' : 'flex-1'}
          tone={st.done ? 'faint' : 'default'}>
          {st.title}
        </Text>
        {!st.done ? <Sparkles size={15} color={c.accent} /> : null}
      </Pressable>
      <Pressable onPress={drop} hitSlop={10} accessibilityLabel={`Drop ${st.title}`}>
        <X size={15} color={c.faint} />
      </Pressable>
    </View>
  );
}
