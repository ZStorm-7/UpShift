// Cinematic screen transitions for UpShift.
//
// ── Which API this uses, and why ────────────────────────────────────────────
//
// React Navigation has two stacks. `native-stack` (what App.tsx currently
// uses) hands transitions to the platform: fast and free, but the animation is
// UIViewController/Fragment-owned, so there is no interpolator to customise —
// `animation` accepts a handful of presets and that's the extent of it.
//
// A custom transition therefore needs the JS `@react-navigation/stack`, whose
// `cardStyleInterpolator` gives you the raw progress values. That is what this
// file provides. The interpolations are driven by React Navigation's own
// Animated values, which are already on the native thread — so this hits 60fps
// without Reanimated being involved at all. Reanimated is the right tool for
// gestures and loops (see the components), but for screen transitions the
// interpolator IS the native-thread path, and adding a second animation
// library on top would only add a bridge hop.
//
// If you'd rather not swap navigators, `ScreenTransition` in
// components/anim.tsx gives a similar effect on the content of a native-stack
// screen. It's not quite the same thing — it can't scale the OUTGOING screen,
// because that screen belongs to the platform — but it's a one-line change.
//
// ── The effect ──────────────────────────────────────────────────────────────
//
// Entering: slides in from the right, starts slightly small and grows to full
// size, fading up. Exiting: stays put but scales *down* and dims, so it reads
// as receding into the background rather than being shoved off-screen. The
// combination is what makes it feel like depth instead of a slide.

import { StackCardInterpolationProps, StackCardStyleInterpolator } from '@react-navigation/stack';
import { Easing } from 'react-native';
import { duration } from './motion';

/**
 * The main transition. Use for forward progress through the app — Dashboard →
 * Workout, Workout → Summary.
 *
 * `current.progress` runs 0→1 as this screen arrives. `next.progress` runs 0→1
 * as a screen arrives ON TOP of it, which is what lets one interpolator
 * describe both roles: a screen is "entering" and "being covered" at different
 * moments in its life, and both are handled here.
 */
export const cinematicInterpolator: StackCardStyleInterpolator = ({
  current,
  next,
  inverted,
  layouts: { screen },
}: StackCardInterpolationProps) => {
  // Horizontal travel for the arriving screen. Only 12% of the screen width,
  // not the full 100% of a stock slide: a long slide draws attention to the
  // movement itself, while a short one plus a scale reads as the new screen
  // rising toward you. Cheaper on the eye, and it makes the transition feel
  // faster than it is.
  const translateX = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [screen.width * 0.12, 0],
    extrapolate: 'clamp',
  });

  // Entering screen grows from 96% to 100%.
  const enterScale = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
    extrapolate: 'clamp',
  });

  // Fade completes at 60% of the transition, ahead of the movement. Opacity
  // that finishes with the motion makes the screen look like it's still
  // arriving after it has stopped; finishing early makes it look decisive.
  const enterOpacity = current.progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });

  // The outgoing screen. `next` is undefined when nothing is on top of this
  // screen, so both fall back to the resting value.
  const exitScale = next
    ? next.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.92],
        extrapolate: 'clamp',
      })
    : 1;

  // Dimmed rather than faded to transparent — a screen you can see through to
  // the black background looks broken, a screen that darkens looks behind.
  const exitOpacity = next
    ? next.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.35],
        extrapolate: 'clamp',
      })
    : 1;

  return {
    cardStyle: {
      transform: [
        // inverted flips the sign for right-to-left locales. UpShift ships in
        // five languages, so this matters.
        { translateX: inverted ? (translateX as any) : translateX },
        { scale: next ? exitScale : enterScale },
      ],
      opacity: next ? exitOpacity : enterOpacity,
    },
    // A scrim over the receding screen deepens the sense of one thing being
    // behind another. Subtle on purpose — at higher values it reads as a modal.
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.25],
        extrapolate: 'clamp',
      }),
    },
  };
};

/**
 * A heavier variant for the payoff moment — landing on the Workout Summary.
 *
 * Same grammar, more of it: the summary comes up from below rather than the
 * side, and the screen it covers falls further back. Reserve this for the one
 * or two screens that are meant to feel like an achievement, because if
 * everything is cinematic then nothing is.
 */
export const revealInterpolator: StackCardStyleInterpolator = ({
  current,
  next,
  layouts: { screen },
}: StackCardInterpolationProps) => {
  const translateY = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [screen.height * 0.18, 0],
    extrapolate: 'clamp',
  });

  const scale = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
    extrapolate: 'clamp',
  });

  const opacity = current.progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });

  const exitScale = next
    ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88], extrapolate: 'clamp' })
    : 1;

  return {
    cardStyle: {
      transform: [{ translateY }, { scale: next ? exitScale : scale }],
      opacity: next ? 0.3 : opacity,
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.45],
        extrapolate: 'clamp',
      }),
    },
  };
};

/**
 * Timing for the transitions above.
 *
 * Asymmetric: closing is faster than opening (`duration.base` vs
 * `duration.cinematic`). Dismissing something should feel immediate — the user
 * has already decided, and making them watch the full cinematic curve on the
 * way out turns a flourish into an obstacle.
 */
export const cinematicSpec = {
  open: {
    animation: 'timing' as const,
    config: {
      duration: duration.cinematic,
      // Matches easing.revUp from motion.ts. Declared with RN's own Easing
      // rather than imported, because React Navigation's transition specs run
      // on RN Animated, not on Reanimated.
      easing: Easing.bezier(0.16, 0.9, 0.28, 1),
    },
  },
  close: {
    animation: 'timing' as const,
    config: {
      duration: duration.base,
      easing: Easing.bezier(0.3, 0, 0.8, 0.15),
    },
  },
};

/** Drop-in screenOptions for @react-navigation/stack. */
export const cinematicScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  cardStyleInterpolator: cinematicInterpolator,
  transitionSpec: cinematicSpec,
  // Without this the card is opaque white for a frame on Android, which on a
  // near-black app is a very visible flash.
  cardStyle: { backgroundColor: 'transparent' },
};

export const revealScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  cardStyleInterpolator: revealInterpolator,
  transitionSpec: cinematicSpec,
  cardStyle: { backgroundColor: 'transparent' },
};

export default cinematicScreenOptions;
