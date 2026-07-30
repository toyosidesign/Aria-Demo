import { Text as RNText, type TextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const textVariants = cva('text-ink', {
  variants: {
    // Sizes in px rather than a mix of Tailwind tokens and literals, so the
    // whole ramp reads at once and the gaps between steps stay deliberate. Line
    // heights move with the sizes: raising text without raising leading makes it
    // cramped rather than easier to read.
    //
    // The headings sit between where they started and a first, too-large pass:
    // 32px titles overwhelmed the screens they sat on. Body and small are back
    // at their original sizes — the readability problem on Settings and Profile
    // was descriptions being set in `caption`, not the scale itself, and that's
    // fixed by using `small` there instead.
    variant: {
      display: 'text-[36px] leading-[42px] font-bold tracking-tight',
      title: 'text-[30px] leading-[36px] font-bold tracking-tight',
      heading: 'text-[22px] leading-[30px] font-semibold',
      subtitle: 'text-[18px] leading-[25px] font-semibold',
      body: 'text-[16px] leading-[24px]',
      small: 'text-[14px] leading-[21px]',
      caption: 'text-[13px] leading-[18px]',
      label: 'text-[12px] leading-[16px] font-semibold uppercase tracking-wider',
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
