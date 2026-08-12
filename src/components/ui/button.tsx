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
          {leftIcon ? <View>{leftIcon}</View> : null}
          <Text variant={size === 'sm' ? 'small' : 'body'} tone={labelTone[variant!]} className="font-strong">
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
