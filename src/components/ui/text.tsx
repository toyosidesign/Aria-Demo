import { Text as RNText, type TextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const textVariants = cva('font-sans text-ink', {
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
    // Inter throughout, with weight picked by family (`font-strong`,
    // `font-heavy`) rather than by `font-strong`/`font-heavy` — see the note
    // in tailwind.config.js for why the weight utilities are the wrong tool
    // once a custom font is loaded.
    //
    // `tracking-tight` on the large sizes only. Inter is drawn a little wide
    // for display use; pulling it in is most of what makes a big heading look
    // composed rather than sprawling. Below ~20px it is already correctly
    // spaced and tightening hurts legibility.
    variant: {
      display: 'font-heavy text-[36px] leading-[42px] tracking-tight',
      title: 'font-heavy text-[29px] leading-[36px] tracking-tight',
      heading: 'font-strong text-[22px] leading-[30px] tracking-tight',
      subtitle: 'font-strong text-[17px] leading-[24px]',
      body: 'text-[16px] leading-[24px]',
      small: 'text-[14px] leading-[21px]',
      caption: 'text-[13px] leading-[18px]',
      label: 'font-strong text-[12px] leading-[16px] uppercase tracking-wider',
    },
    tone: {
      default: 'text-ink',
      muted: 'text-muted',
      faint: 'text-faint',
      accent: 'text-accent',
      onAccent: 'text-accent-ink',
      danger: 'text-danger',
      warning: 'text-warning',
      success: 'text-success',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
});

export interface UITextProps extends TextProps, VariantProps<typeof textVariants> {}

export function Text({ className, variant, tone, ...props }: UITextProps) {
  return <RNText className={cn(textVariants({ variant, tone }), className)} {...props} />;
}
