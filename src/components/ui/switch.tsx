import { Switch as RNSwitch } from 'react-native';

import { useColors } from '@/lib/colors';

export function Switch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const c = useColors();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: c.border, true: c.accent }}
      thumbColor={c.surface}
      ios_backgroundColor={c.border}
    />
  );
}
