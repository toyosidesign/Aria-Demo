import { type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from './text';

export interface InputProps extends TextInputProps {
  label?: string;
  multiline?: boolean;
  /** Optional element rendered on the right (e.g. a show-password eye). */
  rightSlot?: ReactNode;
  /**
   * What's wrong with this field, if anything.
   *
   * Present puts the field in an error state: red label, red border, and the
   * message underneath. Derive it from the value rather than storing it, so the
   * error clears the moment the thing that caused it is fixed instead of
   * needing to be dismissed.
   */
  error?: string;
  /** Lets a form focus whichever field blocked submission. */
  ref?: Ref<TextInput>;
}

export function Input({
  label,
  className,
  multiline,
  style,
  rightSlot,
  error,
  ref,
  ...props
}: InputProps) {
  const c = useColors();
  const invalid = !!error;

  // Set as a style rather than a class: `border-danger` would have to win a
  // specificity fight with the `border-border` in the same className every
  // render, and the loser of that fight varies by platform.
  const borderStyle = invalid ? { borderColor: c.danger } : null;

  const field =
    rightSlot && !multiline ? (
      <View
        style={borderStyle}
        className="h-12 flex-row items-center rounded-2xl border border-border bg-surface pr-1.5">
        <TextInput
          ref={ref}
          placeholderTextColor={c.faint}
          className={cn('h-12 flex-1 px-4 text-base text-ink', className)}
          style={style}
          {...props}
        />
        {rightSlot}
      </View>
    ) : (
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        multiline={multiline}
        className={cn(
          'rounded-2xl border border-border bg-surface px-4 text-base text-ink',
          multiline ? 'pt-3.5 pb-3.5' : 'h-12',
          className,
        )}
        style={[multiline ? { minHeight: 96, textAlignVertical: 'top' } : null, borderStyle, style]}
        {...props}
      />
    );

  return (
    <View className="gap-2">
      {label ? (
        <Text variant="label" tone={invalid ? 'danger' : 'muted'}>
          {label}
        </Text>
      ) : null}
      {field}
      {error ? (
        // `alert` so a screen reader announces this when it appears rather than
        // only when the field is next focused. A sighted user gets the red
        // instantly; this is the equivalent.
        <Text accessibilityRole="alert" variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
