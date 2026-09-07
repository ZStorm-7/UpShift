// WorkoutSummaryScreen — the payoff.
//
// The workout screen already awards the XP; nothing here writes to Firestore.
// That separation is deliberate: a celebration screen that also owns a write is
// a celebration screen that can fail, and "your workout didn't save" is the
// worst possible thing to discover on the screen congratulating you.
//
// The choreography is a sequence, not a pile. Each beat lands after the last
// so the eye has somewhere to go: medal → headline → the XP counting up → the
// stat row assembling → the button arriving last, once there's a reason to
// press it. Everything arriving at once would be the same information with
// none of the pacing.
//
// It is driven the way LevelUpTakeover is driven: ONE linear master clock,
// with every element reading its own window out of it. Five delayed shared
// values drift apart under load — a Firestore round-trip on the JS thread is
// exactly what a summary screen mounts into — and a sequence whose beats have
// drifted is just a pile again. One timeline cannot drift.

import { ReactNode, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  interpolate,
  cancelAnimation,
  useReducedMotion,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, Card, Pill } from '../components/ui';
import { CountUp, PulseRing, PressableScale } from '../components/anim';
import { beat, easing, summary as summaryBeats } from '../animation/motion';
import haptics from '../services/haptics';
import sound from '../services/sound';
import { useLanguage } from '../i18n/LanguageContext';

type SummaryParams = {
  xpEarned?: number;
  completedSets?: number;
  totalSets?: number;
  exerciseCount?: number;
  muscleGroup?: string;
  /** Minutes, if the caller tracked it. */
  durationMinutes?: number;
};

export default function WorkoutSummaryScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { t } = useLanguage();
  const reduced = useReducedMotion();

  // Every field defaulted. A summary screen reached with missing params should
  // render a modest summary, never a crash or a row of "undefined".
  const {
    xpEarned = 0,
    completedSets = 0,
    totalSets = 0,
    exerciseCount = 0,
    muscleGroup = '',
    durationMinutes,
  }: SummaryParams = route?.params ?? {};

  const perfect = totalSets > 0 && completedSets === totalSets;

  // The master clock. Linear on purpose — the shaping happens per element,
  // below. Ease the master and every window would be eased twice, which reads
  // as sluggish in the middle and abrupt at the ends.
  const clock = useSharedValue(0);
  // The breathing glow is a genuine loop rather than a window on the clock,
  // so it keeps its own value.
  const medalGlow = useSharedValue(0);

  useEffect(() => {
    // Reduced motion still gets the screen, it just arrives instead of
    // performing: the clock jumps to its end state and every window below is
    // already complete. Nothing is hidden and nothing is disabled — the
    // buttons work identically either way.
    if (reduced) {
      clock.value = 1;
      return;
    }

    clock.value = withTiming(1, { duration: summaryBeats.total, easing: Easing.linear });

    // A slow breathing glow behind the medal, started after the stat beat so
    // the two motions don't fight. Only for a perfect workout: if the glow
    // appears whether or not you finished, it stops meaning anything.
    if (perfect) {
      medalGlow.value = withDelay(
        summaryBeats.at.stats,
        withRepeat(
          withSequence(
            withTiming(1, { duration: summaryBeats.glowBreath, easing: easing.loop }),
            withTiming(0.35, { duration: summaryBeats.glowBreath, easing: easing.loop })
          ),
          -1,
          false
        )
      );
    }

    // Infinite repeats do not stop when the component unmounts. Leaving the
    // glow running would keep a UI-thread animation alive for the rest of the
    // session, once per workout completed.
    return () => {
      cancelAnimation(clock);
      cancelAnimation(medalGlow);
    };
  }, [perfect, reduced]);

  // Feedback fires on ARRIVAL, not on render. A summary screen re-renders on
  // language change, on focus, on any parent state change; buzzing the phone
  // and re-announcing the result each time would turn the reward into noise.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;

    // Level-up strength for a perfect session, set-complete for anything
    // else — the vibration is how the two outcomes differ before you've read
    // a word of the screen.
    if (perfect) haptics.levelUp();
    else haptics.setComplete();
    // Held and consonant either way — the summary confirms, the level-up
    // celebrates, and only one of them gets to be the biggest sound.
    sound.sessionComplete();

    // The result is otherwise carried entirely by a glyph, a colour and a
    // sequence of movements, none of which a screen reader can see.
    const setsPart = totalSets > 0 ? ` ${completedSets} of ${totalSets} sets.` : '';
    AccessibilityInfo.announceForAccessibility(
      `${perfect ? 'Workout complete.' : 'Session logged.'}${setsPart} ${xpEarned} XP earned.`
    );
  }, [perfect, xpEarned, completedSets, totalSets]);

  /**
   * Reads one element's window out of the master clock, eased.
   *
   * Ease-out cubic: within about 1.5% of cubic-bezier(0.16, 1, 0.3, 1) across
   * the whole range, and unlike a real bezier it can be evaluated inside a
   * worklet without allocating.
   */
  const at = (start: number, length: number) => {
    'worklet';
    return (p: number) => {
      'worklet';
      const raw = interpolate(
        p,
        [start / summaryBeats.total, (start + length) / summaryBeats.total],
        [0, 1],
        Extrapolation.CLAMP
      );
      return 1 - Math.pow(1 - raw, 3);
    };
  };

  const medalAt = at(summaryBeats.at.medal, summaryBeats.dur.medal);
  const headlineAt = at(summaryBeats.at.headline, summaryBeats.dur.headline);
  const xpAt = at(summaryBeats.at.xp, summaryBeats.dur.xp);
  const actionAt = at(summaryBeats.at.action, summaryBeats.dur.action);

  // The medal is the biggest arrival on the screen, and it gets there on the
  // same curve as everything else — the prominence comes from the longest
  // duration in the sequence and the longest scale distance, not from
  // overshooting. The quest tick's 1.14 pop is the only overshoot in the app
  // and it stops being a reward the moment a second thing does it.
  const medalStyle = useAnimatedStyle(() => {
    const p = medalAt(clock.value);
    return {
      opacity: p,
      transform: [
        { scale: interpolate(p, [0, 1], [summaryBeats.medalFrom, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: medalGlow.value * 0.5,
    transform: [{ scale: interpolate(medalGlow.value, [0, 1], [1, 1.18], Extrapolation.CLAMP) }],
  }));

  const headlineStyle = useAnimatedStyle(() => {
    const p = headlineAt(clock.value);
    return {
      opacity: p,
      transform: [{ translateY: interpolate(p, [0, 1], [14, 0], Extrapolation.CLAMP) }],
    };
  });

  const xpStyle = useAnimatedStyle(() => {
    const p = xpAt(clock.value);
    return {
      opacity: p,
      transform: [{ scale: interpolate(p, [0, 1], [0.85, 1], Extrapolation.CLAMP) }],
    };
  });

  const actionStyle = useAnimatedStyle(() => {
    const p = actionAt(clock.value);
    return {
      opacity: p,
      transform: [{ translateY: interpolate(p, [0, 1], [20, 0], Extrapolation.CLAMP) }],
    };
  });

  const stats = [
    { icon: 'checkmark-done' as const, value: `${completedSets}`, label: t('sets') },
    { icon: 'barbell' as const, value: `${exerciseCount}`, label: 'Exercises' },
    ...(durationMinutes !== undefined
      ? [{ icon: 'time' as const, value: `${durationMinutes}m`, label: 'Duration' }]
      : []),
  ];

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.medalWrap}>
        {/* Glow sits behind and is purely decorative. */}
        <Animated.View style={[styles.medalGlow, { backgroundColor: palette.xpSoft }, glowStyle]} pointerEvents="none" />
        {/* The ring is a loop, and a loop is the one thing reduced motion
            cannot keep — a heartbeat that never stops is the whole problem
            the setting exists to solve. */}
        {perfect && <PulseRing size={150} color={palette.xp} active={!reduced} />}

        <Animated.View style={[styles.medal, { backgroundColor: palette.surfaceRaised, borderColor: palette.xp }, medalStyle]}>
          <Ionicons name={perfect ? 'trophy' : 'barbell'} size={48} color={palette.xp} />
        </Animated.View>
      </View>

      <Animated.View style={headlineStyle}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {perfect ? 'Workout Complete' : 'Session Logged'}
        </Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          {muscleGroup
            ? `${muscleGroup.charAt(0).toUpperCase()}${muscleGroup.slice(1)} day`
            : 'Nice work'}
          {totalSets > 0 ? ` · ${completedSets}/${totalSets} sets` : ''}
        </Text>
      </Animated.View>

      {/* The XP block. CountUp rather than a static number: XP that ticks
          upward is read as earned, XP that's simply printed is read as data. */}
      <Animated.View style={xpStyle}>
        <Card raised accentColor={palette.xp} style={styles.xpCard}>
          <Text style={[styles.xpLabel, { color: palette.textMuted }]}>XP EARNED</Text>
          <View style={styles.xpRow}>
            <CountUp
              value={xpEarned}
              prefix="+"
              style={[styles.xpValue, { color: palette.xp }]}
              // Rolling up IS the movement here, so reduced motion lands the
              // number on its final value rather than counting to it.
              durationMs={reduced ? 0 : beat.xpCounter}
            />
          </View>
          {perfect && <Pill label="Perfect Session" color={palette.xp} filled />}
        </Card>
      </Animated.View>

      <View style={styles.statsRow}>
        {stats.map((stat, i) => (
          // Staggered inside the stat beat, so the row assembles left to right
          // instead of appearing as a block — and, unlike a per-row entrance
          // that starts on mount, it assembles AFTER the XP has landed rather
          // than racing it.
          <StatSlot key={stat.label} clock={clock} index={i} at={at}>
            <Card style={styles.statCard}>
              <Ionicons name={stat.icon} size={20} color={palette.textSecondary} style={styles.statIcon} />
              <Text style={[styles.statValue, { color: palette.textPrimary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: palette.textMuted }]}>{stat.label}</Text>
            </Card>
          </StatSlot>
        ))}
      </View>

      {/* Arrives last. Showing the exit before the reward has finished
          animating invites people to leave before they've seen it. */}
      <Animated.View style={[styles.actions, actionStyle]}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('backToDashboard')}
          onPress={() => navigation.navigate('Dashboard')}>
          <View style={[styles.button, { backgroundColor: palette.accent, borderColor: palette.accent }]}>
            <Text style={[styles.buttonLabel, { color: palette.textOnAccent }]} numberOfLines={1}>
              {t('backToDashboard')}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Start another workout"
          onPress={() => navigation.navigate('Workout')}>
          <View style={[styles.button, { backgroundColor: palette.surfaceRaised, borderColor: palette.borderStrong }]}>
            <Text style={[styles.buttonLabel, { color: palette.textPrimary }]} numberOfLines={1}>
              Another Workout
            </Text>
          </View>
        </PressableScale>
      </Animated.View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * StatSlot
 * ------------------------------------------------------------------ */

/**
 * One stat tile's window on the shared clock. It's a component rather than an
 * inline style because a hook cannot be called inside a .map().
 */
function StatSlot({
  clock,
  index,
  at,
  children,
}: {
  clock: SharedValue<number>;
  index: number;
  at: (start: number, length: number) => (p: number) => number;
  children: ReactNode;
}) {
  const window = at(
    summaryBeats.at.stats + index * summaryBeats.statStagger,
    summaryBeats.dur.stats
  );

  const animatedStyle = useAnimatedStyle(() => {
    const p = window(clock.value);
    return {
      opacity: p,
      transform: [{ translateX: interpolate(p, [0, 1], [-16, 0], Extrapolation.CLAMP) }],
    };
  });

  return <Animated.View style={[styles.statSlot, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.xl,
  },
  medalWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalGlow: {
    // backgroundColor is applied inline from the palette.
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  medal: {
    // backgroundColor/borderColor are applied inline from the palette.
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  title: {
    ...type.title,
    textAlign: 'center',
  },
  subtitle: {
    ...type.body,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  xpCard: {
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 220,
  },
  xpLabel: {
    ...type.label,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  xpValue: {
    ...type.display,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  statSlot: {
    flex: 1,
  },
  statCard: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  statIcon: {
    marginBottom: 2,
  },
  statValue: {
    ...type.metric,
  },
  statLabel: {
    ...type.bodySm,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  // The buttons are built here rather than with ui.tsx's <Button> because that
  // component presses with an RN spring and takes no accessibility props. Same
  // shape as the design language describes; timing curve and a screen-reader
  // label come free from PressableScale. backgroundColor/borderColor for both
  // variants are applied inline from the palette at each call site.
  button: {
    width: '100%',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.hairline,
  },
  buttonLabel: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
  },
});
