import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';

interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: Rule[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
];

/** True when a password satisfies every rule shown in <PasswordCriteria />. */
export function isStrongPassword(pw: string) {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

/** Live checklist of password requirements, each row turns green when met. */
export function PasswordCriteria({ password }: { password: string }) {
  const c = useColors();
  return (
    <View className="gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <View key={rule.label} className="flex-row items-center gap-2">
            {met ? (
              <Check size={14} color={c.success} />
            ) : (
              <View className="h-3.5 w-3.5 items-center justify-center">
                <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.faint }} />
              </View>
            )}
            <Text variant="caption" style={{ color: met ? c.success : c.faint }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
