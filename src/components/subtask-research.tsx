import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { useAriaStore, type Subtask, type Task } from '@/store/aria-store';

/** A checklist item. Tapping the label opens an Aria research chat for it. */
export function SubtaskRow({ task, st }: { task: Task; st: Subtask }) {
  const c = useColors();
  const toggleSubtask = useAriaStore((s) => s.toggleSubtask);

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
    </View>
  );
}
