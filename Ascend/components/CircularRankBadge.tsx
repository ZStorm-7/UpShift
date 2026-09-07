// A rank badge with the level's progress drawn as a ring around the
// central level number — Apple Watch activity-ring style.
//
// Simplified from an earlier version that also drew a small "RANK N"
// label inside the ring above the number — dropped because it duplicated
// the rank NAME already shown below the ring (level number vs. rank name
// are two different things, and showing both a numeric "RANK 3" chip and
// a big "3" in the same small circle read as redundant, not informative).
//
// Every text element here uses an explicit marginTop rather than a flex
// `gap`, on purpose: `gap` support varies across RN/RN-Web versions and
// silently collapsing to 0 would stack this badge's ring, rank name, and
// whatever the caller renders below it (streak line, next-rank line) with
// no breathing room between them. Explicit margins can't silently vanish
// the same way.

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';

type Props = {
  level: number;                // 1..∞
  progress: number;             // 0..1 (currentXP / TOTAL_XP_PER_LEVEL)
  rankName: string;             // e.g. "ELITE"
  size?: number;                // total diameter — default 140
};

export default function CircularRankBadge({ level, progress, rankName, size = 140 }: Props) {
  const palette = usePalette();
  const strokeWidth = Math.round(size * 0.075);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);
  // NutritionScreen's identical ring+label overlap took three disproven
  // theories (missing lineHeight, stroke-cap clearance, accessibility text
  // scaling) before landing on "stop guessing the exact number, make the gap
  // too big to matter." Applying the same oversized, deliberately
  // unreasonable gap here as a precaution — this component wasn't confirmed
  // broken the same way, but it's the exact same arc-starts-at-12-o'clock,
  // label-stacked-above shape, on the same platform.
  const RING_TOP_GAP = 12;

  return (
    <View style={styles.container}>
      <Text
        style={[styles.progressLabel, { color: palette.accentText }]}
        // See NutritionScreen's ringHeader for why this is capped: iOS's
        // "Larger Text" accessibility setting can scale system text far
        // beyond normal Dynamic Type, which is what was actually breaking
        // this exact ring-adjacent-label layout — not a spacing problem.
        maxFontSizeMultiplier={1.3}>
        {Math.round(clamped * 100)}%
      </Text>

      {/* Extra marginTop, not overflow:'hidden'. This ring's progress arc has
          strokeLinecap="round" and starts at the very top (rotate(-90°)), so
          its rounded tip can bulge up to strokeWidth/2 above this box's own
          top edge and paint over progressLabel above it — clipping it with
          overflow:'hidden' stops that, but on a real device it also broke
          the arc's own rendering (see CalorieRing.tsx's wrap comment for
          why). The gap below solves the same overlap without touching how
          this view composites its SVG child. */}
      <View style={{ width: size, height: size, marginTop: RING_TOP_GAP }}>
        <Svg width={size} height={size}>
          {/* Track — full circle, low-contrast */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={palette.divider}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress — starts at 12 o'clock (rotated -90°), grows clockwise */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={palette.accent}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        {/* Level numeral sits inside the ring — the only thing in there now. */}
        <View style={[styles.inner, { width: size, height: size }]} pointerEvents="none">
          <Text
            style={[styles.levelNumber, { color: palette.textPrimary, fontSize: size * 0.34 }]}
            numberOfLines={1}>
            {level}
          </Text>
        </View>
      </View>

      <Text
        style={[styles.rankName, { color: palette.textPrimary, opacity: 1 }]}
        numberOfLines={1}>
        {rankName.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  progressLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 13,
    // Explicit, matching tokens.ts's bodySm (13/18) — see NutritionScreen's
    // ringHeader for the full story: without this, the box height this Text
    // occupies comes from the font file's own raw metrics, which read
    // differently on iOS than a browser's approximation. This label sits
    // directly above a fixed-size ring stacked via marginTop, the exact
    // shape of bug that let the ring overlap the text below it.
    lineHeight: 18,
    letterSpacing: 0.6,
  },
  inner: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    fontFamily: fontFamily.sansBlack,
  },
  rankName: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
    // Explicit for the same reason as progressLabel above — this one has no
    // fixed-size sibling immediately below it to overlap, so it's lower risk,
    // but there's no reason to leave it as the one un-pinned text style here.
    lineHeight: 26,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
});
