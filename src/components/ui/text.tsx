import { Text as RNText, type TextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const textVariants = cva('text-ink', {
  variants: {
    variant: {
      display: 'text-[34px] leading-[40px] font-bold tracking-tight',
      title: 'text-[28px] leading-[34px] font-bold tracking-tight',
      heading: 'text-xl leading-7 font-semibold',
      subtitle: 'text-[17px] leading-6 font-semibold',
      body: 'text-base leading-6',
      small: 'text-sm leading-5',
      caption: 'text-xs leading-4',
      label: 'text-[11px] leading-4 font-semibold uppercase tracking-wider',
    },
    tone: {
      default: 'text-ink',
      muted: 'text-muted',
      faint: 'text-faint',
      accent: 'text-accent',
      onAccent: 'text-accent-ink',
      danger: 'text-danger',
      success: 'text-success',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
});

export interface UITextProps extends TextProps, VariantProps<typeof textVariants> {}

export function Text({ className, variant, tone, ...props }: UITextProps) {
  return <RNText className={cn(textVariants({ variant, tone }), className)} {...props} />;
}
