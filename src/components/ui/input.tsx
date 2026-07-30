import { type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from './text';

export interface InputProps extends TextInputProps {
  label?: string;
  multiline?: boolean;
  /** Optional element rendered on the right (e.g. a show-password eye). */
  rightSlot?: ReactNode;
}

export function Input({ label, className, multiline, style, rightSlot, ...props }: InputProps) {
  const c = useColors();

  const field =
    rightSlot && !multiline ? (
      <View className="h-12 flex-row items-center rounded-2xl border border-border bg-surface pr-1.5">
        <TextInput
          placeholderTextColor={c.faint}
          className={cn('h-12 flex-1 px-4 text-base text-ink', className)}
          style={style}
          {...props}
        />
        {rightSlot}
      </View>
    ) : (
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
    );

  return (
    <View className="gap-2">
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      {field}
    </View>
  );
}
