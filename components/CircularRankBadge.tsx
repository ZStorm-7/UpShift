// A rank badge with the level's progress drawn as a ring around the
// central shield/icon — Apple Watch activity-ring style.
//
// Two arcs are stacked: a full grey track and a partial accent-colored
// progress arc drawn over it, both using SVG's stroke-dasharray trick.
// The percentage is (currentXP / TOTAL_XP_PER_LEVEL). The rank name sits
// below the ring, and the tier % appears above.

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

  return (
    <View style={styles.container}>
      <Text style={[styles.progressLabel, { color: palette.accent }]}>
        {Math.round(clamped * 100)}%
      </Text>

      <View style={{ width: size, height: size }}>
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
        {/* Level numeral sits inside the ring */}
        <View style={[styles.inner, { width: size, height: size }]}>
          <Text style={[styles.rankGlyph, { color: palette.textSecondary, fontSize: size * 0.13 }]}>
            RANK {level}
          </Text>
          <Text style={[styles.levelNumber, { color: palette.textPrimary, fontSize: size * 0.32 }]}>
            {level}
          </Text>
        </View>
      </View>

      <Text style={[styles.rankName, { color: palette.textPrimary }]}>{rankName.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  progressLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 13, letterSpacing: 0.6,
  },
  inner: {
    position: 'absolute',
    top: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  rankGlyph: {
    fontFamily: fontFamily.sansBold,
    letterSpacing: 1.2,
    opacity: 0.7,
    marginBottom: -4,
  },
  levelNumber: {
    fontFamily: fontFamily.sansBlack,
    lineHeight: undefined,
  },
  rankName: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
    letterSpacing: 1,
  },
});
