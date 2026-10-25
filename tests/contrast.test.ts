// Every text colour must clear WCAG AA (4.5:1) on every surface it can sit on,
// in both themes. Brand fills (rings, bars) are not text and are not checked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { darkPalette, lightPalette } from '../theme/themedColors';

const lum = (h: string) => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = ['textPrimary', 'textSecondary', 'textMuted', 'accent', 'xp', 'loss', 'info', 'warning', 'danger', 'success'] as const;
const SURFACES = ['bg', 'surface', 'surfaceRaised'] as const;

for (const [name, p] of [['dark', darkPalette], ['light', lightPalette]] as const) {
  test(`${name} theme: text colours clear 4.5:1 on every surface`, () => {
    for (const t of TEXT) for (const s of SURFACES) {
      assert.ok(ratio(p[t], p[s]) >= 4.5, `${t} on ${s} is ${ratio(p[t], p[s]).toFixed(2)}`);
    }
  });
  test(`${name} theme: text on the accent button clears 4.5:1`, () => {
    assert.ok(ratio(p.textOnAccent, p.accent) >= 4.5, ratio(p.textOnAccent, p.accent).toFixed(2));
  });
}

// The Dashboard is always the light editorial page, whatever the theme toggle says.
import { minimalColors as m } from '../theme/minimalColors';
test('dashboard palette: every ink clears 4.5:1 on every surface it sits on', () => {
  const inks: [string, string[]][] = [
    ['ink', [m.bg, m.surface, m.surfaceSunken]],
    ['textSecondary', [m.bg, m.surface, m.surfaceSunken]],
    ['textMuted', [m.bg, m.surface, m.surfaceSunken]],
    ['gold', [m.bg, m.surface, m.goldSoft]],
    ['blue', [m.bg, m.surface, m.blueSoft]],
    ['green', [m.bg, m.surface, m.greenSoft]],
    ['red', [m.bg, m.surface, m.redSoft]],
  ];
  for (const [k, bgs] of inks) for (const bg of bgs) {
    const fg = (m as Record<string, string>)[k];
    assert.ok(ratio(fg, bg) >= 4.5, `${k} on ${bg} is ${ratio(fg, bg).toFixed(2)}`);
  }
});
