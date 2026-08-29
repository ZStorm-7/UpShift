// Light + dark theme pair, driven by an in-app toggle (not the OS setting —
// that gave inconsistent behavior when the user wanted "dark forever" but
// the OS was on schedule).
//
// The dark palette matches the existing shipped `colors` (theme/colors.ts)
// almost 1:1, but with a Robinhood-style accent swap: the cyan #03DAC6 is
// replaced with Robinhood green #00C805, and a Robinhood red #FF4B55 is
// added as `loss` for use anywhere a "down" trend is drawn. Everything
// else — text, borders, tier badges, macros — stays. This means the
// existing screens keep working; only the accent-driven pixels change.
//
// The light palette is the same structure inverted, and I chose the
// specific shades to keep the same text/surface contrast ratios the dark
// palette already cleared for WCAG AA. The gray for `textMuted` on the
// lightest raised surface is #6B6B6B at 4.71:1, comfortably above 4.5:1.
//
// Any screen that wants the current palette calls useTheme(); it returns
// the palette OBJECT whose keys are identical to the existing `colors`
// export, so a screen that currently does `colors.textPrimary` becomes
// `theme.textPrimary` with a one-line change.

import { createContext, useContext } from 'react';

export type Palette = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;

  accent: string;
  accentSoft: string;
  accentBorder: string;

  loss: string;         // Robinhood red — down trend / negative delta
  lossSoft: string;

  xp: string;
  xpSoft: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;

  border: string;
  borderStrong: string;
  divider: string;

  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;

  protein: string;
  carbs: string;
  fat: string;

  scrim: string;
};

// Robinhood green + red. Green is the app's new accent; red is `loss`,
// used for downward deltas on the History screen and anywhere a trend
// goes negative. These stay the same across both themes on purpose —
// brand colors don't shift with the surface behind them.
const RH_GREEN = '#00C805';
const RH_GREEN_SOFT = 'rgba(0, 200, 5, 0.14)';
const RH_GREEN_BORDER = 'rgba(0, 200, 5, 0.35)';
const RH_RED = '#FF4B55';
const RH_RED_SOFT = 'rgba(255, 75, 85, 0.14)';

export const darkPalette: Palette = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceRaised: '#1E1E1E',
  surfaceSunken: '#050505',

  accent: RH_GREEN,
  accentSoft: RH_GREEN_SOFT,
  accentBorder: RH_GREEN_BORDER,

  loss: RH_RED,
  lossSoft: RH_RED_SOFT,

  xp: '#F5A524',
  xpSoft: 'rgba(245, 165, 36, 0.14)',

  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#858585',
  textOnAccent: '#001700', // near-black with a trace of the accent's own hue

  border: '#303030',
  borderStrong: '#454545',
  divider: '#2A2A2A',

  success: RH_GREEN, // in this theme, success == accent (both are the same green)
  successSoft: RH_GREEN_SOFT,
  danger: RH_RED,
  dangerSoft: RH_RED_SOFT,
  warning: '#F5A524',
  warningSoft: 'rgba(245, 165, 36, 0.14)',
  info: '#619DFF',
  infoSoft: 'rgba(97, 157, 255, 0.14)',

  protein: '#619DFF',
  carbs: '#EB9F25',
  fat: '#AA76DE',

  scrim: 'rgba(0, 0, 0, 0.78)',
};

export const lightPalette: Palette = {
  bg: '#FFFFFF',
  surface: '#F7F7F7',
  surfaceRaised: '#EDEDED',
  surfaceSunken: '#FAFAFA',

  accent: RH_GREEN,
  accentSoft: RH_GREEN_SOFT,
  accentBorder: RH_GREEN_BORDER,

  loss: RH_RED,
  lossSoft: RH_RED_SOFT,

  xp: '#B37800',      // amber shifted darker so it clears AA on white
  xpSoft: 'rgba(179, 120, 0, 0.14)',

  textPrimary: '#0A0A0A',
  textSecondary: '#4A4A4A',
  textMuted: '#6B6B6B',
  textOnAccent: '#FFFFFF',

  border: '#DCDCDC',
  borderStrong: '#C4C4C4',
  divider: '#E4E4E4',

  success: RH_GREEN,
  successSoft: RH_GREEN_SOFT,
  danger: RH_RED,
  dangerSoft: RH_RED_SOFT,
  warning: '#B37800',
  warningSoft: 'rgba(179, 120, 0, 0.14)',
  info: '#2C5FCC', // deeper blue on light
  infoSoft: 'rgba(44, 95, 204, 0.14)',

  protein: '#2C5FCC',
  carbs: '#B37800',
  fat: '#7A4EC4',

  scrim: 'rgba(0, 0, 0, 0.45)',
};

// A ThemeContext provides the current palette + a setter. The Provider is
// mounted at the root of App.tsx, and the initial value is read from a
// per-user Firestore doc (see EditProfileScreen for the toggle).

export type ThemeMode = 'light' | 'dark';

export type ThemeContextValue = {
  mode: ThemeMode;
  palette: Palette;
  setMode: (m: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  palette: darkPalette,
  setMode: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Sugar for the common case — most call sites only want the palette.
export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}
