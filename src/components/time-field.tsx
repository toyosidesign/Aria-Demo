import { ChevronDown, ChevronUp, Clock } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

const pad = (n: number) => String(n).padStart(2, '0');
const to24 = (h12: number, pm: boolean) => (pm ? (h12 % 12) + 12 : h12 % 12);

function Stepper({
  display,
  onUp,
  onDown,
}: {
  display: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const c = useColors();
  return (
    <View className="items-center">
      <Pressable onPress={onUp} hitSlop={8} className="p-1 active:opacity-50">
        <ChevronUp size={20} color={c.muted} />
      </Pressable>
      <Text className="text-2xl font-semibold tabular-nums">{display}</Text>
      <Pressable onPress={onDown} hitSlop={8} className="p-1 active:opacity-50">
        <ChevronDown size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

/** Optional "HH:mm" (24h) time selector — pure JS, works everywhere. */
export function TimeField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (t: string | null) => void;
}) {
  const c = useColors();
  const enabled = value !== null;
  const [h24, m] = enabled ? value.split(':').map(Number) : [9, 0];
  const isPM = h24 >= 12;
  const h12 = ((h24 + 11) % 12) + 1;

  const commit = (nh24: number, nm: number) => onChange(`${pad(nh24)}:${pad(nm)}`);

  function changeHour(delta: number) {
    let nh = h12 + delta;
    if (nh > 12) nh = 1;
    else if (nh < 1) nh = 12;
    commit(to24(nh, isPM), m);
  }
  function changeMin(delta: number) {
    let nm = m + delta;
    if (nm >= 60) nm = 0;
    else if (nm < 0) nm = 55;
    commit(h24, nm);
  }
  function setMeridiem(pm: boolean) {
    commit(to24(h12, pm), m);
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" tone="muted">
          Time (optional)
        </Text>
        <Switch value={enabled} onValueChange={(on) => onChange(on ? '09:00' : null)} />
      </View>

      {enabled ? (
        <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <Clock size={18} color={c.muted} />
          <Stepper display={String(h12)} onUp={() => changeHour(1)} onDown={() => changeHour(-1)} />
          <Text className="text-2xl font-semibold">:</Text>
          <Stepper display={pad(m)} onUp={() => changeMin(5)} onDown={() => changeMin(-5)} />

          <View className="ml-auto gap-1">
            {(['AM', 'PM'] as const).map((label) => {
              const active = label === 'PM' ? isPM : !isPM;
              return (
                <Pressable
                  key={label}
                  onPress={() => setMeridiem(label === 'PM')}
                  className={cn(
                    'rounded-lg border px-3 py-1.5',
                    active ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
                  )}>
                  <Text
                    variant="small"
                    tone={active ? 'accent' : 'muted'}
                    className="font-semibold">
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
