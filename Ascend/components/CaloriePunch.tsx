// CaloriePunch — the reward beat when a food item gets logged.
//
// Two things happen at once, and the fact that they're simultaneous is the
// point: the calorie ring absorbs a hit (scale punch + a ring pulse travelling
// outward), and the XP earned floats up off it and fades. One reads as impact,
// the other as reward. Split them apart in time and the causality is lost.
//
// Kept deliberately cheap. This fires on every logged item, possibly several
// times in a few seconds, so nothing here allocates on the JS thread per frame
// — everything is shared values and worklets.

import { useEffect, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  interpolate,
  cancelAnimation,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, radius, type } from '../theme/tokens';
import { duration, easing, spring } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * FloatingXP — the "+250 XP" that rises and fades
 * ------------------------------------------------------------------ */

type FloatingXPProps = {
  amount: number;
  /** Called once the flight finishes, so the parent can drop it from state. */
  onDone: () => void;
  /** Horizontal nudge, so several at once don't stack in one column. */
  offsetX?: number;
};

function FloatingXP({ amount, onDone, offsetX = 0 }: FloatingXPProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: 1100, easing: easing.enter },
      finished => {
        // runOnJS because `finished` arrives on the UI thread, and calling a
        // React setState from there directly is undefined behaviour.
        if (finished) runOnJS(onDone)();
      }
    );
    return () => cancelAnimation(progress);
  }, []);

  const style = useAnimatedStyle(() => {
    // Rises 54px. Fades in fast, holds, then fades out — a label that starts
    // fading immediately is unreadable, which defeats the purpose of telling
    // the user what they earned.
    const translateY = interpolate(progress.value, [0, 1], [0, -54], Extrapolation.CLAMP);
    const opacity = interpolate(progress.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    // A slight overshoot in scale at the start gives it a "pop off the surface"
    // quality rather than sliding up like a tooltip.
    const scale = interpolate(progress.value, [0, 0.2, 1], [0.7, 1.1, 1], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }, { translateX: offsetX }, { scale }],
    };
  });

  return (
    <Animated.View style={[styles.floatingWrap, style]} pointerEvents="none">
      <Text style={styles.floatingText}>+{amount} XP</Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * CaloriePunch — the ring itself
 * ------------------------------------------------------------------ */

export type CaloriePunchHandle = {
  /** Fire the animation. Pass the XP earned to float a label with it. */
  punch: (xp?: number) => void;
};

type CaloriePunchProps = {
  /** 0–1. The ring fills to this. */
  progress: number;
  /** Big number in the middle — remaining calories, typically. */
  value: string;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Receives the imperative handle. */
  onReady?: (handle: CaloriePunchHandle) => void;
};

export default function CaloriePunch({
  progress,
  value,
  label,
  size = 132,
  style,
  onReady,
}: CaloriePunchProps) {
  const punchScale = useSharedValue(1);
  const pulseRing = useSharedValue(0);
  const fill = useSharedValue(progress);

  // Each floating label needs its own identity so React can key them, and so
  // two rapid logs animate independently instead of the second restarting the
  // first.
  const [flights, setFlights] = useState<{ id: number; amount: number; offsetX: number }[]>([]);
  const nextId = useRef(0);

  // The ring animates to a new fill whenever the real number changes, so
  // logging food visibly moves the ring rather than teleporting it.
  useEffect(() => {
    fill.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: duration.slow,
      easing: easing.revUp,
    });
  }, [progress]);

  const punch = useCallback((xp?: number) => {
    // Sequence, not a single spring: compress first, THEN overshoot. A spring
    // straight to 1.08 looks like a swell; compressing first is what makes it
    // read as absorbing a hit.
    punchScale.value = withSequence(
      withTiming(0.93, { duration: duration.instant, easing: easing.exit }),
      withSpring(1, spring.pop)
    );

    // The travelling ring. Reset to 0 before running so a second punch
    // restarts it rather than being swallowed while the first is still out.
    pulseRing.value = 0;
    pulseRing.value = withTiming(1, { duration: 620, easing: easing.enter });

    if (xp && xp > 0) {
      const id = nextId.current++;
      // Deterministic spread rather than random: successive labels step
      // -14, +14, -14… so two simultaneous logs never overlap, and there's no
      // Math.random() to make the animation unreproducible.
      const offsetX = (id % 2 === 0 ? -1 : 1) * 14;
      setFlights(current => [...current, { id, amount: xp, offsetX }]);
    }
  }, []);

  useEffect(() => {
    onReady?.({ punch });
    return () => {
      cancelAnimation(punchScale);
      cancelAnimation(pulseRing);
      cancelAnimation(fill);
    };
  }, [punch, onReady]);

  const removeFlight = useCallback((id: number) => {
    setFlights(current => current.filter(f => f.id !== id));
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: punchScale.value }],
  }));

  // Expands past the ring's edge while fading — a shockwave. Scale and opacity
  // are inverse so it dissipates as it grows, which is how a real one behaves.
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseRing.value, [0, 0.1, 1], [0, 0.55, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(pulseRing.value, [0, 1], [1, 1.45], Extrapolation.CLAMP) },
    ],
  }));

  // The fill arc, done with a rotating half-disc rather than SVG so this
  // component has no svg dependency — it can drop into any list.
  const fillStyle = useAnimatedStyle(() => ({
    height: `${interpolate(fill.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {/* Shockwave, behind everything. */}
      <Animated.View
        style={[
          styles.pulse,
          { width: size, height: size, borderRadius: size / 2 },
          pulseStyle,
        ]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2 },
          ringStyle,
        ]}>
        {/* Fill rises from the bottom. Clipped by the ring's overflow:hidden,
            so a rectangle reads as a filled arc. */}
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />

        <View style={styles.readout}>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Animated.View>

      {flights.map(f => (
        <FloatingXP
          key={f.id}
          amount={f.amount}
          offsetX={f.offsetX}
          onDone={() => removeFlight(f.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  ring: {
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.accentSoft,
  },
  readout: {
    alignItems: 'center',
  },
  value: {
    ...type.metric,
    color: colors.textPrimary,
  },
  label: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  floatingWrap: {
    position: 'absolute',
    backgroundColor: colors.xpSoft,
    borderWidth: 1,
    borderColor: colors.xp,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  floatingText: {
    ...type.label,
    color: colors.xp,
  },
});
