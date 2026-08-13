import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from './text';

const button = cva('flex-row items-center justify-center gap-2 rounded-2xl', {
  variants: {
    variant: {
      primary: 'bg-accent active:opacity-80',
      secondary: 'bg-surface border border-border active:opacity-70',
      ghost: 'bg-transparent active:opacity-60',
      danger: 'bg-danger active:opacity-80',
    },
    size: {
      sm: 'h-9 px-3.5',
      md: 'h-12 px-4',
      lg: 'h-14 px-5',
    },
    block: { true: 'w-full', false: 'self-start' },
    disabled: { true: 'opacity-40', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'md', block: false, disabled: false },
});

const labelTone = {
  primary: 'onAccent',
  danger: 'onAccent',
  secondary: 'default',
  ghost: 'accent',
} as const;

export interface ButtonProps
  extends Omit<PressableProps, 'children'>,
    VariantProps<typeof button> {
  title: string;
  leftIcon?: React.ReactNode;
  loading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon,
  loading = false,
  disabled = false,
  className,
  ...props
}: ButtonProps) {
  const c = useColors();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      className={cn(button({ variant, size, block, disabled: isDisabled }), className)}
      disabled={isDisabled}
      {...props}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? c.accentInk : c.accent}
        />
      ) : (
        <>
          {leftIcon ? <View className="shrink-0">{leftIcon}</View> : null}
          {/*
            One line, and allowed to be narrower than its text.

            Every size here is a fixed height, so a label with nowhere to wrap
            spills past the padding instead: an assignment part called "Major
            cities and regional differences" turned a button into a block of
            text with the icon pushed off the edge. `shrink` lets the label be
            smaller than it wants to be, which is the only thing that makes the
            width bound real, and one line with an ellipsis is the honest end of
            a label that does not fit. Titles this long belong under the button,
            not in it.
          */}
          <Text
            variant={size === 'sm' ? 'small' : 'body'}
            tone={labelTone[variant!]}
            className="shrink font-strong"
            numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
