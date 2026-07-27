import { useColorScheme } from 'nativewind';

export interface Palette {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  priorityLow: string;
  priorityMedium: string;
  priorityHigh: string;
  success: string;
  danger: string;
}

/**
 * Resolved palette values for imperative use (icon `color` props, StatusBar,
 * navigation theme, Reanimated) — mirrors the CSS variables in global.css.
 * className-based styling should use the Tailwind tokens instead.
 */
export const palette: { light: Palette; dark: Palette } = {
  light: {
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    border: '#ECEAE4',
    ink: '#1B1C1E',
    muted: '#6B6E76',
    faint: '#96989E',
    accent: '#3B5BD9',
    accentSoft: '#EAEEFC',
    accentInk: '#FFFFFF',
    priorityLow: '#64748B',
    priorityMedium: '#D08700',
    priorityHigh: '#D6455F',
    success: '#3E9B6B',
    danger: '#D6455F',
  },
  dark: {
    bg: '#0D0E10',
    surface: '#17191C',
    elevated: '#1E2125',
    border: '#26292E',
    ink: '#F4F3EF',
    muted: '#9BA0A8',
    faint: '#767A82',
    accent: '#6E86F5',
    accentSoft: '#1E2740',
    accentInk: '#FFFFFF',
    priorityLow: '#64748B',
    priorityMedium: '#D08700',
    priorityHigh: '#D6455F',
    success: '#3E9B6B',
    danger: '#D6455F',
  },
};

export function useColors(): Palette {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? palette.dark : palette.light;
}

export function priorityColor(p: 'low' | 'medium' | 'high', c: Palette) {
  return p === 'high' ? c.priorityHigh : p === 'medium' ? c.priorityMedium : c.priorityLow;
}
