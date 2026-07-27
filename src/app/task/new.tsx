import { router, useLocalSearchParams } from 'expo-router';
import {
  AlignLeft,
  Bell,
  Gift,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  PenLine,
  Phone,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { ContactField } from '@/components/contact-field';
import { MonthCalendar } from '@/components/month-calendar';
import { TimeField } from '@/components/time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { METHOD_LABELS, methodOptionsFor, TASK_KINDS } from '@/lib/aria-actions';
import { cn } from '@/lib/cn';
import { isValidEmails } from '@/lib/contacts';
import { KIND_ICON } from '@/lib/kind-icons';
import { useColors } from '@/lib/colors';
import {
  defaultMethodFor,
  newDraftSubtask,
  useAriaStore,
  type Priority,
  type Subtask,
  type TaskKind,
  type TaskMethod,
} from '@/store/aria-store';


const PRIORITIES: { value: Priority; label: string; dot: string }[] = [
  { value: 'low', label: 'Low', dot: 'bg-priority-low' },
  { value: 'medium', label: 'Medium', dot: 'bg-priority-medium' },
  { value: 'high', label: 'High', dot: 'bg-priority-high' },
];

const METHOD_ICONS: Record<TaskMethod, LucideIcon> = {
  sms: MessageSquare,
  email: Mail,
  card: Gift,
  call: Phone,
  steps: ListChecks,
  outline: AlignLeft,
  draft: PenLine,
  remind: Bell,
  plan: ListTodo,
};

const KIND_VALUES: TaskKind[] = TASK_KINDS.map((k) => k.value);

export default function NewTaskScreen() {
  const c = useColors();
  const demoDate = useAriaStore((s) => s.demoDate);
  const addTask = useAriaStore((s) => s.addTask);

  // Pre-fill when Aria routes here from the chat ("Review & create").
  const params = useLocalSearchParams<{
    title?: string;
    date?: string;
    kind?: string;
    priority?: string;
    contactName?: string;
    contactEmail?: string;
    method?: string;
    time?: string;
  }>();
  const initialKind = KIND_VALUES.includes(params.kind as TaskKind)
    ? (params.kind as TaskKind)
    : 'general';

  const [title, setTitle] = useState(params.title ?? '');
  const [kind, setKind] = useState<TaskKind>(initialKind);
  const [date, setDate] = useState(params.date ?? demoDate);
  const [priority, setPriority] = useState<Priority>(
    (['low', 'medium', 'high'] as const).includes(params.priority as Priority)
      ? (params.priority as Priority)
      : 'medium',
  );
  const [contactName, setContactName] = useState(params.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(params.contactEmail ?? '');
  const [description, setDescription] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [method, setMethod] = useState<TaskMethod>(
    (params.method as TaskMethod) ?? defaultMethodFor(initialKind, !!params.contactName),
  );
  const [time, setTime] = useState<string | null>(params.time ?? null);

  const showsContact = kind !== 'assignment' && kind !== 'project';
  const contactLabel =
    kind === 'birthday' || kind === 'anniversary' ? "Who's it for?" : 'Who to contact (optional)';
  const methodOptions = methodOptionsFor(kind, contactName.trim().length > 0);

  // Keep the selected handling valid as the kind or contact changes.
  useEffect(() => {
    const opts = methodOptionsFor(kind, contactName.trim().length > 0);
    setMethod((m) => (opts.includes(m) ? m : defaultMethodFor(kind, contactName.trim().length > 0)));
  }, [kind, contactName]);

  const needsEmail = showsContact && method === 'email';
  const canSave = title.trim().length > 0 && (!needsEmail || isValidEmails(contactEmail));

  function selectKind(k: TaskKind) {
    setKind(k);
    const m = defaultMethodFor(k, contactName.trim().length > 0);
    if (m) setMethod(m);
  }

  function save() {
    if (!canSave) return;
    const cleanSubtasks = subtasks.filter((s) => s.title.trim().length > 0);
    addTask({
      title,
      date,
      priority,
      kind,
      description: description || undefined,
      contactName: showsContact ? contactName : undefined,
      contactEmail: showsContact && contactEmail.trim() ? contactEmail.trim() : undefined,
      method,
      time: time ?? undefined,
      subtasks: cleanSubtasks,
    });
    router.back();
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-border/60">
          <X size={22} color={c.ink} />
        </Pressable>
        <Text variant="subtitle">New task</Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Input
            label="What needs doing?"
            placeholder="e.g. Wish Jane a happy birthday"
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
          />

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TASK_KINDS.map((k) => {
                const active = kind === k.value;
                const Icon = KIND_ICON[k.value];
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => selectKind(k.value)}
                    className={cn(
                      'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <Icon size={16} color={active ? c.accent : c.muted} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Date
            </Text>
            <MonthCalendar value={date} onSelect={setDate} />
          </View>

          <TimeField value={time} onChange={setTime} />

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Priority
            </Text>
            <View className="flex-row gap-2">
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    className={cn(
                      'flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <View className={cn('h-2.5 w-2.5 rounded-full', p.dot)} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {showsContact ? (
            <ContactField
              label={contactLabel}
              name={contactName}
              onName={setContactName}
              email={contactEmail}
              onEmail={setContactEmail}
              requireEmail={method === 'email'}
            />
          ) : null}

          <View className="gap-2">
            <Text variant="label" tone="muted">
              How should Aria handle it?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {methodOptions.map((m) => {
                const active = method === m;
                const Icon = METHOD_ICONS[m];
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    className={cn(
                      'flex-row items-center gap-2 rounded-full border px-3.5 py-2.5',
                      active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                    )}>
                    <Icon size={16} color={active ? c.accent : c.muted} />
                    <Text
                      variant="small"
                      tone={active ? 'accent' : 'muted'}
                      className="font-semibold">
                      {METHOD_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            label="Notes (optional)"
            placeholder="Any detail that helps…"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Subtasks (optional)
            </Text>
            <View className="gap-2">
              {subtasks.map((st, i) => (
                <View key={st.id} className="flex-row items-center gap-2">
                  <TextInput
                    value={st.title}
                    onChangeText={(text) =>
                      setSubtasks((prev) =>
                        prev.map((s) => (s.id === st.id ? { ...s, title: text } : s)),
                      )
                    }
                    placeholder={`Step ${i + 1}`}
                    placeholderTextColor={c.faint}
                    className="h-11 flex-1 rounded-2xl border border-border bg-surface px-4 text-base text-ink"
                  />
                  <Pressable
                    onPress={() => setSubtasks((prev) => prev.filter((s) => s.id !== st.id))}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
                    <X size={18} color={c.muted} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => setSubtasks((prev) => [...prev, newDraftSubtask()])}
                className="flex-row items-center gap-2 self-start rounded-full px-2 py-1.5 active:opacity-60">
                <Plus size={18} color={c.accent} />
                <Text variant="small" tone="accent" className="font-semibold">
                  Add subtask
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View className="border-t border-border px-5 pb-6 pt-3">
          <Button title="Save task" block size="lg" disabled={!canSave} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
