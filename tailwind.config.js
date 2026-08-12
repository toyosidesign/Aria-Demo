/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        faint: 'rgb(var(--color-faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
          ink: 'rgb(var(--color-accent-ink) / <alpha-value>)',
        },
        // Theme-aware now rather than fixed: in a single-hue palette these are
        // steps on the same ramp, so they have to flip with the scheme like
        // everything else. Hardcoding them left light-theme greys on a near
        // black background.
        priority: {
          low: 'rgb(var(--color-priority-low) / <alpha-value>)',
          medium: 'rgb(var(--color-priority-medium) / <alpha-value>)',
          high: 'rgb(var(--color-priority-high) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      /*
       * Inter, as three real cuts rather than one cut plus fake weights.
       *
       * React Native will not pick a heavier file for you: give it
       * `Inter_400Regular` and `fontWeight: 600` and the OS smears the regular
       * outline into a synthetic bold, which is muddy at small sizes and is
       * most of what makes a custom font look "off" in an app.
       *
       * So weight is chosen by *family*. `font-strong` and `font-heavy` replace
       * `font-semibold` and `font-bold` everywhere — the plain Tailwind weight
       * utilities are the trap, not the fix.
       */
      fontFamily: {
        sans: ['Inter_400Regular'],
        strong: ['Inter_600SemiBold'],
        heavy: ['Inter_700Bold'],
        rounded: ['System'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '28px',
      },
    },
  },
  plugins: [],
};
