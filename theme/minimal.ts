// Dashboard redesign — proof of concept.
//
// A self-contained light/editorial variant of the app's theme, scoped to
// components/dashboardMinimal.tsx and screens/DashboardScreen.tsx. It does
// NOT replace theme/colors.ts or theme/tokens.ts — every other screen still
// reads from those, so this can be reviewed on one screen and either rolled
// out further or discarded without a two-way door.
//
// Direction: warm monochrome canvas, ink text, color spent only on four
// semantic tags (XP/gold, water/blue, streak/green, danger/red) — never on
// large surfaces. Instrument Serif carries the two lines that are genuinely
// SAID to the user (the dateline, the greeting); Instrument Sans carries
// everything read as data, matching the reasoning already established in
// theme/tokens.ts for the shipped pairing.

import { fontFamily } from './fonts';

export const minimalColors = {
  bg: '#FBFBFA',
  surface: '#FFFFFF',
  surfaceSunken: '#F3F2ED',

  border: '#E8E6E1',
  borderStrong: '#D8D5CE',

  ink: '#181613',
  textSecondary: '#6E6B64',
  textMuted: '#9C988F',

  // XP / level. The one warm accent, reserved for the level card and quest
  // XP tags — everywhere else on the page is monochrome.
  gold: '#8A5A00',
  goldSoft: '#FBF3DB',
  goldFill: '#C98500',

  // Water.
  blue: '#1F6C9F',
  blueSoft: '#E7F2FA',
  blueFill: '#3D84AE',

  // Streak.
  green: '#3B6B3E',
  greenSoft: '#EAF1E7',
  greenFill: '#4F8C53',

  // Errors / low readings.
  red: '#9F3A2F',
  redSoft: '#FBEAE8',
  redFill: '#B5473A',

  scrim: 'rgba(24, 22, 19, 0.55)',
};

export const minimalType = {
  // The dateline — "TUESDAY · AUGUST 23". Small, tracked, serif italic.
  dateline: {
    fontFamily: fontFamily.editorialSerifItalic,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.2,
  },
  // The greeting. The one big serif moment on the page.
  greeting: {
    fontFamily: fontFamily.editorialSerif,
    fontSize: 34,
    lineHeight: 38,
  },
  // Rank name, modal titles — a quieter serif beat.
  serifHeading: {
    fontFamily: fontFamily.editorialSerif,
    fontSize: 22,
    lineHeight: 27,
  },
  heading: {
    fontFamily: fontFamily.editorialSansSemi,
    fontSize: 16,
    lineHeight: 21,
  },
  body: {
    fontFamily: fontFamily.editorialSans,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: fontFamily.editorialSans,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontFamily: fontFamily.editorialSansSemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.9,
  },
  metric: {
    fontFamily: fontFamily.editorialSansBold,
    fontSize: 24,
    lineHeight: 28,
  },
  button: {
    fontFamily: fontFamily.editorialSansSemi,
    fontSize: 14,
    lineHeight: 18,
  },
};

// Spacing/radius intentionally distinct from theme/tokens.ts's scale: the
// minimalist-ui direction calls for more generous padding and crisper,
// smaller radii (8–12px max, never the app's pill/xl surfaces) than the
// shipped dark theme uses.
export const minimalSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const minimalRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
};

export default { minimalColors, minimalType, minimalSpacing, minimalRadius };
