import { TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from './text';

export interface InputProps extends TextInputProps {
  label?: string;
  multiline?: boolean;
}

export function Input({ label, className, multiline, style, ...props }: InputProps) {
  const c = useColors();
  return (
    <View className="gap-2">
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.faint}
        multiline={multiline}
        className={cn(
          'rounded-2xl border border-border bg-surface px-4 text-base text-ink',
          multiline ? 'pt-3.5 pb-3.5' : 'h-12',
          className,
        )}
        style={[multiline ? { minHeight: 96, textAlignVertical: 'top' } : null, style]}
        {...props}
      />
    </View>
  );
}
