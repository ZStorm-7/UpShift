// StreakSpark — the daily check-in button.
//
// The interaction has three beats, and the ordering matters more than any
// individual value:
//
//   pressIn   → shrink immediately (spring.press). Zero delay. This is the
//               single most important frame in the whole component: the finger
//               is down, and the UI must acknowledge it before anything else
//               happens. Anything slower than ~90ms reads as lag.
//   pressOut  → spring back with overshoot (spring.release). The overshoot is
//               what makes it feel like a physical button releasing rather than
//               an opacity change.
//   confirm   → particle burst outward from the centre.
//
// Springs throughout rather than timings, because a spring interrupted
// mid-flight resolves from wherever it currently is. Tap twice quickly with
// timing-based animation and the second tap snaps to the start; with a spring
// it just changes direction, which is what real objects do.

import { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
  cancelAnimation,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { duration, easing, spring } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * Particle
 * ------------------------------------------------------------------ */

const PARTICLE_COUNT = 10;
const BURST_RADIUS = 46;

type ParticleProps = {
  /** Index within the burst, used to derive the angle. */
  index: number;
  onDone?: () => void;
};

function Particle({ index, onDone }: ParticleProps) {
  const t = useSharedValue(0);

  // Angle is derived from the index, not randomised. Two reasons: the burst is
  // perfectly even (random angles clump, and a clumped burst looks like a
  // mistake), and there's no Math.random(), so the animation is identical every
  // time — which matters when you're trying to tune it.
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
  // Alternating travel distance gives the burst depth without randomness.
  const distance = BURST_RADIUS * (index % 2 === 0 ? 1 : 0.68);
  // Alternating colours: gold for reward, accent for the app's voice.
  const color = index % 3 === 0 ? colors.accent : colors.xp;
  const size = index % 2 === 0 ? 6 : 4;

  useEffect(() => {
    t.value = withTiming(1, { duration: 620, easing: easing.enter }, finished => {
      if (finished && onDone) runOnJS(onDone)();
    });
    return () => cancelAnimation(t);
  }, []);

  const style = useAnimatedStyle(() => {
    const travelled = interpolate(t.value, [0, 1], [0, distance], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t.value, [0, 0.25, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: Math.cos(angle) * travelled },
        { translateY: Math.sin(angle) * travelled },
        // Shrinking as it flies makes the burst dissipate instead of just
        // vanishing at full size.
        { scale: interpolate(t.value, [0, 0.3, 1], [0.4, 1, 0.2], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * StreakSpark
 * ------------------------------------------------------------------ */

type StreakSparkProps = {
  /** Current streak count, shown on the button. */
  streak: number;
  label: string;
  /** Called on a completed tap. Fire your Firestore write from here. */
  onCheckIn: () => void;
  /** Already checked in this cycle — the button goes quiet. */
  done?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function StreakSpark({
  streak,
  label,
  onCheckIn,
  done = false,
  style,
}: StreakSparkProps) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const flameLift = useSharedValue(0);

  // A burst is a keyed set of particles. Keying by burst id means a second
  // check-in creates a fresh set rather than reusing mounted ones, which would
  // otherwise ignore the new animation entirely.
  const [bursts, setBursts] = useState<number[]>([]);
  const nextBurst = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimation(scale);
      cancelAnimation(glow);
      cancelAnimation(flameLift);
    };
  }, []);

  const handlePressIn = useCallback(() => {
    if (done) return;
    // No delay, no timing curve — straight to a spring. This frame is the
    // whole latency budget.
    scale.value = withSpring(0.94, spring.press);
    glow.value = withTiming(1, { duration: duration.fast, easing: easing.revUp });
  }, [done]);

  const handlePressOut = useCallback(() => {
    if (done) return;
    scale.value = withSpring(1, spring.release);
    glow.value = withTiming(0, { duration: duration.base, easing: easing.exit });
  }, [done]);

  const handlePress = useCallback(() => {
    if (done) return;

    // The flame kicks up as the burst leaves, so the particles look like
    // they're coming off the flame rather than out of the button's centre.
    flameLift.value = withSpring(1, spring.pop, () => {
      flameLift.value = withSpring(0, spring.settle);
    });

    const id = nextBurst.current++;
    setBursts(current => [...current, id]);

    onCheckIn();
  }, [done, onCheckIn]);

  const removeBurst = useCallback((id: number) => {
    setBursts(current => current.filter(b => b !== id));
  }, []);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Border brightens under the finger. interpolateColor gives a continuous
  // blend rather than a threshold flip — a border that snaps between two
  // colours mid-press looks like a state change, not a response to touch.
  //
  // Colour rather than shadow on purpose: a drop shadow under a card on a
  // near-black background is invisible, so animating one costs frames and
  // buys nothing.
  const surfaceStyle = useAnimatedStyle(() => ({
    borderColor: done
      ? colors.border
      : interpolateColor(glow.value, [0, 1], [colors.accentBorder, colors.accent]),
    backgroundColor: done ? colors.surface : colors.accentSoft,
  }));

  const flameStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(flameLift.value, [0, 1], [0, -8], Extrapolation.CLAMP) },
      { scale: interpolate(flameLift.value, [0, 1], [1, 1.35], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={[styles.wrapper, style]}>
      {/* Particles are absolutely positioned at the centre and fly outward.
          They sit OUTSIDE the Pressable so the button's scale animation
          doesn't drag them along with it mid-flight. */}
      <View style={styles.burstOrigin} pointerEvents="none">
        {bursts.map(id => (
          <View key={id} style={styles.burstLayer} pointerEvents="none">
            {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
              <Particle
                key={i}
                index={i}
                // Only the last particle reports back, so one burst triggers
                // one state update instead of ten.
                onDone={i === PARTICLE_COUNT - 1 ? () => removeBurst(id) : undefined}
              />
            ))}
          </View>
        ))}
      </View>

      <Animated.View style={buttonStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          disabled={done}
          // Generous hit slop: the visual button is small, but the tappable
          // area shouldn't be.
          hitSlop={10}>
          <Animated.View style={[styles.button, surfaceStyle]}>
            <Animated.Text style={[styles.flame, flameStyle]}>
              {done ? '✓' : '🔥'}
            </Animated.Text>
            <View>
              <Text style={[styles.streak, done && styles.streakDone]}>{streak}</Text>
              <Text style={styles.label}>{label}</Text>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstOrigin: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  burstLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
  },
  flame: {
    fontSize: 26,
  },
  streak: {
    ...type.metric,
    color: colors.accent,
  },
  streakDone: {
    color: colors.textSecondary,
  },
  label: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});
