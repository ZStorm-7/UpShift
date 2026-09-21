// ConfettiBurst — a one-shot radial particle burst for a genuine standout
// moment (a personal-best workout). Generalized from StreakSpark's own
// "confirm" burst rather than a new invention: same deterministic-angle,
// no-randomness particle technique, just parameterized (count/radius/colors)
// instead of hardcoded to one button's confirm tap.
//
// Fires once when mounted, then just sits invisible (particles at opacity 0)
// until the caller unmounts it — mount this conditionally on the moment
// it's celebrating (e.g. `{perfect && <ConfettiBurst .../>}`), not
// persistently with a `play` prop, so there's no state to forget to reset.

import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  cancelAnimation,
  Extrapolation,
  useReducedMotion,
} from 'react-native-reanimated';
import { easing } from '../animation/motion';

type ConfettiBurstProps = {
  /** Alternated across particles so the burst reads as more than one color. */
  colors: string[];
  count?: number;
  radius?: number;
};

function Particle({ index, count, radius, color, size }: { index: number; count: number; radius: number; color: string; size: number }) {
  const t = useSharedValue(0);
  const angle = (index / count) * Math.PI * 2;
  const distance = radius * (index % 2 === 0 ? 1 : 0.68);

  useEffect(() => {
    t.value = withTiming(1, { duration: 680, easing: easing.enter });
    return () => cancelAnimation(t);
  }, []);

  const style = useAnimatedStyle(() => {
    const travelled = interpolate(t.value, [0, 1], [0, distance], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t.value, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: Math.cos(angle) * travelled },
        { translateY: Math.sin(angle) * travelled },
        { scale: interpolate(t.value, [0, 0.3, 1], [0.4, 1, 0.2], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

export default function ConfettiBurst({ colors, count = 14, radius = 70 }: ConfettiBurstProps) {
  const reduced = useReducedMotion();

  // Reduced motion skips the burst entirely rather than jumping to its end
  // state — unlike a takeover's ring or numeral, a burst carries no
  // information; it's pure flourish, so "off" is the correct reduced-motion
  // behavior, not "instant."
  if (reduced) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Particle
          key={i}
          index={i}
          count={count}
          radius={radius}
          color={colors[i % colors.length]}
          size={i % 2 === 0 ? 7 : 5}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -3,
    marginLeft: -3,
  },
});
