/**
 * The colour system: ramps, themes, and how a theme becomes CSS variables.
 *
 * Deliberately free of any app import. The store needs `ThemePref` to type the
 * setting, and lib/colors.ts needs the store to know which theme is active , 
 * putting the registry here is what stops those two forming a cycle.
 */


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
  warning: string;
  danger: string;
}

/**
 * The primary ramp, navy.
 *
 * Reconstructed from the contrast figures supplied with the palette: contrast
 * against white pins relative luminance exactly (L = 1.05/CR − 0.05), so each
 * step is the navy at that luminance. Every one lands within 0.1 of its stated
 * ratio.
 *
 * 300 and 400 are interpolated. The supplied set jumps from L .543 straight to
 * L .047 with nothing between, and a dark theme needs an accent light enough to
 * read on it, so those two fill the gap on the same hue and chroma.
 */
export const primary = {
  50: '#EAEDF3',
  100: '#DDE2EB',
  200: '#BAC3D6',
  300: '#8695B8',
  400: '#596B97',
  500: '#333D56',
  600: '#2E374E',
  700: '#283145',
  750: '#262E41',
  800: '#1E2534',
  900: '#171B27',
  950: '#12161E',
} as const;

export const gray = {
  25: '#FCFCFD',
  50: '#F9FAFB',
  100: '#F2F4F7',
  200: '#EAECF0',
  300: '#D0D5DD',
  400: '#98A2B3',
  500: '#667085',
  600: '#475467',
  700: '#344054',
  800: '#1D2939',
  900: '#101828',
} as const;

export const error = {
  25: '#FFFBFA',
  50: '#FEF3F2',
  100: '#FEE4E2',
  200: '#FECDCA',
  300: '#FDA29B',
  400: '#F97066',
  500: '#F04438',
  600: '#D92D20',
  700: '#B42318',
  800: '#912018',
  900: '#7A271A',
} as const;

export const warning = {
  25: '#FFFCF5',
  50: '#FFFAEB',
  100: '#FEF0C7',
  200: '#FEDF89',
  300: '#FEC84B',
  400: '#FDB022',
  500: '#F79009',
  600: '#DC6803',
  700: '#B54708',
  800: '#93370D',
  900: '#7A2E0E',
} as const;

export const success = {
  25: '#F6FEF9',
  50: '#ECFDF3',
  100: '#D1FADF',
  200: '#A6F4C5',
  300: '#6CE9A6',
  400: '#32D583',
  500: '#12B76A',
  600: '#039855',
  700: '#027A48',
  800: '#05603A',
  900: '#054F31',
} as const;

/**
 * The neutrals that make each theme feel different.
 *
 * Only these change between themes. Accent and the three semantic colours come
 * from the ramps above and stay put, so "Cream" is still recognisably the same
 * app, a different paper stock, not a different brand.
 *
 * Every value here was picked against a contrast target rather than by eye:
 * `ink` and `muted` clear 4.5:1 on that theme's own surface in all six. `faint`
 * sits lower by design, it is the placeholder/"nothing here" tone, matching
 * gray-400's role in the source system, so it should never carry meaning.
 */
interface Neutrals extends Partial<Palette> {
  dark: boolean;
  label: string;
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  ink: string;
  muted: string;
  faint: string;
  /**
   * The tint behind accent-coloured content, chips, banners, the demo invite.
   *
   * Per theme rather than one shared blue, because a fixed tint is a different
   * colour dropped onto someone else's paper: on Linen it read as a powder-blue
   * card sitting on warm cream. Each theme names a step of *itself*.
   *
   * A theme may override *any* palette field when the shared value is wrong for
   * it, see Charcoal, which opts out of the accent and the priority dot.
   *
   * `accentSoft` has to separate from `bg` as well as from `surface`. These land on both:
   * the profile avatar is an accent-soft disc directly on the page, and chips
   * and banners sit on either depending on the screen. Tuned against `surface`
   * alone, the light themes came out a hair off their own page colour and the
   * avatar disappeared completely.
   */
  accentSoft: string;
}

const NEUTRALS = {
  white: {
    dark: false, label: 'White',
    bg: '#F4F6F9', surface: '#FFFFFF', elevated: '#FFFFFF', border: primary[100],
    ink: primary[950], muted: '#5A6478', faint: '#8A94A8',
    // Darker than the *page*, not just than the card. Tuned against `surface`
    // it vanished on the profile screen, where an accent-soft disc sits on
    // `bg`, see the note on Neutrals.accentSoft.
    accentSoft: '#DEE4ED',
  },
  linen: {
    dark: false, label: 'Linen',
    bg: '#F1E9E2', surface: '#F9F3EE', elevated: '#FDF9F6', border: '#E3D8CF',
    ink: '#2A2320', muted: '#655850', faint: '#9C8C81',
    // Warm, and a step below Linen's *page* colour. A fixed powder blue read as
    // a foreign card on warm paper; a step below `surface` was invisible once
    // it sat on `bg`.
    accentSoft: '#E5D6CA',
  },
  charcoal: {
    dark: true, label: 'Charcoal',
    /**
     * True neutrals: R, G and B equal at every step.
     *
     * These started as the iOS system greys, which carry a deliberate cool
     * cast, #1C1C1E, #A1A1A6, #D1D1D6 all sit five points bluer than they are
     * red. Individually invisible; across a whole screen of text, buttons and
     * links it reads as "slightly blue", which is Midnight's job. Charcoal is
     * the neutral one, so it is neutral all the way down.
     */
    bg: '#000000', surface: '#1C1C1C', elevated: '#2C2C2C', border: '#2C2C2C',
    ink: '#FFFFFF', muted: '#A1A1A1', faint: '#6E6E6E',
    accentSoft: '#2C2C2C',
    /**
     * Grey, not the shared navy.
     *
     * A light grey keeps the theme monochrome and still carries: it sits 11.2:1
     * on the card, and far enough from both white ink and muted to read as an
     * accent rather than as another text tone. Filled controls invert here , 
     * dark label on a light fill, which is why `accentInk` comes with it.
     */
    accent: '#D1D1D1',
    accentInk: '#1C1C1C',
    // The shared dark `priorityLow` is gray-500, which is +31 blue. The single
    // most obviously off-hue thing on this theme before it was overridden.
    priorityLow: '#7A7A7A',
  },
  midnight: {
    dark: true, label: 'Midnight',
    bg: primary[950], surface: primary[800], elevated: primary[750], border: primary[750],
    ink: '#EDF0F5', muted: '#A8B2C6', faint: '#75809A',
    accentSoft: primary[700],
  },
} satisfies Record<string, Neutrals>;

export type ThemeName = keyof typeof NEUTRALS;

/** Presentation order for the picker, light stocks first, then dark. */
export const THEME_NAMES = Object.keys(NEUTRALS) as ThemeName[];

/**
 * Accent and semantics, chosen by whether the theme is light or dark.
 *
 * The step choices are load-bearing:
 *
 *  · `accent` is blue **700** on light and **300** on dark, not the usual
 *    600/400. The deciding case is accent-coloured text on an `accentSoft`
 *    panel, chips, banners, the demo invite. blue-600 on blue-50 is 4.25:1
 *    and blue-400 on blue-900 is 4.25:1; both miss AA. 700/300 clear every
 *    pairing at ~5.6 while still reading as the brand blue.
 *
 *  · `success`, `warning` and `danger` use the **700** step on light, not 600.
 *    On white, error-600 is a comfortable 4.83:1, but on Linen's warmer paper
 *    it drops to 4.39, under AA. 700 holds across every light theme.
 *
 *    They were briefly pushed to 800 to survive StatusBadge tinting its own
 *    background with them, which cost the orange its orange: warning-800 is a
 *    brown-red. The badge now takes its colours from the ramps directly, so
 *    these can stay at the step that is both legible and still the right hue.
 *
 *  · `priority*` uses the vivid **500** step because those are only ever dots
 *    and bars. A fill can be as loud as it likes; the same value as text
 *    would not pass.
 */
const onLight = {
  accent: primary[500], accentInk: '#FFFFFF',
  priorityLow: gray[400], priorityMedium: warning[500], priorityHigh: error[500],
  success: success[700], warning: warning[700], danger: error[700],
};

const onDark = {
  accent: primary[200], accentInk: primary[950],
  priorityLow: gray[500], priorityMedium: warning[400], priorityHigh: error[400],
  success: success[400], warning: warning[400], danger: error[400],
};

export interface Theme {
  name: ThemeName;
  label: string;
  dark: boolean;
  palette: Palette;
}

function build(name: ThemeName): Theme {
  const { dark, label, ...neutrals } = NEUTRALS[name];
  // Theme neutrals last: `accentSoft` is the theme's own, not the shared one.
  return { name, label, dark, palette: { ...(dark ? onDark : onLight), ...neutrals } };
}

export const THEMES: Record<ThemeName, Theme> = Object.fromEntries(
  THEME_NAMES.map((n) => [n, build(n)]),
) as Record<ThemeName, Theme>;

/**
 * What the user picked. `system` follows the OS, resolving to the two themes
 * that read as plain light and plain dark.
 */
export type ThemePref = ThemeName | 'system';

export const SYSTEM_LIGHT: ThemeName = 'white';
export const SYSTEM_DARK: ThemeName = 'midnight';

export function resolveTheme(pref: ThemePref, systemIsDark: boolean): Theme {
  if (pref === 'system') return THEMES[systemIsDark ? SYSTEM_DARK : SYSTEM_LIGHT];
  return THEMES[pref] ?? THEMES[SYSTEM_LIGHT];
}

/**
 * The active theme as CSS variables, for nativewind's `vars()`.
 *
 * This is what lets `className` styling follow a theme that isn't just
 * light/dark: the media query in global.css only knows those two, so the root
 * view overrides every variable at runtime and children inherit.
 */
export function themeVars(theme: Theme): Record<string, string> {
  const p = theme.palette;
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
  return {
    '--color-bg': rgb(p.bg),
    '--color-surface': rgb(p.surface),
    '--color-elevated': rgb(p.elevated),
    '--color-border': rgb(p.border),
    '--color-ink': rgb(p.ink),
    '--color-muted': rgb(p.muted),
    '--color-faint': rgb(p.faint),
    '--color-accent': rgb(p.accent),
    '--color-accent-soft': rgb(p.accentSoft),
    '--color-accent-ink': rgb(p.accentInk),
    '--color-priority-low': rgb(p.priorityLow),
    '--color-priority-medium': rgb(p.priorityMedium),
    '--color-priority-high': rgb(p.priorityHigh),
    '--color-success': rgb(p.success),
    '--color-warning': rgb(p.warning),
    '--color-danger': rgb(p.danger),
  };
}

/**
 * Kept so the plain light/dark pair is still reachable, the navigation theme
 * and the pre-hydration background need a value before a preference is known.
 */
export const palette: { light: Palette; dark: Palette } = {
  light: THEMES[SYSTEM_LIGHT].palette,
  dark: THEMES[SYSTEM_DARK].palette,
};
