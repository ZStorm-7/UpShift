// GearSpinner — UpShift's loading indicator.
//
// A generic spinning circle rotates at a constant speed, which communicates
// "waiting". This one revs: it accelerates hard, holds, then eases as it
// climbs, and the colour climbs with it — ember orange at rest through to neon
// green at full song. What it communicates is "shifting up", which is the whole
// premise of the app.
//
// Three details do most of the work:
//
//  1. NON-LINEAR ROTATION. A linear spin is the single biggest reason loaders
//     look robotic. This one runs each revolution through a bezier so there's a
//     surge and a settle inside every turn.
//
//  2. TWO GEARS, OPPOSITE DIRECTIONS, DIFFERENT RATIOS. Meshed gears must turn
//     opposite ways or the image is nonsense. The small gear also turns faster,
//     as a smaller gear physically would — the eye knows this even when the
//     viewer couldn't articulate it.
//
//  3. COLOUR AS PROGRESS. Fill and glow interpolate together off one shared
//     value, so the whole component brightens as one object instead of
//     several parts changing independently.

import { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle, G, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  interpolateColor,
  cancelAnimation,
  Extrapolation,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { duration, easing } from '../animation/motion';
import { type } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

type GearSpinnerProps = {
  /** Overall pixel size of the square canvas. */
  size?: number;
  /** Optional caption rendered under the gears. */
  label?: string;
  /** Milliseconds per rev cycle. Lower = more urgent. */
  cycleMs?: number;
};

/**
 * Builds an SVG path for a gear: a toothed ring around a hub.
 *
 * Generated rather than hand-drawn so tooth count and radius stay in
 * proportion at any size — a hardcoded path scaled up gets visibly chunky
 * teeth, and scaled down turns to mush.
 */
function gearPath(cx: number, cy: number, outerR: number, innerR: number, teeth: number): string {
  const step = (Math.PI * 2) / (teeth * 2);
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    // Alternate between the tip and the root radius to cut the teeth.
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d + 'Z';
}

export default function GearSpinner({ size = 96, label, cycleMs = 1400 }: GearSpinnerProps) {
  // One driver for everything. `rev` runs 0→1 per cycle and every visual
  // property reads off it, which is what keeps rotation, colour and glow
  // locked together instead of drifting apart over a long load.
  const rev = useSharedValue(0);

  // Accumulating rotation, kept separate from `rev` because rotation must never
  // rewind. If we derived the angle from `rev` the gear would snap back to 0°
  // at the end of every cycle.
  const spin = useSharedValue(0);

  useEffect(() => {
    // The rev cycle: surge (revUp), brief hold at the top, ease back down.
    // withSequence inside withRepeat is what produces a cycle with internal
    // structure rather than a single monotonous sweep.
    rev.value = withRepeat(
      withSequence(
        withTiming(1, { duration: cycleMs * 0.55, easing: easing.revUp }),
        withTiming(1, { duration: cycleMs * 0.12 }),
        withTiming(0, { duration: cycleMs * 0.33, easing: easing.loop })
      ),
      -1, // forever
      false // don't reverse; the sequence already returns to 0
    );

    // Rotation runs on its own repeat so it can keep climbing monotonically.
    // 360 per iteration, eased, so each revolution has a surge in it.
    spin.value = withRepeat(
      withTiming(360, { duration: cycleMs, easing: easing.revUp }),
      -1,
      false
    );

    // Cleanup is not optional. A Reanimated animation with -1 iterations runs
    // until something stops it; unmounting the component does NOT. Leave these
    // uncancelled and every visit to a loading screen leaves another infinite
    // animation running against a shared value nobody reads, on the UI thread.
    return () => {
      cancelAnimation(rev);
      cancelAnimation(spin);
    };
  }, [cycleMs]);

  // ── Geometry ──
  const cx = size * 0.4;
  const cy = size * 0.42;
  const bigOuter = size * 0.3;
  const bigInner = size * 0.24;

  const smallCx = size * 0.72;
  const smallCy = size * 0.68;
  const smallOuter = size * 0.19;
  const smallInner = size * 0.145;

  const bigGear = gearPath(cx, cy, bigOuter, bigInner, 10);
  const smallGear = gearPath(smallCx, smallCy, smallOuter, smallInner, 7);

  // ── Animated properties ──

  // The colour ramp. Three stops rather than two so the middle of the rev has
  // its own identity — a straight orange→green blend passes through a muddy
  // olive, which looks like a rendering error rather than a transition.
  const gearColor = useAnimatedProps(() => {
    const fill = interpolateColor(
      rev.value,
      [0, 0.5, 1],
      // ember → gold → accent. From the palette rather than typed literals, so
      // the spinner can't drift out of the app's colour system the next time
      // the accent moves.
      [colors.danger, colors.xp, colors.accent]
    );
    return { fill };
  });

  // Rotation is driven through SVG's own `rotation` prop rather than a style
  // transform. An SVG <G> rotates about the origin you give it, so this is the
  // only way to spin a gear about its own centre — a style transform would
  // swing it around the top-left of the canvas instead.
  const bigGearRotation = useAnimatedProps(() => ({
    rotation: spin.value,
  }));

  // Opposite direction, and 10/7 faster — the real ratio for these tooth
  // counts, so the teeth stay plausibly meshed. Gears turning the same way
  // is the kind of thing nobody consciously notices but everybody finds
  // slightly wrong.
  const smallGearRotation = useAnimatedProps(() => ({
    rotation: -spin.value * (10 / 7),
  }));

  // The aura. Grows and brightens with the rev, but never reaches full opacity
  // — a glow that solid stops reading as light and starts reading as a shape.
  const glowProps = useAnimatedProps(() => ({
    r: interpolate(rev.value, [0, 1], [size * 0.34, size * 0.46], Extrapolation.CLAMP),
    opacity: interpolate(rev.value, [0, 1], [0.16, 0.42], Extrapolation.CLAMP),
  }));

  // The whole assembly breathes very slightly, which stops the composition
  // from looking pinned to the page during a long wait.
  const breathe = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(rev.value, [0, 1], [0.97, 1.03], Extrapolation.CLAMP) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(rev.value, [0, 1], [colors.textMuted, colors.accent]),
    opacity: interpolate(rev.value, [0, 1], [0.6, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[{ width: size, height: size }, breathe]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* Static gradient stops. The aura's COLOUR change is carried by
                the gears themselves and by the label; animating gradient stops
                as well was one moving part too many — it made the glow shimmer
                in a way that read as flicker rather than energy. What the aura
                animates is size and opacity, below. */}
            <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.55} />
              <Stop offset="65%" stopColor={colors.accent} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Aura sits behind the gears. */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            fill="url(#aura)"
            animatedProps={glowProps}
          />

          {/* Big gear. The G wrapper is what rotates; rotating the Path
              directly would spin it about the SVG origin, not its own centre. */}
          <AnimatedG animatedProps={bigGearRotation} originX={cx} originY={cy}>
            <AnimatedPathColored d={bigGear} animatedProps={gearColor} />
            {/* Hub, cut out so the gear reads as a wheel rather than a blob. */}
            <Circle cx={cx} cy={cy} r={bigOuter * 0.32} fill={colors.bg} />
            <Circle
              cx={cx}
              cy={cy}
              r={bigOuter * 0.32}
              fill="none"
              stroke={colors.borderStrong}
              strokeWidth={1}
            />
          </AnimatedG>

          <AnimatedG animatedProps={smallGearRotation} originX={smallCx} originY={smallCy}>
            <AnimatedPathColored d={smallGear} animatedProps={gearColor} />
            <Circle cx={smallCx} cy={smallCy} r={smallOuter * 0.34} fill={colors.bg} />
            <Circle
              cx={smallCx}
              cy={smallCy}
              r={smallOuter * 0.34}
              fill="none"
              stroke={colors.borderStrong}
              strokeWidth={1}
            />
          </AnimatedG>
        </Svg>
      </Animated.View>

      {!!label && <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>}
    </View>
  );
}

// Declared at module scope, not inside the component: createAnimatedComponent
// builds a new component type each call, so doing it during render would
// remount the path on every frame and throw away the animation.
const AnimatedPathColored = Animated.createAnimatedComponent(Path);

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    ...type.label,
    textTransform: 'uppercase',
  },
});
