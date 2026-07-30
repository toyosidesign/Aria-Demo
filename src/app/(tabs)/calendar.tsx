import { addDays, addMonths, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { router } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { SimulatedDateBanner } from '@/components/simulated-date-banner';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { formatTime, monthWeeks, toISODate, WEEKDAY_LABELS } from '@/lib/dates';
import { KIND_ICON } from '@/lib/kind-icons';
import { useAriaStore, type Priority, type Task } from '@/store/aria-store';

type CalView = 'month' | 'week' | 'day';

function priorityDot(p: Priority) {
  return p === 'high' ? 'bg-priority-high' : p === 'medium' ? 'bg-priority-medium' : 'bg-priority-low';
}

function agendaSort(a: Task, b: Task) {
  // Earliest appointed time first; untimed (all-day) tasks come after timed ones.
  const at = a.time ?? '99:99';
  const bt = b.time ?? '99:99';
  return at < bt ? -1 : at > bt ? 1 : 0;
}

function AgendaRow({ task }: { task: Task }) {
  const c = useColors();
  const Icon = KIND_ICON[task.kind];
  const done = task.status === 'done';
  return (
    <Pressable
      onPress={() => router.push(`/task/${task.id}`)}
      className="flex-row items-center gap-3 active:opacity-70">
      {/* Wide enough for the longest time ("12:00 PM") on one line, and pinned to
          one line regardless: at 64px it wrapped to "4:00" / "PM", which read as
          a stray indent rather than a time. */}
      <View className="w-20">
        <Text
          numberOfLines={1}
          variant="small"
          tone={done ? 'faint' : 'muted'}
          className="font-semibold">
          {task.time ? formatTime(task.time) : 'All day'}
        </Text>
      </View>
      <View className={cn('h-9 w-1 rounded-full', done ? 'bg-border' : priorityDot(task.priority))} />
      <View className="flex-1 flex-row items-center gap-2 py-2">
        <Icon size={15} color={done ? c.faint : c.muted} />
        <Text
          numberOfLines={1}
          className={cn('flex-1', done && 'line-through')}
          tone={done ? 'faint' : 'default'}>
          {task.title}
        </Text>
      </View>
    </Pressable>
  );
}

function Agenda({ iso, tasks }: { iso: string; tasks: Task[] }) {
  return (
    <View className="gap-1 pt-2">
      <Text variant="label" tone="muted">
        {format(parseISO(iso), 'EEEE, MMMM d')}
      </Text>
      {tasks.length === 0 ? (
        <View className="items-center gap-2 py-8">
          <CalendarDays size={22} color="#9aa0aa" />
          <Text tone="faint">Nothing scheduled</Text>
        </View>
      ) : (
        <View className="gap-1 pt-1">
          {tasks.map((t) => (
            <AgendaRow key={t.id} task={t} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function CalendarScreen() {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);

  const [view, setView] = useState<CalView>('month');
  const [cursor, setCursor] = useState(() => parseISO(demoDate));
  const [selected, setSelected] = useState(demoDate);

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [tasks]);

  const selectedTasks = useMemo(
    () => (byDate.get(selected) ?? []).slice().sort(agendaSort),
    [byDate, selected],
  );

  function shift(dir: 1 | -1) {
    if (view === 'month') setCursor(addMonths(cursor, dir));
    else if (view === 'week') setCursor(addWeeks(cursor, dir));
    else {
      const d = addDays(parseISO(selected), dir);
      setSelected(toISODate(d));
      setCursor(d);
    }
  }
  function goToday() {
    setCursor(parseISO(demoDate));
    setSelected(demoDate);
  }
  function pick(iso: string) {
    setSelected(iso);
  }

  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weeks = monthWeeks(cursor);

  const navTitle =
    view === 'month'
      ? format(cursor, 'MMMM yyyy')
      : view === 'week'
        ? `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'MMM d')}`
        : format(parseISO(selected), 'EEEE, MMM d');

  return (
    <Screen padded>
      <View className="flex-row items-center justify-between pb-3 pt-2">
        <Text variant="title">Calendar</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={goToday}
            hitSlop={8}
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 active:opacity-70">
            <Text variant="small" className="font-semibold">
              Today
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/task/new?date=${selected}`)}
            hitSlop={8}
            accessibilityLabel="Add a task on this day"
            className="h-9 w-9 items-center justify-center rounded-full bg-accent active:opacity-80">
            <Plus size={20} color={c.accentInk} />
          </Pressable>
        </View>
      </View>

      <SimulatedDateBanner className="mb-3" />

      <Segmented<CalView>
        value={view}
        onChange={setView}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'week', label: 'Week' },
          { value: 'day', label: 'Day' },
        ]}
      />

      {/* Nav row */}
      <View className="flex-row items-center justify-between py-3">
        <Pressable onPress={() => shift(-1)} hitSlop={8} className="p-1 active:opacity-50">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text variant="subtitle">{navTitle}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={8} className="p-1 active:opacity-50">
          <ChevronRight size={22} color={c.ink} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>
        {view === 'month' ? (
          <View className="gap-1">
            <View className="flex-row">
              {WEEKDAY_LABELS.map((d, i) => (
                <Text key={i} variant="caption" tone="faint" className="flex-1 text-center font-semibold">
                  {d}
                </Text>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} className="flex-row">
                {week.map((cell) => {
                  const dayTasks = byDate.get(cell.iso) ?? [];
                  const isSel = cell.iso === selected;
                  const isToday = cell.iso === demoDate;
                  return (
                    <Pressable
                      key={cell.iso}
                      onPress={() => pick(cell.iso)}
                      className="flex-1 items-center py-1.5">
                      <View
                        className={cn(
                          'h-9 w-9 items-center justify-center rounded-full',
                          isSel ? 'bg-accent' : isToday ? 'bg-accent-soft' : '',
                        )}>
                        <Text
                          className={cn('text-[15px]', (isToday || isSel) && 'font-bold')}
                          tone={isSel ? 'onAccent' : isToday ? 'accent' : cell.inMonth ? 'default' : 'faint'}>
                          {cell.date.getDate()}
                        </Text>
                      </View>
                      <View className="mt-1 h-1 flex-row gap-0.5">
                        {dayTasks.slice(0, 3).map((t) => (
                          <View key={t.id} className={cn('h-1 w-1 rounded-full', priorityDot(t.priority))} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View className="mt-1 border-t border-border" />
            <Agenda iso={selected} tasks={selectedTasks} />
          </View>
        ) : view === 'week' ? (
          <View className="gap-2">
            <View className="flex-row">
              {weekDays.map((d) => {
                const iso = toISODate(d);
                const dayTasks = byDate.get(iso) ?? [];
                const isSel = iso === selected;
                const isToday = iso === demoDate;
                return (
                  <Pressable key={iso} onPress={() => pick(iso)} className="flex-1 items-center gap-1 py-1">
                    <Text variant="caption" tone="faint" className="font-semibold">
                      {format(d, 'EEEEE')}
                    </Text>
                    <View
                      className={cn(
                        'h-9 w-9 items-center justify-center rounded-full',
                        isSel ? 'bg-accent' : isToday ? 'bg-accent-soft' : '',
                      )}>
                      <Text
                        className={cn('text-[15px]', (isToday || isSel) && 'font-bold')}
                        tone={isSel ? 'onAccent' : isToday ? 'accent' : 'default'}>
                        {d.getDate()}
                      </Text>
                    </View>
                    <View className="h-1 flex-row gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <View key={t.id} className={cn('h-1 w-1 rounded-full', priorityDot(t.priority))} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View className="border-t border-border" />
            <Agenda iso={selected} tasks={selectedTasks} />
          </View>
        ) : (
          <Agenda iso={selected} tasks={selectedTasks} />
        )}
      </ScrollView>
    </Screen>
  );
}
