import { Switch as RNSwitch } from 'react-native';

import { useColors } from '@/lib/colors';

export function Switch({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /**
   * Shown, and not operable yet.
   *
   * For a setting that exists but is not available to this account, the Pro
   * send switch during onboarding. Drawing it greyed says what Pro will change
   * at the moment someone is deciding about it, where hiding it would leave
   * them to find out later.
   */
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: c.border, true: c.accent }}
      thumbColor={c.surface}
      ios_backgroundColor={c.border}
    />
  );
}
