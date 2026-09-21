// AuthBackground — the layer that makes sign-up and log-in feel like two
// deliberately different screens rather than one form with different words
// on it (see AuthScreen's isSignUp toggle).
//
// Sign-up ("starting something"): a handful of the app's own chevron marks
// (MARK/MARK_VIEWBOX from Splash.tsx — the same glyph the splash draws and
// Welcome/Auth's header already reuse) drift slowly upward and fade out,
// looped and staggered, at low opacity. Motion with a direction: up, like
// leveling up.
//
// Log-in ("welcome back"): a single soft radial glow behind the logo mark,
// breathing between two low opacities on a slow loop. No direction, no
// travel — calm and symmetric, the opposite read from sign-up on purpose.
//
// Both variants stay mounted at all times; AuthScreen crossfades between them
// by animating opacity, so toggling isSignUp never restarts a loop or hard-
// cuts the background (see the crossfade note on the exported component).
// Everything here is palette-driven (accent/accentSoft only) per the
// product constraint: same colors as the rest of the app, different
// composition and motion.
//
// The sign-up/log-in TOGGLE itself (flipping AuthScreen's isSignUp) also
// gets two different "levels" of motion, per the product ask that switching
// between them read as two deliberately different weights, not just two
// different words on the same fade: sign-up's crossfade is longer and adds
// a gentle scale-in (arriving like it's "starting something bigger"),
// log-in's is a quicker, plain opacity fade (a lighter "welcome back" beat).
// See SIGNUP_TRANSITION_MS/LOGIN_TRANSITION_MS below.

import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  cancelAnimation,
  useReducedMotion,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { usePalette, type Palette } from '../theme/themedColors';
import { MARK, MARK_VIEWBOX, MARK_STROKE } from './Splash';
import { duration, easing } from '../animation/motion';

type Variant = 'signup' | 'login';

const FLOAT_MARK_W = 30;
const FLOAT_MARK_H = 26;
// How far a mark travels before it loops back to the bottom, invisible.
const RISE_DISTANCE = 140;
const FLOAT_LOOP_MS = 5200;
const FLOAT_STAGGER_MS = 700;
const MARK_COUNT = 6;

const GLOW_SIZE = 320;
const GLOW_LOOP_MS = 2600;

// The crossfade durations for the sign-up/log-in TOGGLE (distinct from the
// two backgrounds' own ambient loop speeds above). Sign-up gets the app's
// "heavier arrival" duration plus a scale-in; log-in gets the ordinary
// "small state change" duration and no scale — see the file-header note.
const SIGNUP_TRANSITION_MS = duration.slow;
const LOGIN_TRANSITION_MS = duration.fast;
const SIGNUP_SCALE_FROM = 0.94;

/* ------------------------------------------------------------------ *
 * Sign-up: drifting chevrons
 * ------------------------------------------------------------------ */

function FloatingMark({
  x,
  y,
  delay,
  palette,
  reduced,
}: {
  x: number;
  y: number;
  delay: number;
  palette: Palette;
  reduced: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // Static stand-in: parked partway through its rise, faintly visible,
      // no motion — same "ambient texture" read without the loop.
      t.value = 0.5;
      return;
    }
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: FLOAT_LOOP_MS, easing: easing.loop }), -1, false)
    );
    return () => cancelAnimation(t);
  }, [reduced, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.75, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -RISE_DISTANCE], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View style={[styles.floatMark, { left: x, top: y }, style]}>
      <Svg width={FLOAT_MARK_W} height={FLOAT_MARK_H} viewBox={MARK_VIEWBOX}>
        <Path
          d={MARK}
          stroke={palette.accentSoft}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function SignUpBackground({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const { width, height } = useWindowDimensions();

  // Spread across the width, staggered so they don't all rise in lockstep —
  // a field of ambient texture rather than one visible wave.
  const marks = useMemo(
    () =>
      Array.from({ length: MARK_COUNT }, (_, i) => ({
        x: (width / (MARK_COUNT + 1)) * (i + 1) - FLOAT_MARK_W / 2,
        // Started from a spread of heights below the fold, not all from the
        // very bottom, so the loop doesn't read as a single row marching up.
        y: height * (0.55 + 0.5 * ((i * 37) % 100) / 100),
        delay: i * FLOAT_STAGGER_MS,
      })),
    [width, height]
  );

  return (
    <>
      {marks.map((m, i) => (
        <FloatingMark key={i} x={m.x} y={m.y} delay={m.delay} palette={palette} reduced={reduced} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Log-in: breathing glow
 * ------------------------------------------------------------------ */

function LogInBackground({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // Static stand-in: parked at the midpoint of the breathing range —
      // present and calm, matching the "no motion" ask, rather than either
      // extreme of the pulse.
      t.value = 0.5;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: GLOW_LOOP_MS, easing: easing.loop }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.35, 0.7], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[
        styles.glow,
        { left: width / 2 - GLOW_SIZE / 2, top: height * 0.32 - GLOW_SIZE / 2 },
        style,
      ]}>
      <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id="authGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.accent} stopOpacity={0.55} />
            <Stop offset="60%" stopColor={palette.accent} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#authGlow)" />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Exported crossfading container
 * ------------------------------------------------------------------ */

type AuthBackgroundProps = {
  variant: Variant;
};

/**
 * Bottom-most layer of AuthScreen. Both treatments stay mounted at all
 * times and are shown/hidden purely by animating opacity — switching
 * `variant` crossfades one out and the other in over `duration.base`
 * (~380ms) instead of unmounting, which would restart each loop from
 * scratch on every toggle and hard-cut instead of dissolve.
 *
 * `pointerEvents="none"` throughout: this is decoration sitting behind the
 * real form, and must never steal a tap meant for a field or button above
 * it (same reasoning as CalorieRing's center overlay).
 */
export default function AuthBackground({ variant }: AuthBackgroundProps) {
  const palette = usePalette();
  const reduced = useReducedMotion();

  const signUpOpacity = useSharedValue(variant === 'signup' ? 1 : 0);
  const logInOpacity = useSharedValue(variant === 'login' ? 1 : 0);

  useEffect(() => {
    const targetSignUp = variant === 'signup' ? 1 : 0;
    const targetLogIn = variant === 'login' ? 1 : 0;
    if (reduced) {
      // A crossfade IS motion — reduced motion gets an immediate swap
      // instead of a dissolve, for either variant.
      signUpOpacity.value = targetSignUp;
      logInOpacity.value = targetLogIn;
      return;
    }
    // Different durations per variant, not a shared one — see the
    // SIGNUP_TRANSITION_MS/LOGIN_TRANSITION_MS comment above.
    signUpOpacity.value = withTiming(targetSignUp, { duration: SIGNUP_TRANSITION_MS, easing: easing.standard });
    logInOpacity.value = withTiming(targetLogIn, { duration: LOGIN_TRANSITION_MS, easing: easing.standard });
  }, [variant, reduced]);

  const signUpStyle = useAnimatedStyle(() => ({
    opacity: signUpOpacity.value,
    transform: [
      { scale: interpolate(signUpOpacity.value, [0, 1], [SIGNUP_SCALE_FROM, 1], Extrapolation.CLAMP) },
    ],
  }));
  const logInStyle = useAnimatedStyle(() => ({ opacity: logInOpacity.value }));

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, signUpStyle]} pointerEvents="none">
        <SignUpBackground palette={palette} reduced={reduced} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, logInStyle]} pointerEvents="none">
        <LogInBackground palette={palette} reduced={reduced} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatMark: {
    position: 'absolute',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
});
