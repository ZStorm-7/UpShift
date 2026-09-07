// BootSkeleton — what fills the screen between the splash lifting and the
// Dashboard having data.
//
// This replaced a full-screen animated gear spinner, for the reason the design
// notes give directly: "Skeletons over spinners: the Dashboard reads from
// Firebase, so show the layout's shape immediately."
//
// The argument for a skeleton over a spinner is not really about taste. A
// spinner communicates one bit — "wait" — and it communicates it in the same
// place the splash just finished performing, so a slow auth check reads as the
// splash having collapsed into a loading screen. A skeleton communicates the
// shape of what's coming, which means the arrival is a fill rather than a
// replace: nothing moves when the real data lands, because the boxes were
// already the right size in the right places.
//
// Which is also the constraint that matters when editing this file. Every
// block below is sized to match its real counterpart on the Dashboard. If the
// Dashboard's cards change height, these have to change with them, or the
// layout will visibly jump at the exact moment the app is trying to look
// composed.
//
// One deliberate omission: there is no text in here, not even "Loading". The
// skeleton is announced to screen readers once, as a live region, and left
// silent otherwise — a caption that appears for 300ms and vanishes is noise in
// a screen reader and clutter on screen.

import { View, StyleSheet } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, layout } from '../theme/tokens';
import { Shimmer } from './anim';

/** Heights lifted from the real Dashboard cards, so nothing shifts on fill. */
const GREETING_H = 34;
const LEVEL_CARD_H = 116;
const QUEST_CARD_H = 60;
const STAT_CARD_H = 78;
const WATER_CARD_H = 132;

export default function BootSkeleton() {
  // Themed. This is rendered by RootNavigator, inside ThemeProvider — unlike
  // App.tsx's OWN pre-font boot view (which really does precede the theme
  // and has to stay a fixed dark colour), this one has a real palette
  // available and had simply never called usePalette(), so its background
  // stayed dark-themed regardless of the user's light/dark setting.
  const palette = usePalette();
  return (
    <View
      style={[styles.root, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your dashboard"
      accessibilityLiveRegion="polite">
      {/* Greeting */}
      <Shimmer width="72%" height={GREETING_H} radius={radius.sm} />

      {/* Level card */}
      <Shimmer width="100%" height={LEVEL_CARD_H} radius={radius.lg} />

      {/* "Daily Quests" header */}
      <View style={styles.sectionHeader}>
        <Shimmer width={128} height={20} radius={radius.sm} />
        <Shimmer width={64} height={14} radius={radius.sm} />
      </View>

      {/* Three quest cards. Separate blocks with real gaps between them,
          matching the mock's one-card-per-quest layout — a single tall block
          here would be a skeleton of a design the app doesn't have. */}
      {[0, 1, 2].map(i => (
        <Shimmer key={i} width="100%" height={QUEST_CARD_H} radius={radius.lg} />
      ))}

      {/* Two stat cards, side by side */}
      <View style={styles.statRow}>
        <View style={styles.statHalf}>
          <Shimmer width="100%" height={STAT_CARD_H} radius={radius.lg} />
        </View>
        <View style={styles.statHalf}>
          <Shimmer width="100%" height={STAT_CARD_H} radius={radius.lg} />
        </View>
      </View>

      {/* Water card */}
      <Shimmer width="100%" height={WATER_CARD_H} radius={radius.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // backgroundColor is applied inline from the palette.
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    // Roughly where the greeting sits once the safe-area inset is applied on
    // the real screen. Close enough that the first block doesn't visibly jump.
    paddingTop: spacing.xxxl * 2,
    gap: layout.gap,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    gap: layout.gap,
  },
  statHalf: {
    flex: 1,
  },
});
