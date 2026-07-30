/**
 * Every theme has to be readable, not just the default one.
 *
 * A theme picker multiplies the ways contrast can go wrong: six surfaces, each
 * with its own ink, and a shared accent that has to work on all of them. This
 * asserts the whole matrix so adding a seventh theme can't quietly ship one
 * where the body text is unreadable.
 */

import assert from 'node:assert/strict';

import { THEMES, THEME_NAMES, resolveTheme, themeVars } from '@/lib/themes';

let pass = 0;
const fail: string[] = [];
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message.split('\n')[0]}`); }
};

const rel = (h: string) => {
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i + 1, i + 3), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

console.log('\ntext contrast on each theme surface');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: ink, muted and accent all clear AA on its own surface`, () => {
    for (const role of ['ink', 'muted', 'accent'] as const) {
      const r = ratio(p[role], p.surface);
      assert.ok(r >= 4.5, `${role} is ${r.toFixed(2)}:1 on ${p.surface}, needs 4.5`);
    }
  });
}

console.log('\naccent on its own tinted panel (chips, banners)');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: accent on accentSoft clears AA`, () => {
    const r = ratio(p.accent, p.accentSoft);
    assert.ok(r >= 4.5, `${r.toFixed(2)}:1, needs 4.5`);
  });
}

console.log('\ntinted panels are visible on both the page and a card');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: accentSoft separates from surface AND bg`, () => {
    // The profile avatar is an accent-soft disc sitting directly on `bg`, while
    // chips and banners sit on `surface`. Tuning against one alone made the
    // avatar vanish on the light themes — it was within 1.03 of its own page.
    const onSurface = ratio(p.accentSoft, p.surface);
    const onBg = ratio(p.accentSoft, p.bg);
    assert.ok(onSurface >= 1.1, `only ${onSurface.toFixed(3)} against surface — invisible on a card`);
    assert.ok(onBg >= 1.1, `only ${onBg.toFixed(3)} against bg — invisible on the page`);
  });
}

console.log('\nlabels on filled accent controls');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: accentInk on accent clears AA`, () => {
    const r = ratio(p.accentInk, p.accent);
    assert.ok(r >= 4.5, `${r.toFixed(2)}:1, needs 4.5`);
  });
}

console.log('\nstatus colours stay legible everywhere');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: success, warning and danger clear AA`, () => {
    for (const role of ['success', 'warning', 'danger'] as const) {
      const r = ratio(p[role], p.surface);
      assert.ok(r >= 4.5, `${role} is ${r.toFixed(2)}:1`);
    }
  });
}

console.log('\nsurfaces are distinguishable from each other');
for (const name of THEME_NAMES) {
  const p = THEMES[name].palette;
  t(`${name}: surface, bg and border are not the same colour`, () => {
    assert.notEqual(p.surface, p.bg, 'a card must be visible against the page');
    assert.ok(ratio(p.surface, p.border) > 1.02, 'border must be visible on the surface');
  });
}

console.log('\ncharcoal stays neutral');
t('charcoal has no hue anywhere in its palette', () => {
  // It is the monochrome theme; a cool cast is Midnight's job. The iOS system
  // greys it started from sit ~5 points bluer than red, and the shared
  // priorityLow was 31 — invisible per swatch, unmistakable across a screen.
  const p = THEMES.charcoal.palette;
  for (const [role, value] of Object.entries(p)) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i + 1, i + 3), 16));
    // The three semantic colours are meant to have hue — they mean something.
    if (['success', 'warning', 'danger', 'priorityMedium', 'priorityHigh'].includes(role)) continue;
    assert.equal(r, g, `${role} ${value}: R and G differ`);
    assert.equal(g, b, `${role} ${value}: carries a ${b - r > 0 ? 'blue' : 'warm'} cast`);
  }
});

console.log('\nplumbing');
t('every theme exposes a full set of CSS variables', () => {
  for (const name of THEME_NAMES) {
    const v = themeVars(THEMES[name]);
    assert.equal(Object.keys(v).length, 16, `${name} has ${Object.keys(v).length} vars`);
    for (const [k, val] of Object.entries(v)) {
      assert.match(val, /^\d{1,3} \d{1,3} \d{1,3}$/, `${name} ${k} is "${val}"`);
    }
  }
});

t('system resolves to a light theme in light and a dark one in dark', () => {
  assert.equal(resolveTheme('system', false).dark, false);
  assert.equal(resolveTheme('system', true).dark, true);
});

t('a named theme ignores the device scheme', () => {
  for (const name of THEME_NAMES) {
    assert.equal(resolveTheme(name, true).name, name);
    assert.equal(resolveTheme(name, false).name, name);
  }
});

t('an unknown stored value falls back rather than crashing', () => {
  // Someone upgrading from a build with different theme names.
  const out = resolveTheme('chartreuse' as never, false);
  assert.ok(out && out.palette.surface, 'must return a usable theme');
});

console.log(
  fail.length
    ? `\n\x1b[31m${fail.length} failed\x1b[0m, ${pass} passed\n` + fail.map((f) => `  · ${f}`).join('\n')
    : `\n\x1b[32mAll ${pass} theme checks passed.\x1b[0m`,
);
process.exit(fail.length ? 1 : 0);
