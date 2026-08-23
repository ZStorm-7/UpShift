// Design tokens: the numbers every screen agrees on.
//
// The reason this file exists is consistency. Before it, one screen used
// padding 12 and radius 10 while the next used 16 and 12 — small enough that
// no single screen looked wrong, but the app as a whole felt unrelated to
// itself. Importing from here means a change to the scale changes everywhere.

import { colors } from './colors';
import { fontFamily } from './fonts';

// 4pt scale. Everything spatial is one of these — no arbitrary numbers.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Corner radii. Bigger surfaces get bigger radii so curvature reads as
// consistent rather than proportionally tighter on large cards.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// Type scale. Sizes pair with a line height, weight AND family so callers
// never have to invent the combination — that's where inconsistency creeps in.
//
// The family split follows the Claude Design mock exactly: the serif carries
// anything that's being SAID to the user — the greeting, a section title, a
// rank name — and the sans carries anything that's being READ as data — a
// quest title, a number, a button, a hint. That's a deliberate rule, not a
// decoration: it's why "Good morning, Marcus" and "Athlete" are serif while
// "12", "1,160" and "Log a workout" are sans even though some of those sans
// numbers are the biggest, boldest text on the card. Numerals in this
// particular serif (Fraunces) also carry old-style figures at some weights,
// which read as elegant in a headline and unreadable in a stat tile — another
// reason numbers stay on the sans face regardless of size.
export const type = {
  // The greeting. Serif, largest weight on screen.
  display: {
    fontFamily: fontFamily.serif,
    fontSize: 30,
    lineHeight: 36,
  },
  // Section titles — "Daily Quests" — and rank names — "Athlete".
  title: {
    fontFamily: fontFamily.serif,
    fontSize: 22,
    lineHeight: 28,
  },
  // A quieter serif beat, for a subtitle that sits right under a title
  // instead of introducing a new section.
  titleSemi: {
    fontFamily: fontFamily.serifSemi,
    fontSize: 20,
    lineHeight: 26,
  },
  // Card headers and list-item titles that need weight without becoming a
  // section boundary — quest titles, exercise names.
  heading: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  bodySm: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  // Small uppercase text used for section headers and badges. The letter
  // spacing is what keeps it legible at this size.
  label: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  // Numbers that are the point of the card — a calorie total, a streak
  // count, the level numeral. Sans, extra-bold — see the note above on why
  // this stays off the serif even at display size.
  metric: {
    fontFamily: fontFamily.sansBlack,
    fontSize: 22,
    lineHeight: 26,
  },
  // The single largest numeral on screen — the level badge, the XP counter
  // in the level-up takeover.
  metricLg: {
    fontFamily: fontFamily.sansBlack,
    fontSize: 30,
    lineHeight: 34,
  },
  // Buttons and pills — semibold sans, never serif; a serif button label
  // reads as a link in a document, not a tappable control.
  button: {
    fontFamily: fontFamily.sansSemi,
    fontSize: 15,
    lineHeight: 20,
  },
};

// Layout constants shared by every screen, so headers and gutters line up
// when you navigate between them.
export const layout = {
  screenPadding: spacing.lg,
  gap: spacing.md,
  headerHeight: 56,
  // Keeps the last card clear of the tab bar / gesture area.
  bottomInset: 96,
  hairline: 1,
};

// Elevation on dark backgrounds is done with background + border, not shadow.
// A shadow under a near-black card is invisible; a lighter fill with a
// slightly brighter border genuinely reads as "closer to the viewer".
export const elevation = {
  flat: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: layout.hairline,
    borderColor: colors.borderStrong,
  },
};

export default { spacing, radius, type, layout, elevation };
