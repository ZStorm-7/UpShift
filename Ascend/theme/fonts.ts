// Typefaces.
//
// The Claude Design mock sets every headline, every section title and every
// big numeral in a bold serif — "Good morning, Marcus", "Daily Quests",
// "Athlete", "1,160". Body copy, labels and buttons are a geometric sans.
// That pairing is most of what makes the mock look designed rather than
// defaulted, and running the app on the system font was the single biggest
// reason it "didn't look like the screenshots".
//
// The mock's serif is Zodiak and its sans is Satoshi, both from Fontshare.
// Neither is on Google Fonts, and Fontshare files have to be downloaded by
// hand. So this uses the closest Google-hosted equivalents, which install
// with npm and need no manual asset wrangling:
//
//   Zodiak   → Fraunces          — same species of contemporary bold serif:
//                                  sturdy bracketed serifs, moderate contrast,
//                                  a little quirk in the details. Fraunces is
//                                  slightly warmer; at display sizes and bold
//                                  weights the two read as siblings.
//   Satoshi  → Plus Jakarta Sans — geometric, generous apertures, the same
//                                  slightly-squared roundness.
//
// If you ever want the real thing: drop Zodiak-Bold.ttf and Satoshi-*.ttf into
// assets/fonts, swap the names below, and nothing else in the app changes —
// every screen reads its family from the `type` scale in tokens.ts, never by
// naming a font directly.
//
// ── Why families and not weights ──
//
// React Native does NOT synthesise weight for custom fonts the way a browser
// does. `fontFamily: 'Fraunces'` + `fontWeight: '700'` gets you Fraunces
// Regular on Android and a fake-bolded smear on some web engines. Each weight
// is its own family name, which is why the constants below are spelled out
// individually and why the type scale sets a family rather than a weight.

import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';

/**
 * Family names, referenced only by the type scale in tokens.ts.
 *
 * Kept as a const object rather than loose strings so a typo is a compile
 * error instead of a silent fallback to the system font — which is exactly
 * the failure that is invisible in development and obvious in a screenshot.
 */
export const fontFamily = {
  /** The display serif. Headlines, section titles, big numerals. */
  serif: 'Fraunces_700Bold',
  /** A half-step down, for serif text that shouldn't shout. */
  serifSemi: 'Fraunces_600SemiBold',

  /** Body copy and anything that has to stay legible small. */
  sans: 'PlusJakartaSans_500Medium',
  sansSemi: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  sansBlack: 'PlusJakartaSans_800ExtraBold',

  /**
   * Instrument Serif/Sans — used only by the minimalist Dashboard proof of
   * concept (theme/minimal.ts, components/dashboardMinimal.tsx). Kept as its
   * own pair rather than reused across the app: Fraunces/Plus Jakarta is the
   * shipped identity everywhere else, and mixing the two pairings on one
   * screen would read as an unfinished migration rather than a deliberate
   * alternate direction.
   */
  editorialSerif: 'InstrumentSerif_400Regular',
  editorialSerifItalic: 'InstrumentSerif_400Regular_Italic',
  editorialSans: 'InstrumentSans_400Regular',
  editorialSansMedium: 'InstrumentSans_500Medium',
  editorialSansSemi: 'InstrumentSans_600SemiBold',
  editorialSansBold: 'InstrumentSans_700Bold',
} as const;

/**
 * Loads every face the app uses.
 *
 * Returns [loaded, error]. App.tsx holds the splash until this is true, which
 * is the whole reason the splash exists at 1.7s: fonts, the Firebase auth
 * check and the first Firestore read all happen underneath it, so the sequence
 * is spent doing work rather than waiting.
 *
 * A font error is deliberately NOT fatal. Losing the serif makes the app look
 * wrong; refusing to start makes it useless. On error the app renders in the
 * system font and everything still works.
 */
export function useAppFonts() {
  return useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
}
