// Colours for the always-light Dashboard. Kept apart from minimal.ts (which pulls in
// the font packages) so tests can import the palette on its own.

export const minimalColors = {
  bg: '#FBFBFA',
  surface: '#FFFFFF',
  surfaceSunken: '#F3F2ED',

  border: '#E8E6E1',
  borderStrong: '#D8D5CE',

  ink: '#181613',
  textSecondary: '#5F5C55',
  textMuted: '#6E6B64', // was #9C988F (2.7:1); 4.9:1 on the canvas and 4.5:1 on sunken

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
