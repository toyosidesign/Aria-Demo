import { useColorScheme as useDeviceScheme } from 'react-native';

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
  /*
   * React Native's Appearance, not nativewind's colour scheme.
   *
   * The app *writes* nativewind's scheme to keep `dark:` utilities in step with
   * the chosen theme — Charcoal forces 'dark', White forces 'light'. Reading
   * that same value back to answer "what is the device set to" made the two a
   * loop: pick Midnight, and nativewind now says dark; switch to Match my
   * device, and "system" resolves against nativewind's own override rather
   * than the phone. It stayed on Midnight at noon.
   *
   * Appearance only ever reports the device, so it cannot be fed by us.
   */
  const deviceScheme = useDeviceScheme();
  const pref = useAriaStore((s) => s.settings.theme);
  return resolveTheme(pref, deviceScheme === 'dark');
}

export function useColors(): Palette {
  return useTheme().palette;
}
