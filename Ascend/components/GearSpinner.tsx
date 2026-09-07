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
import { usePalette } from '../theme/themedColors';
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
  // Themed rather than the static dark-only `colors` import — this spinner
  // is shown over whatever background the user's actual light/dark setting
  // renders (see AuthTransition), so a hardcoded dark bg/hub color made it
  // look broken (a dark patch with barely-visible strokes) during daylight
  // hours when auto theme mode is in effect.
  const palette = usePalette();

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
      [palette.danger, palette.xp, palette.accent]
    );
    return { fill };
  });

  // Rotation is driven through a plain SVG matrix transform, computed by
  // hand, rather than the library's `rotation`/`originX`/`originY` shorthand
  // props. Those shorthand props only get composed into a real transform
  // inside react-native-svg's own React render pass (see its `prepare()` /
  // `stringifyTransformProps()`) — but Reanimated's `useAnimatedProps`
  // updates the mounted node directly, bypassing that render pass entirely.
  // On web this left `rotation` silently inert; worse, it's what threw
  // during the initial prop application and crashed this component outright
  // on the web target.
  //
  // The matrix itself has to be the plain 6-number array form —
  // react-native-svg's ColumnMajorTransformMatrix type, `[a, b, c, d, e, f]`
  // — NOT the CSS-style `"matrix(a b c d e f)"` string. The string form has
  // to be parsed on the native side on every single animation frame; under
  // Fabric, a useAnimatedProps update that hands the native transform prop a
  // string where the codegen'd type expects a number array is a real iOS
  // crash, not a caught JS error, because the type mismatch is enforced in
  // native prop-parsing code that runs beneath any JS try/catch. The array
  // form needs no parsing at all — it's committed as-is.
  const bigGearRotation = useAnimatedProps(() => {
    const rad = (spin.value * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const e = cx - cx * cos + cy * sin;
    const f = cy - cx * sin - cy * cos;
    return { transform: [cos, sin, -sin, cos, e, f] as [number, number, number, number, number, number] };
  });

  // Opposite direction, and 10/7 faster — the real ratio for these tooth
  // counts, so the teeth stay plausibly meshed. Gears turning the same way
  // is the kind of thing nobody consciously notices but everybody finds
  // slightly wrong.
  const smallGearRotation = useAnimatedProps(() => {
    const rad = (-spin.value * (10 / 7) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const e = smallCx - smallCx * cos + smallCy * sin;
    const f = smallCy - smallCx * sin - smallCy * cos;
    return { transform: [cos, sin, -sin, cos, e, f] as [number, number, number, number, number, number] };
  });

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
    color: interpolateColor(rev.value, [0, 1], [palette.textMuted, palette.accent]),
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
              <Stop offset="0%" stopColor={palette.accent} stopOpacity={0.55} />
              <Stop offset="65%" stopColor={palette.accent} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
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
              directly would spin it about the SVG origin, not its own centre.
              The origin is baked into bigGearRotation's matrix, not passed
              as a separate prop here — see that comment for why. */}
          <AnimatedG animatedProps={bigGearRotation}>
            <AnimatedPathColored d={bigGear} animatedProps={gearColor} />
            {/* Hub, cut out so the gear reads as a wheel rather than a blob. */}
            <Circle cx={cx} cy={cy} r={bigOuter * 0.32} fill={palette.bg} />
            <Circle
              cx={cx}
              cy={cy}
              r={bigOuter * 0.32}
              fill="none"
              stroke={palette.borderStrong}
              strokeWidth={1}
            />
          </AnimatedG>

          <AnimatedG animatedProps={smallGearRotation}>
            <AnimatedPathColored d={smallGear} animatedProps={gearColor} />
            <Circle cx={smallCx} cy={smallCy} r={smallOuter * 0.34} fill={palette.bg} />
            <Circle
              cx={smallCx}
              cy={smallCy}
              r={smallOuter * 0.34}
              fill="none"
              stroke={palette.borderStrong}
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
