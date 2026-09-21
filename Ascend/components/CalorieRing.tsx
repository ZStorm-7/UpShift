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
import { usePalette } from '../theme/themedColors';
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
  color,
  instant = false,
  caption,
}: CalorieRingProps) {
  // Themed, not the static dark-only `colors` import this used to use — that
  // hardcoded near-white text/track colors regardless of the user's actual
  // light/dark setting, which is why the ring's number and caption were
  // unreadable (near-white on a light background) in light mode.
  const palette = usePalette();
  const ringColor = color ?? palette.accent;

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
          stroke={palette.surfaceRaised}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={over ? palette.xp : ringColor}
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
        <Text
          style={[styles.value, { color: palette.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          // adjustsFontSizeToFit already keeps this contained by shrinking
          // to its available width, but the cap gives it a sane ceiling to
          // shrink FROM under iOS's "Larger Text" accessibility scaling
          // rather than starting from an enormous requested size.
          maxFontSizeMultiplier={1.5}
          // Floor on how far adjustsFontSizeToFit is allowed to shrink —
          // without this, a genuinely tight fit (a 6-digit calorie total on
          // the smallest supported ring size) can shrink toward 0, which
          // reads as "the text disappeared" rather than "the text is small."
          minimumFontScale={0.6}>
          {Math.round(value).toLocaleString()}
        </Text>
        <Text
          style={[styles.label, { color: palette.textSecondary }]}
          numberOfLines={1}
          // This caption has no adjustsFontSizeToFit guard, and it's
          // absolutely positioned over the ring with nothing clipping it —
          // uncapped, "Larger Text" accessibility scaling could grow it well
          // outside the ring's circle instead of just breaking a stacked
          // layout the way the header text did.
          maxFontSizeMultiplier={1.3}>
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
    // NOT overflow:'hidden'. That was tried as a fix for the round stroke
    // cap's tip bleeding above this box (see git history / conversation) —
    // it stopped the bleed, but on-device it also made the animated arc AND
    // the caption text disappear entirely. Reanimated drives the arc's
    // strokeDashoffset via a direct UI-thread mutation of the native SVG
    // layer, and clipping this view's bounds appears to break that
    // compositing path on iOS rather than just trimming the overflow. The
    // fix for the original overlap now lives one level up, as extra spacing
    // between this ring and whatever sits above it — see NutritionScreen's
    // ringWrap and CircularRankBadge's ring container.
  },
  center: {
    // NOT StyleSheet.absoluteFillObject — spreading it here silently
    // produced no top/left/right/bottom on this RN/Expo version (the same
    // issue noted elsewhere in this codebase, e.g. components/anim.tsx),
    // which is exactly why this text rendered BELOW the ring on iOS instead
    // of centered over it: without those four properties this View has no
    // absolute positioning at all, so it just flows in normal layout order
    // after the <Svg>. Written out explicitly instead, which is the current
    // correct way to get the same "fill the parent" box.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Both belt-and-braces against a SECOND, separate compositing bug from
    // the one above: on Android specifically, a plain sibling View stacked
    // after a react-native-svg element doesn't reliably paint on top of it
    // just because it comes later in JSX — Android's view-flattening
    // optimization can leave the SVG's native surface painted last
    // regardless of tree order, which reads as this text being invisible
    // rather than merely mispositioned. `elevation` forces Android to give
    // this View its own paint layer above the SVG's; `zIndex` is the
    // equivalent for iOS/web, where sibling order already works but an
    // explicit zIndex costs nothing and guards against the same class of
    // bug if a future ancestor style changes stacking context.
    elevation: 2,
    zIndex: 2,
  },
  value: {
    ...typeScale.display,
  },
  label: {
    ...typeScale.bodySm,
  },
});

export default CalorieRing;
