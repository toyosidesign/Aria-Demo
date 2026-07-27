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
        // Semantic colors that read well in both themes (kept constant).
        priority: {
          low: '#64748B',
          medium: '#D08700',
          high: '#D6455F',
        },
        success: '#3E9B6B',
        danger: '#D6455F',
      },
      fontFamily: {
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
