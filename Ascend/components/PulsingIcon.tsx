// PulsingIcon — a slow breathing scale+opacity loop around an Ionicons glyph,
// for a small badge that's currently active and worth a quiet ongoing nod
// (a live streak) without being a call-to-action the way PulseRing's
// expanding ring is ("something is WAITING on you"). Same restrained,
// heartbeat-not-alarm cadence as PulseRing and the Glow Button — reused
// rather than invented, so every "this breathes" moment in the app already
// looks like it belongs to the same family.

import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  useReducedMotion,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { beat, easing } from '../animation/motion';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

type PulsingIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  /** Set false to hold the icon still — e.g. a streak of 0. */
  active?: boolean;
};

export default function PulsingIcon({ name, size, color, active = true }: PulsingIconProps) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !active) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: beat.pulseLoop, easing: easing.loop }),
        withTiming(0, { duration: beat.pulseLoop, easing: easing.loop })
      ),
      -1,
      false
    );
    return () => cancelAnimation(t);
  }, [active, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.8, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.value, [0, 1], [1, 1.12], Extrapolation.CLAMP) }],
  }));

  return <AnimatedIonicons name={name} size={size} color={color} style={style} />;
}
