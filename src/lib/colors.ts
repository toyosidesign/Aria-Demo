import { useColorScheme } from 'nativewind';

import { resolveTheme, type Palette, type Theme } from '@/lib/themes';
import { useAriaStore } from '@/store/aria-store';

/**
 * Reading the active theme from a component.
 *
 * Split from lib/themes.ts because these touch the store, and the store has to
 * be able to import the theme types without importing this.
 */

export * from '@/lib/themes';

/**
 * The active theme, for imperative use — icon `color` props, StatusBar, chart
 * fills. `className` styling reads the same values through the CSS variables
 * that `themeVars` writes at the root, so the two never disagree.
 */
export function useTheme(): Theme {
  const { colorScheme } = useColorScheme();
  const pref = useAriaStore((s) => s.settings.theme);
  return resolveTheme(pref, colorScheme === 'dark');
}

export function useColors(): Palette {
  return useTheme().palette;
}
