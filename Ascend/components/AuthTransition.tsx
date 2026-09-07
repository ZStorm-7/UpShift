// AuthTransition — the brief loading screen between an auth action landing
// and the next screen appearing: signing in, signing up, or signing out.
//
// This is deliberately the one place in the app that still uses GearSpinner.
// Everywhere else that used to show a spinner (the app boot) now shows a
// skeleton instead, because the design's own rule is "skeletons over
// spinners" for anything whose shape is knowable in advance — and the
// Dashboard's shape IS knowable, which is why BootSkeleton exists.
//
// A sign-in/sign-up/sign-out transition is the opposite case: there are three
// different possible destinations (Dashboard, Onboarding, Welcome) depending
// on account state, so there is no single shape to preview, and the wait is
// short and genuinely just "an auth call resolving" rather than "content
// that's shaped like something." That's exactly the case the design reserves
// a spinner for.
//
// Paired with utils/timing.ts's withMinDuration so this never appears for
// less than its own animation needs to read as intentional — see that file
// for why a fixed floor matters here.

import { View, StyleSheet } from 'react-native';
import { usePalette } from '../theme/themedColors';
import GearSpinner from './GearSpinner';

export default function AuthTransition() {
  // Themed rather than a hardcoded dark background — this overlay covers
  // whatever screen the user is actually on, in whatever light/dark mode
  // they're in (or that auto mode has picked for the time of day), so a
  // fixed dark bg here looked like a broken flash of the wrong theme
  // during daylight hours.
  const palette = usePalette();
  return (
    <View
      style={[styles.root, { backgroundColor: palette.bg }]}
      accessibilityLabel="Loading"
      accessibilityLiveRegion="polite">
      <GearSpinner size={64} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});
