// The splash sequence — 1.7 seconds, then it gets out of the way.
//
// This runs OVER the app, not instead of it. `expo-splash-screen` holds the
// static native splash while fonts and Firebase's auth check are still in
// flight; the moment that's done this layer takes over and plays. Two reasons
// it's built that way:
//
// 1. A native splash image can't animate. Anything with motion has to be React.
// 2. The app is already mounted and loading UNDERNEATH this. So the 1.7s is
//    spent doing real work, not waiting — by the time the splash lifts, the
//    Dashboard behind it is usually already populated. A splash that delays a
//    ready app is a tax on every launch.
//
// Which is also why `onDone` fires even if the sequence is cut short: if the
// app was slow to boot and the user has already been staring at the static
// native splash for a second, playing another 1.7s on top is punishment. See
// the `budget` prop.

import { useEffect } from 'react';
import { View, Text, StyleSheet, AccessibilityInfo, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  interpolate,
  cancelAnimation,
  useReducedMotion,
  Extrapolation,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { spacing, type as typeScale } from '../theme/tokens';
import { splash as beats, easing } from '../animation/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The chevron. Strokes on from the lower left, up, and over — an upshift.
// Drawn as a path rather than an image so it can be stroked on progressively;
// a PNG can only fade.
//
// Exported because Welcome is the screen this splash dissolves INTO, and Auth
// is one step behind it. They render this same path at its finished state, so
// the handover is a cross-fade of one image rather than a cut between two
// logos that happen to look similar.
export const MARK = 'M8 44 L32 12 L56 44';
export const MARK_VIEWBOX = '0 0 64 56';
/** Stroke weight the mark is drawn at, in viewBox units — so it stays
 *  proportional at any rendered size. */
export const MARK_STROKE = 5;
// Length of that path, near enough. strokeDasharray/-offset animate a line
// "drawing itself" by hiding all of it and then revealing it; the dash needs
// to be at least as long as the path or the tail reappears at the far end.
const MARK_LENGTH = 90;

type SplashProps = {
  onDone: () => void;
  /**
   * Hard ceiling in ms. If the app took a long time to become interactive,
   * pass what's left of the launch budget and the sequence compresses to fit
   * rather than adding its full 1.7s on top.
   */
  budget?: number;
};

export default function Splash({ onDone, budget }: SplashProps) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  // Pinned to the live window rather than inherited from the parent's layout.
  // absoluteFillObject only fills whatever box the parent has ALREADY been
  // given, and on a cold launch the root view's first frame can carry a
  // stale/default size before iOS reports the real one. Centering against that
  // taller box put the lockup visibly low on a short screen (iPhone SE), and it
  // jumped into place a frame later when the true size landed — the "plays at
  // the bottom, then fits to size" report. useWindowDimensions is correct on
  // the first frame and re-renders if it ever changes (rotation, split view).
  const { width: winW, height: winH } = useWindowDimensions();

  const total = Math.max(400, Math.min(beats.total, budget ?? beats.total));
  // Everything below reads its window as a fraction of the FULL 1.7s
  // timeline, so compressing is a matter of running the same 0→1 faster —
  // the steps keep their relative timing instead of the tail being cut off.
  const scale = total / beats.total;

  useEffect(() => {
    if (reduced) {
      t.value = 1;
      const timer = setTimeout(onDone, 350);
      return () => clearTimeout(timer);
    }
    // Linear master clock; each element eases inside its own window. Easing
    // the master too would double-ease every step.
    t.value = withTiming(1, { duration: total });
    // A beat of hold after the last element lands, so the wordmark isn't
    // disappearing at the same instant it finishes arriving.
    const timer = setTimeout(onDone, total + 180 * scale);
    AccessibilityInfo.announceForAccessibility?.('UpShift');
    return () => {
      cancelAnimation(t);
      clearTimeout(timer);
    };
  }, []);

  // start/length are in real milliseconds against the 1.7s reference
  // timeline; both get divided by the same total, so the fractions hold
  // whatever `total` ends up being.
  const window = (start: number, length: number) => {
    'worklet';
    return (p: number) => {
      'worklet';
      const raw = interpolate(
        p,
        [start / beats.total, (start + length) / beats.total],
        [0, 1],
        Extrapolation.CLAMP
      );
      // Ease-out cubic — a close analytic stand-in for the app's
      // cubic-bezier(0.16, 1, 0.3, 1), evaluable inside a worklet.
      return 1 - Math.pow(1 - raw, 3);
    };
  };

  const markW = window(beats.at.mark, beats.dur.mark);
  const wordW = window(beats.at.wordmark, beats.dur.wordmark);
  const lineW = window(beats.at.hairline, beats.dur.hairline);

  // The draw-on. Offset runs from the full path length (nothing visible) to 0
  // (fully drawn).
  const markProps = useAnimatedProps(() => ({
    strokeDashoffset: MARK_LENGTH * (1 - markW(t.value)),
  }));

  const markStyle = useAnimatedStyle(() => ({
    // A whisper of scale as it draws. Without it the mark reads as a diagram
    // being plotted; with it, as something arriving.
    transform: [{ scale: interpolate(markW(t.value), [0, 1], [0.94, 1], Extrapolation.CLAMP) }],
  }));

  const wordStyle = useAnimatedStyle(() => {
    const p = wordW(t.value);
    return {
      opacity: p,
      // Letter-spacing tightening as it lands. Reanimated can't animate
      // letterSpacing on the UI thread reliably across platforms, so this is
      // done as a subtle horizontal scale instead — same read, one property.
      transform: [{ translateY: interpolate(p, [0, 1], [6, 0], Extrapolation.CLAMP) }],
    };
  });

  const lineStyle = useAnimatedStyle(() => {
    const p = lineW(t.value);
    return {
      opacity: interpolate(p, [0, 0.4, 1], [0, 1, 1], Extrapolation.CLAMP),
      transform: [{ scaleX: p }],
    };
  });

  // The whole layer fades out over the last fifth, so it dissolves into the
  // Dashboard rather than being switched off.
  //
  // THIS WAS THE BUG THAT MADE THE SPLASH INVISIBLE. Under reduced motion,
  // above, `t.value` is set straight to 1 rather than animated up to it — but
  // this formula treats t=1 as "fully faded out" (that's what the whole-timeline
  // fade at the end of a NORMAL playback looks like). So a reduced-motion
  // viewer got opacity 0 from the very first frame: the splash was doing
  // everything right and rendering completely transparent the entire time.
  // Every other screen in the app got this right by having reduced motion
  // jump straight to the FINISHED state; this was the one place "finished"
  // and "the number this formula calls 1" didn't mean the same thing.
  const rootStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1 };
    return {
      opacity: interpolate(t.value, [0, 0.05, 0.86, 1], [1, 1, 1, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel="UpShift"
      style={[StyleSheet.absoluteFill, { width: winW, height: winH }, styles.root, rootStyle]}>
      <Animated.View style={markStyle}>
        <Svg width={64} height={56} viewBox={MARK_VIEWBOX}>
          <AnimatedPath
            d={MARK}
            stroke={colors.accent}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={MARK_LENGTH}
            animatedProps={markProps}
          />
        </Svg>
      </Animated.View>

      <Animated.View style={wordStyle}>
        <Text style={lockup.wordmark}>UPSHIFT</Text>
      </Animated.View>

      <Animated.View style={[lockup.hairline, lineStyle]} />
    </Animated.View>
  );
}

/**
 * The lockup's finished geometry, exported so Welcome can render the identical
 * end state. Tracking this loose is the wordmark's whole character — a copy
 * that guessed at it would make the splash-to-Welcome handover read as a jump
 * cut rather than a dissolve.
 */
export const lockup = StyleSheet.create({
  wordmark: {
    ...typeScale.title,
    color: colors.textPrimary,
    letterSpacing: 6,
  },
  hairline: {
    width: 72,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    // Above everything, including any modal that mounted underneath.
    zIndex: 100,
  },
});
