// UpShift colour system.
//
// Sampled directly from the Claude Design screenshots and the prototype
// recording, then contrast- and colourblind-checked. Every key that has ever
// existed in this file is still here under the same name, so nothing breaks —
// the values changed, the API didn't.
//
// Two things define the palette:
//
// 1. THE BACKGROUNDS ARE NEUTRAL. #0A0A0A, #141414, #1E1E1E — no blue tint.
//    The previous palette used cool greys (#0B0F14), which is a common dark-UI
//    move, but next to a cyan accent the blue in the background muddies the
//    accent instead of setting it off. Pure neutral greys make #03DAC6 read as
//    genuinely luminous.
//
// 2. TWO SATURATED COLOURS, AND ONLY TWO. The cyan accent and the amber XP.
//    Everything else on screen is grey. That restraint is the entire reason
//    progress "pops" — if six things are bright, nothing is.
//
// On accessibility: every colour below was checked against every surface it
// can sit on. Body text hits WCAG AA (4.5:1) everywhere, including textMuted
// on the raised surface — which is why textMuted is #858585 and not the
// darker grey the design mock uses for hint text. That one is a deliberate
// departure: the mock's muted grey measures 3.1:1 on a raised card, which is
// legible in a screenshot on a desktop monitor and genuinely is not on a phone
// outdoors.

export const colors = {
  // Backgrounds, darkest to lightest. Depth comes from these three plus a
  // border — never from drop shadows, which read as muddy smears on dark UI.
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceRaised: '#1E1E1E',
  surfaceSunken: '#050505',

  // The accent. Used for primary actions, active states and progress fills.
  accent: '#03DAC6',
  accentSoft: 'rgba(3, 218, 198, 0.14)',
  accentBorder: 'rgba(3, 218, 198, 0.35)',

  // XP / rewards. Deliberately the only other saturated colour.
  xp: '#F5A524',
  xpSoft: 'rgba(245, 165, 36, 0.14)',

  // Text, in descending emphasis. All three clear AA on every surface.
  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#858585',
  // Sits on top of the accent — a near-black with a trace of the accent's own
  // hue in it, which reads as intentional where pure black reads as a hole.
  textOnAccent: '#00201C',

  // Lines.
  //
  // Nudged up from #262626 / #1C1C1C. At the original values the divider sat
  // at 1.08:1 against the card it divides and the border at 1.22:1 — visible
  // on a good OLED in a dark room and gone on a cheap LCD in daylight. That
  // matters more here than it looks: the app's core layout pattern is "one
  // card of rows separated by hairlines" rather than a stack of cards, so an
  // invisible hairline doesn't degrade the design gracefully, it collapses
  // the list into an undifferentiated block.
  //
  // Deliberately still low-contrast. These are separators, not content — the
  // target is "unmistakably present when you look for it", not "3:1 like a
  // control". Raising them further starts to look like a spreadsheet.
  border: '#303030',
  borderStrong: '#454545',
  divider: '#2A2A2A',

  // Semantic states.
  success: '#3DD68C',
  successSoft: 'rgba(61, 214, 140, 0.14)',
  danger: '#F0402F',
  dangerSoft: 'rgba(240, 64, 47, 0.14)',
  warning: '#F5A524',
  warningSoft: 'rgba(245, 165, 36, 0.14)',
  info: '#619DFF',
  infoSoft: 'rgba(97, 157, 255, 0.14)',

  // Macros. Checked as a categorical set: the worst adjacent pair separates by
  // ΔE 28.7 under protanopia and ΔE 29.4 under normal vision, so the three are
  // distinguishable without reading the labels.
  protein: '#619DFF',
  carbs: '#EB9F25',
  fat: '#AA76DE',

  // Overlay behind modals.
  scrim: 'rgba(0, 0, 0, 0.78)',
};

/**
 * Avatar identity palette — the fill behind a user's initials when they
 * haven't uploaded a photo.
 *
 * This is a 7-slot subset of the dataviz skill's own validated dark-mode
 * categorical theme (references/palette.md), not a hand-picked set: every
 * color here already cleared that skill's pairwise checks together as one
 * palette (lightness band, chroma floor, CVD separation, normal-vision
 * floor). The one slot dropped from the reference 8 is its pure red — this
 * app already uses red exclusively for `danger`, and a user whose avatar
 * happened to land on red would read as flagged or in an error state, which
 * is a meaning nobody asked their profile picture to carry.
 *
 * Each color also clears 3:1 against WHITE text (checked separately — the
 * skill's own contrast check validates a color used AS text on a surface,
 * which is the opposite of how this palette is used here: as a FILL with
 * white initials on top). 3:1 rather than 4.5:1 because the initials render
 * bold at a size that qualifies as "large text" under WCAG at every avatar
 * size this app uses — see components/Avatar.tsx.
 */
export const avatarPalette = [
  '#3987E5', // blue
  '#D95926', // orange
  '#199E70', // aqua
  '#C98500', // gold
  '#D55181', // magenta
  '#008300', // green
  '#9085E9', // violet
];

/**
 * Quest difficulty tiers.
 *
 * These are a LADDER, not a set of peers — Easy through Ultra is an ordered
 * scale — and the palette encodes that twice over: by hue, and by getting
 * darker and denser as difficulty rises.
 *
 * The second encoding is not decoration. Hard's amber and Extreme's red are
 * very nearly the same colour to a red-green colourblind viewer (about 8% of
 * men): as pure hues they separated by ΔE 0.9, which is indistinguishable.
 * Stepping Extreme's lightness down pulls that to ΔE 15.8, comfortably above
 * the ΔE 8 floor. The tier NAME is always rendered on the badge too, so
 * colour is never the only carrier — but the badge shouldn't need reading to
 * tell a Hard from an Extreme at a glance, and now it doesn't.
 *
 * Lives here rather than in firebase/quests.ts so the whole palette can be
 * seen in one place; quests.ts re-exports it under its old name for the
 * callers that already import TIER_COLOR from there.
 */
export const tierColors = {
  Easy: '#3FDE91',    // green
  Medium: '#619DFF',  // blue
  Hard: '#F5A422',    // amber
  Extreme: '#EB3C2C', // red, a step deeper than Hard
  Ultra: '#B17AE8',   // violet — the "very hard" tier
};

export default colors;
