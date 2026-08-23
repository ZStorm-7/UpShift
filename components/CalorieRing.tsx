// The calorie ring — the slowest animation in the app, on purpose.
//
// 940ms after a 220ms delay. Everything else settles in 300–520ms; this takes
// three times as long and starts last, which is exactly what makes it read as
// the headline rather than one more thing arriving. The design's note on it is
// right: it's the number the user opened the app to see.
//
// It draws ONCE PER MOUNT, not on every value change. Logging a 90-calorie
// apple should nudge the ring, not replay the whole ceremony — a celebration
// that fires on every small edit stops being a celebration by lunchtime. So
// the first fill sweeps from zero over 940ms, and every update after that is a
// 520ms retarget from wherever the ring currently is.

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { type as typeScale } from '../theme/tokens';
import { beat, easing } from '../animation/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type CalorieRingProps = {
  value: number;
  goal: number;
  size?: number;
  thickness?: number;
  label?: string;
  /** Ring colour. Defaults to the accent; pass a macro colour to reuse this
   *  for protein/carbs/fat rings. */
  color?: string;
  /**
   * Skip the 940ms first-fill ceremony and use the short retarget from the
   * first frame. For a per-second countdown: the ceremony assumes the value
   * is a total being revealed, and a ring still sweeping up to 60 while the
   * timer has already ticked to 57 is animating a number that isn't true.
   */
  instant?: boolean;
  /**
   * Overrides the caption under the value. Defaults to "of {goal} {label}",
   * which reads correctly for a total and badly for a countdown.
   */
  caption?: string;
  /** Direction of fill. 'down' means the arc empties as the value falls. */
  countdown?: boolean;
};

export function CalorieRing({
  value,
  goal,
  size = 168,
  thickness = 12,
  label = 'kcal',
  color = colors.accent,
  instant = false,
  caption,
}: CalorieRingProps) {
  // The stroke is centred on the path, so the radius has to come in by half
  // the thickness or the ring is clipped by the viewBox.
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Over-goal is real and worth seeing, but a ring can't draw past full — so
  // the ARC clamps at 1 while the NUMBER below it keeps counting. Silently
  // clamping both would be the app lying about what you ate.
  const target = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
  const over = goal > 0 && value > goal;

  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  const hasDrawn = useRef(false);

  useEffect(() => {
    if (reduced) {
      progress.value = target;
      hasDrawn.current = true;
      return;
    }
    if (!hasDrawn.current && !instant) {
      // First paint: the full ceremony.
      progress.value = withDelay(
        beat.ringDelay,
        withTiming(target, { duration: beat.ringFill, easing: easing.standard })
      );
      hasDrawn.current = true;
    } else {
      // Every subsequent change: a quick retarget, no delay.
      progress.value = withTiming(target, { duration: beat.xpBar, easing: easing.standard });
      hasDrawn.current = true;
    }
    return () => cancelAnimation(progress);
  }, [target, reduced, instant]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track. A full circle at low opacity rather than a lighter grey, so
            it works on any surface this lands on. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceRaised}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={over ? colors.xp : color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={arcProps}
          // Rotate so 0% starts at 12 o'clock. SVG circles start at 3 o'clock,
          // and a ring that fills from the right reads as broken.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {Math.round(value).toLocaleString()}
        </Text>
        <Text style={styles.label}>
          {caption ?? (goal > 0 ? `of ${Math.round(goal).toLocaleString()} ${label}` : label)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typeScale.display,
    color: colors.textPrimary,
  },
  label: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
});

export default CalorieRing;
