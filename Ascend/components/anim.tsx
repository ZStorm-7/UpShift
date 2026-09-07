// Reusable motion primitives.
//
// Same argument as components/ui.tsx, applied to movement: if every screen
// invents its own entrance, the app moves in a dozen unrelated ways. These are
// the movements UpShift is allowed to make.
//
// All of them are Reanimated, so the animation runs on the UI thread and keeps
// its frame rate even while JS is busy doing a Firestore round-trip — which is
// exactly when animations usually stutter, and exactly when the user is most
// likely to be looking at one.

import { ReactNode, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  interpolateColor,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  Extrapolation,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { duration, easing, stagger, beat, PRESS_SCALE } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * ScreenTransition
 * ------------------------------------------------------------------ */

type ScreenTransitionProps = {
  children: ReactNode;
  /** 'rise' for ordinary screens, 'reveal' for payoff moments. */
  variant?: 'rise' | 'reveal';
  style?: StyleProp<ViewStyle>;
};

/**
 * Cinematic entrance for a screen's CONTENT.
 *
 * This is the native-stack-compatible half of animation/transitions.ts. A
 * native stack hands the transition to the platform, so there's no interpolator
 * to override — but nothing stops the screen from animating its own content as
 * it arrives, and at these durations the two are hard to tell apart.
 *
 * The honest limitation: this cannot scale the OUTGOING screen, because that
 * screen belongs to the platform's transition. For the full effect — receding
 * background, scrim, the lot — switch those routes to @react-navigation/stack
 * and use cinematicScreenOptions.
 */
export function ScreenTransition({ children, variant = 'rise', style }: ScreenTransitionProps) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: variant === 'reveal' ? duration.cinematic : duration.base,
      easing: easing.enter,
    });
    return () => cancelAnimation(progress);
  }, [variant, reduced]);

  const animatedStyle = useAnimatedStyle(() => {
    const fromY = variant === 'reveal' ? 48 : 18;
    const fromScale = variant === 'reveal' ? 0.92 : 0.985;

    return {
      opacity: interpolate(progress.value, [0, 0.55, 1], [0, 1, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(progress.value, [0, 1], [fromY, 0], Extrapolation.CLAMP) },
        { scale: interpolate(progress.value, [0, 1], [fromScale, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return <Animated.View style={[styles.fill, animatedStyle, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ *
 * PressableScale
 * ------------------------------------------------------------------ */

type PressableScaleProps = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Forwarded to the inner Pressable. Required by the design language: every
   *  pressable surface in the app is reachable and named by a screen reader,
   *  and wrapping one in an Animated.View must not swallow that. */
  accessibilityRole?: 'button' | 'link' | 'checkbox' | 'radio' | 'tab' | 'switch';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { checked?: boolean; disabled?: boolean; selected?: boolean };
  /** How far it compresses. Defaults to the one press scale (0.965) — every
   *  surface in the app compresses by the same amount, big card or small
   *  button, because a shared scale is what makes them feel like one
   *  material. Override only when a surface is so small that 3.5% is
   *  invisible. */
  to?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wraps anything in press feedback. The single highest ratio of
 * perceived-quality to lines-of-code in the whole app: a surface that responds
 * to touch feels built, one that doesn't feels like a web page.
 *
 * Timing, not spring. The press and the release use the same 180ms curve as
 * everything else, so a button doesn't bounce back — it settles. That is the
 * whole "weight, not bounce" rule expressed in five lines.
 */
export function PressableScale({
  children,
  onPress,
  disabled,
  to = PRESS_SCALE,
  style,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => () => cancelAnimation(scale), []);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // With reduced motion on, the scale swap becomes a 0ms no-op rather than a
  // disabled component — the press still works, it just doesn't move.
  const press = (value: number) => {
    if (disabled) return;
    scale.value = reduced
      ? value
      : withTiming(value, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => press(to)}
        onPressOut={() => press(1)}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        // The visual disabled state and the announced one have to agree, or a
        // screen-reader user is told to press something that ignores them.
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * CountUp
 * ------------------------------------------------------------------ */

type CountUpProps = {
  value: number;
  /** Rendered around the number, e.g. suffix=" kcal". */
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: StyleProp<TextStyle>;
  durationMs?: number;
};

/**
 * Rolls a number up to its new value instead of swapping it.
 *
 * Worth the trouble specifically for XP and calorie totals: a number that
 * counts up is read as *earned*, where a number that jumps is just read. The
 * animation is doing real work here, not decoration.
 *
 * Implemented with AnimatedProps on a TextInput-free Animated.Text via
 * useDerivedValue + a text prop, so the tick happens on the UI thread. Driving
 * this from React state would re-render the tree ~60 times a second.
 */
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  style,
  durationMs = beat.xpCounter,
}: CountUpProps) {
  const animated = useSharedValue(value);
  // Tracks where we started so an interrupted count resumes from the current
  // displayed number rather than restarting from the old target.
  const previous = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Checked here rather than left to each caller. A rolling number is one of
    // the motions most likely to bother someone who asked for less of it, and
    // "every screen remembers to pass durationMs={0}" is not a guarantee — the
    // component that owns the movement owns the opt-out.
    animated.value = reduced
      ? value
      : withTiming(value, { duration: durationMs, easing: easing.revUp });
    previous.current = value;
    return () => cancelAnimation(animated);
  }, [value, durationMs, reduced]);

  const text = useDerivedValue(() => {
    return `${prefix}${animated.value.toFixed(decimals)}${suffix}`;
  });

  const animatedProps = useAnimatedProps(() => ({ text: text.value } as any));

  return (
    <AnimatedTextDisplay
      style={style}
      animatedProps={animatedProps}
      // The initial render needs real text; animatedProps only take over on
      // the first frame after mount.
      defaultValue={`${prefix}${value.toFixed(decimals)}${suffix}`}
    />
  );
}

/* ------------------------------------------------------------------ *
 * PulseRing
 * ------------------------------------------------------------------ */

type PulseRingProps = {
  size: number;
  color?: string;
  /** Set false to stop the loop, e.g. once a goal is met. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A slow expanding ring, for drawing the eye to something waiting on the user
 * (an unclaimed reward, a check-in that hasn't happened).
 *
 * Deliberately slow and low-contrast. A fast, bright pulse is an alarm; this
 * should read as a heartbeat you can ignore, because it may be on screen for
 * a long time.
 */
export function PulseRing({ size, color = colors.accent, active = true, style }: PulseRingProps) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Purely decorative, and it never stops on its own — so with reduced
    // motion on it doesn't run at all. Nothing is lost: everything this ring
    // draws attention to is also stated in text beside it.
    if (reduced) {
      t.value = 0;
      return;
    }
    if (!active) {
      cancelAnimation(t);
      t.value = withTiming(0, { duration: duration.fast });
      return;
    }
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: beat.pulseLoop, easing: easing.loop }),
        // A pause at rest stops it looking frantic. Without this the ring
        // restarts the instant it finishes and reads as a strobe.
        withTiming(1, { duration: beat.pulseRest })
      ),
      -1,
      false
    );
    return () => cancelAnimation(t);
  }, [active, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 1], [0, 0.4, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.85, 1.5], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        animatedStyle,
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * SlideInRow
 * ------------------------------------------------------------------ */

type SlideInRowProps = {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * List-row entrance. Slides in from the left and fades, staggered by index.
 *
 * The stagger is what turns a list appearing into a list *assembling*. It's
 * capped (see motion.ts) because an uncapped stagger on a 50-row leaderboard
 * would have the last row arrive two seconds after the first — by which point
 * the user has already scrolled past where it should have been.
 */
export function SlideInRow({ children, index = 0, style }: SlideInRowProps) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withDelay(
      stagger.delayFor(index),
      withTiming(1, { duration: duration.base, easing: easing.enter })
    );
    return () => cancelAnimation(t);
  }, [index, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateX: interpolate(t.value, [0, 1], [-16, 0], Extrapolation.CLAMP) }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ *
 * Shimmer
 * ------------------------------------------------------------------ */

type ShimmerProps = {
  width: number | string;
  height: number;
  /**
   * Corner radius. Defaults to the small step, which is right for a stand-in
   * for a line of text; pass the radius of the CARD when the block is standing
   * in for a card, or the skeleton and the thing it becomes will have visibly
   * different corners at the swap.
   */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Skeleton placeholder. Show these in the shape of the content that's loading
 * rather than a spinner in the middle of an empty screen — the layout stops
 * jumping when data arrives, and the wait feels shorter because there's
 * already something to look at.
 */
export function Shimmer({ width, height, radius: cornerRadius, style }: ShimmerProps) {
  // Themed, not the static dark-only `colors` this used to read — that
  // interpolated between two near-black values regardless of the user's
  // actual theme, so every loading skeleton in the app (BootSkeleton, the
  // Nutrition ring's loading state, every screen's initial shimmer) rendered
  // as solid near-black blocks against a LIGHT background in light mode,
  // instead of a light skeleton.
  const palette = usePalette();
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    // A skeleton still has to read as "loading" with the movement off, so this
    // settles on the lit end of the ramp rather than the base surface — a
    // static block the same colour as the card would just look like a gap.
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: beat.skeletonLoop, easing: easing.loop }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      t.value,
      [0, 1],
      [palette.surface, palette.surfaceRaised]
    ),
  }));

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: cornerRadius ?? radius.sm },
        animatedStyle,
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * AnimatedMeter
 * ------------------------------------------------------------------ */

type AnimatedMeterProps = {
  progress: number;
  color?: string;
  height?: number;
  /** Pulses the fill when it crosses 100%. */
  celebrateAtFull?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The Meter from ui.tsx, upgraded to Reanimated and given a payoff.
 *
 * The difference that matters is `celebrateAtFull`: hitting a goal is the
 * moment the whole app exists for, and a bar that slides to 100% and stops
 * treats it as just another value. A brief glow says "that was the thing".
 */
export function AnimatedMeter({
  progress,
  color,
  height = 8,
  celebrateAtFull = true,
  style,
}: AnimatedMeterProps) {
  // Themed. The track/border used to come from the static dark-only `colors`
  // (near-black), which stayed near-black in light mode instead of a light
  // track — the same bug Shimmer had, in the app's other progress-bar
  // primitive. `color` (the FILL) is left to the caller: accent is identical
  // in both palettes, but macro/XP bars pass their own hue on purpose.
  const palette = usePalette();
  const fillColor = color ?? palette.accent;
  const clamped = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  // Starts at zero, not at the target. Seeding this with `clamped` meant the
  // effect's withTiming had nowhere to travel on first mount, so a bar that
  // arrived already part-full never filled — it was simply painted. Every
  // other progress element in the app draws itself in, and the meter silently
  // opted out.
  const fill = useSharedValue(0);
  const celebrate = useSharedValue(0);
  const wasFull = useRef(clamped >= 1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      fill.value = clamped;
      wasFull.current = clamped >= 1;
      return;
    }
    // Width transition, not a keyframe animation: an XP gain that lands while
    // a previous one is still filling retargets from where the bar currently
    // is instead of snapping back to the old start.
    fill.value = withTiming(clamped, { duration: beat.xpBar, easing: easing.standard });

    // Fire only on the CROSSING, not on every render where the value happens
    // to be full — otherwise the bar pulses every time the screen refocuses.
    const nowFull = clamped >= 1;
    if (celebrateAtFull && nowFull && !wasFull.current) {
      celebrate.value = withSequence(
        withTiming(1, { duration: duration.fast, easing: easing.revUp }),
        withTiming(0, { duration: duration.slow, easing: easing.exit })
      );
    }
    wasFull.current = nowFull;

    return () => {
      cancelAnimation(fill);
      cancelAnimation(celebrate);
    };
  }, [clamped, celebrateAtFull, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
    // The celebratory flash target used to be the static colors.textPrimary
    // (near-white) — fine as a brief flash on the app's old dark-only
    // background, but a near-white flash on a light-mode bar is nearly
    // invisible. palette.textPrimary is near-black there, which reads as the
    // same "flash to the opposite end of the scale" effect in either theme.
    backgroundColor: interpolateColor(celebrate.value, [0, 1], [fillColor, palette.textPrimary]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: celebrate.value * 0.5,
  }));

  return (
    <View
      style={[
        styles.meterTrack,
        { height, borderRadius: height / 2, backgroundColor: palette.surfaceSunken, borderColor: palette.border },
        style,
      ]}>
      <Animated.View
        style={[styles.meterFill, { borderRadius: height / 2 }, fillStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: fillColor, borderRadius: height / 2 },
          glowStyle,
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Internal
 * ------------------------------------------------------------------ */

// A Text whose content can be driven from the UI thread. Built on TextInput
// because React Native's Text has no animatable `text` prop, while TextInput
// does — the standard trick for a 60fps counter. Made non-editable and
// stripped of padding so it renders indistinguishably from Text.
import { TextInput } from 'react-native';
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function AnimatedTextDisplay({
  style,
  animatedProps,
  defaultValue,
}: {
  style?: StyleProp<TextStyle>;
  animatedProps: any;
  defaultValue: string;
}) {
  // Themed default. CountUp's only current caller (WorkoutSummaryScreen)
  // overrides this with its own color, so it's latent today — but the
  // static colors.textPrimary default would go near-invisible in light mode
  // for any future caller that doesn't, same as every other bug in this file.
  const palette = usePalette();
  return (
    <AnimatedTextInput
      editable={false}
      // Stops the counter from stealing focus or showing a cursor.
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={defaultValue}
      animatedProps={animatedProps}
      style={[styles.animatedText, { color: palette.textPrimary }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  meterTrack: {
    // backgroundColor/borderColor are applied inline at render time from the
    // palette — see AnimatedMeter above.
    width: '100%',
    overflow: 'hidden',
    borderWidth: layout.hairline,
  },
  meterFill: {
    height: '100%',
  },
  animatedText: {
    padding: 0,
    margin: 0,
    // TextInput reserves vertical space for a cursor on Android; zeroing these
    // is what makes it line up with surrounding Text.
    paddingVertical: 0,
    textAlignVertical: 'center',
    // color is applied inline at render time — see AnimatedTextDisplay above.
  },
});
