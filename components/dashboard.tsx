// Dashboard presentation pieces.
//
// These live outside DashboardScreen.tsx on purpose. That screen is already
// 1,000 lines of genuinely load-bearing logic — quest cycles, auto-verify,
// midnight and noon rollover, XP transactions — and burying the animation
// work inside it would make both halves harder to read. Everything here is
// presentation: it takes numbers and renders them. It owns no state that
// survives a remount and talks to no network.
//
// Every duration is imported from animation/motion.ts rather than typed
// inline, so the whole screen retimes from one file.

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
  AccessibilityInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  cancelAnimation,
  useReducedMotion,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { duration, easing, beat, levelUp as levelUpBeats, PRESS_SCALE } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * Entrance
 * ------------------------------------------------------------------ */

/**
 * The dashboard's arrival: 400ms, 60ms apart per block, in reading order.
 *
 * Fade plus a short rise, never a slide from the side. The dashboard is the
 * app's home — content should look like it was already there and is coming
 * into focus, not like it flew in from somewhere else.
 */
export function Enter({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withDelay(
      // Capped at 8 steps. Uncapped, a long quest list would have its last
      // row arriving most of a second after the header.
      Math.min(index, 8) * beat.dashboardStagger,
      withTiming(1, { duration: beat.dashboardEnter, easing: easing.standard })
    );
    return () => cancelAnimation(t);
  }, [index, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: interpolate(t.value, [0, 1], [12, 0], Extrapolation.CLAMP) }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ *
 * Level card
 * ------------------------------------------------------------------ */

type LevelCardProps = {
  level: number;
  currentXP: number;
  totalXP: number;
  rank: string;
  /** Already formatted by the caller — "Next: Warrior at Level 20", or the
   *  top-of-ladder message. Formatting it here would mean this component had
   *  to know the rank ladder, which is data/ranks.ts's job. */
  nextLabel: string;
  streakDays: number;
};

/**
 * LEVEL 12 · 60 / 100 XP · a gold bar · Athlete · Next: Warrior at Level 20.
 *
 * The bar is a width TRANSITION rather than a keyframed fill. That distinction
 * is the whole reason this isn't three lines: complete two quests in quick
 * succession and the second gain arrives while the first is still filling. A
 * keyframed fill would snap back to the old start and replay; a transition
 * retargets from wherever the bar currently is, which is what makes rapid XP
 * gains read as one continuous climb.
 */
export function LevelCard({
  level,
  currentXP,
  totalXP,
  rank,
  nextLabel,
  streakDays,
}: LevelCardProps) {
  const target = totalXP > 0 ? Math.max(0, Math.min(1, currentXP / totalXP)) : 0;
  const fill = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced
      ? target
      : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
    return () => cancelAnimation(fill);
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.levelCard}>
      <View style={styles.levelTopRow}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelLabel}>LEVEL</Text>
          <Text style={styles.levelNumber}>{level}</Text>
        </View>
        <Text style={styles.xpReadout}>
          {currentXP} / {totalXP} XP
        </Text>
      </View>

      <View style={styles.xpTrack}>
        <Animated.View style={[styles.xpFill, fillStyle]} />
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankName}>{rank}</Text>
        <Text style={styles.rankNext}>{nextLabel}</Text>
      </View>

      {streakDays > 0 && (
        <Text style={styles.streakLine}>
          {streakDays} day{streakDays === 1 ? '' : 's'} streak
        </Text>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Quest row
 * ------------------------------------------------------------------ */

type QuestRowProps = {
  title: string;
  xp: number;
  completed: boolean;
  /** Translated caption shown under the title for quests the app verifies
   *  from logged data. Passed in rather than written here so this component
   *  never has to import the i18n context. */
  autoLabel?: string;
  onPress?: () => void;
};

/**
 * A checkbox, a title, an XP value. 340ms to tick.
 *
 * Three things happen on that 340ms, deliberately overlapping rather than
 * sequenced — the box scales past to 1.14 and settles, the checkmark strokes
 * in over the back half, and the row desaturates and strikes through. Play
 * them one after another and the row takes a second to respond, which makes a
 * quest feel like paperwork. Overlapped, the tap reads as instant and the
 * flourish happens on the way out.
 *
 * The "+XP" mote is a separate 780ms life: it detaches from the row, floats
 * 34px up and fades. That's the piece users actually remember, and it's why
 * the XP number is rendered twice (once static, once as the mote) rather
 * than animating the real one away.
 */
export function QuestRow({ title, xp, completed, autoLabel, onPress }: QuestRowProps) {
  const box = useSharedValue(completed ? 1 : 0);
  const press = useSharedValue(1);
  const mote = useSharedValue(0);
  const reduced = useReducedMotion();

  // Tracks the previous value so the pop fires on the CROSSING into complete,
  // not on every re-render where the quest happens to already be done — which
  // is most of them, since this screen reloads on focus.
  const wasCompleted = useRef(completed);

  useEffect(() => {
    if (completed && !wasCompleted.current) {
      if (reduced) {
        box.value = 1;
      } else {
        box.value = withSequence(
          withTiming(beat.questTickScale, {
            duration: beat.questTick * 0.45,
            easing: easing.standard,
          }),
          withTiming(1, { duration: beat.questTick * 0.55, easing: easing.standard })
        );
        mote.value = withTiming(1, { duration: beat.xpMote, easing: easing.standard }, () => {
          mote.value = 0;
        });
      }
      // Screen readers get told, since none of the above is announced.
      AccessibilityInfo.announceForAccessibility?.(`${title} complete. Plus ${xp} XP.`);
    } else if (!completed) {
      box.value = 0;
    }
    wasCompleted.current = completed;
  }, [completed, reduced]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (box.value > 1 ? box.value - 1 : 0) }],
    backgroundColor: completed ? colors.accent : 'transparent',
    borderColor: completed ? colors.accent : colors.borderStrong,
  }));

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const moteStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mote.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          mote.value,
          [0, 1],
          [0, -beat.xpMoteRise],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const setPress = (value: number) => {
    press.value = reduced
      ? value
      : withTiming(value, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`${title}, ${xp} XP`}
        disabled={completed}
        onPress={onPress}
        onPressIn={() => !completed && setPress(PRESS_SCALE)}
        onPressOut={() => !completed && setPress(1)}
        style={styles.questRow}>
        <Animated.View style={[styles.checkbox, boxStyle]}>
          {completed && <Text style={styles.checkmark}>✓</Text>}
        </Animated.View>

        <View style={styles.questTextBlock}>
          <Text
            numberOfLines={2}
            style={[styles.questTitle, completed && styles.questTitleDone]}>
            {title}
          </Text>
          {autoLabel && !completed && <Text style={styles.autoTracked}>{autoLabel}</Text>}
        </View>

        <View>
          <Text style={[styles.questXP, completed && styles.questXPDone]}>+{xp} XP</Text>
          {/* The mote. pointerEvents none so it can never eat the tap that
              created it. */}
          <Animated.Text pointerEvents="none" style={[styles.mote, moteStyle]}>
            +{xp} XP
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Stat card
 * ------------------------------------------------------------------ */

type StatCardProps = {
  value: string;
  label: string;
  hint?: string;
  onPress?: () => void;
};

/**
 * A big number and what it is. Two of these sit side by side under the quest
 * list — calories and sets, the two things you're most likely to be checking
 * mid-day.
 */
export function StatCard({ value, label, hint, onPress }: StatCardProps) {
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const setPress = (v: number) => {
    press.value = reduced
      ? v
      : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <Animated.View style={[styles.statCardWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${value} ${label}`}
        onPress={onPress}
        onPressIn={() => setPress(PRESS_SCALE)}
        onPressOut={() => setPress(1)}
        style={styles.statCard}>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.statLabel}>
          {label}
          {hint ? <Text style={styles.statHint}>{`   ${hint}`}</Text> : null}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Water block
 * ------------------------------------------------------------------ */

export function WaterBlock({
  total,
  goal,
  onLog,
}: {
  total: number;
  goal: number;
  onLog: () => void;
}) {
  const target = goal > 0 ? Math.max(0, Math.min(1, total / goal)) : 0;
  const fill = useSharedValue(0);
  const press = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced
      ? target
      : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
    return () => cancelAnimation(fill);
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const setPress = (v: number) => {
    press.value = reduced
      ? v
      : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <View style={styles.waterCard}>
      <View style={styles.waterHeader}>
        <Text style={styles.waterLabel}>Water</Text>
        {/* The bar is capped at 100%; this number is not. Drinking past the
            goal is a real thing that a quest rewards, so the readout has to
            be able to say so. */}
        <Text style={styles.waterReadout}>
          {total}ml / {goal}ml
        </Text>
      </View>

      <View style={styles.waterTrack}>
        <Animated.View style={[styles.waterFill, fillStyle]} />
      </View>

      <Animated.View style={pressStyle}>
        <Pressable
          accessibilityRole="button"
          onPress={onLog}
          onPressIn={() => setPress(PRESS_SCALE)}
          onPressOut={() => setPress(1)}
          style={styles.waterButton}>
          <Text style={styles.waterButtonLabel}>+ Log Water</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Level-up takeover
 * ------------------------------------------------------------------ */

/**
 * 2.5 seconds, sequenced, then it dismisses itself.
 *
 * Ring at 0ms, four rays at 620ms, the numeral counting at 1320ms, the rank
 * name at 2120ms. Auto-dismiss rather than a dismiss button: a modal that
 * demands a tap turns a reward into an interruption, and the user is almost
 * certainly mid-something.
 *
 * The haptic is fired by the caller (services/haptics), not here, so this
 * component stays purely visual and can be previewed without buzzing anyone's
 * phone.
 */
export function LevelUpTakeover({
  level,
  rank,
  onDone,
}: {
  level: number;
  rank: string;
  onDone: () => void;
}) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  const [numeral, setNumeral] = useState(reduced ? level : Math.max(1, level - 1));

  useEffect(() => {
    // Reduced motion still gets the moment — it just arrives rather than
    // performing. Swapping the whole celebration for nothing would quietly
    // delete the single best thing that happens in the app for the people who
    // need the setting.
    //
    // It jumps the timeline to 1 rather than playing it faster. Every element
    // below reads its own window as a FRACTION of levelUpBeats.total, so
    // running the same t over a shorter duration wouldn't compress the
    // sequence — it would truncate it, and the rank name (the last window)
    // would never finish arriving.
    const hold = reduced ? 1200 : levelUpBeats.total;
    if (reduced) {
      t.value = 1;
    } else {
      t.value = withTiming(1, { duration: levelUpBeats.total, easing: Easing.linear });
    }

    const countTimer = setTimeout(() => setNumeral(level), reduced ? 0 : levelUpBeats.at.numeral);
    const doneTimer = setTimeout(onDone, hold);

    return () => {
      cancelAnimation(t);
      clearTimeout(countTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  // Each element reads its own window out of one shared 0→1 progress value.
  // Four separate shared values with four delays would drift apart under load;
  // one timeline cannot.
  //
  // The master clock is LINEAR on purpose — the shaping happens per element,
  // below. Ease the master and every window would be eased twice, which reads
  // as sluggish in the middle and abrupt at the ends.
  const at = (start: number, length: number) => {
    'worklet';
    return (p: number) => {
      'worklet';
      const raw = interpolate(
        p,
        [start / levelUpBeats.total, (start + length) / levelUpBeats.total],
        [0, 1],
        Extrapolation.CLAMP
      );
      // Ease-out cubic. Within about 1.5% of cubic-bezier(0.16, 1, 0.3, 1)
      // across the whole range, and unlike a real bezier it can be evaluated
      // inside a worklet without allocating.
      return 1 - Math.pow(1 - raw, 3);
    };
  };

  const ringAt = at(levelUpBeats.at.ring, levelUpBeats.dur.ring);
  const raysAt = at(levelUpBeats.at.rays, levelUpBeats.dur.rays);
  const numeralAt = at(levelUpBeats.at.numeral, levelUpBeats.dur.numeral);
  const nameAt = at(levelUpBeats.at.rankName, levelUpBeats.dur.rankName);

  // Fades out only after the rank name has landed (levelUp.outAt), so nothing
  // is still arriving while the screen is dissolving.
  //
  // Same bug as Splash.tsx had, and worth spelling out again here rather than
  // just fixing it silently: reduced motion (above) jumps `t.value` straight
  // to 1, but this formula's own value AT 1 is "faded fully out" — that's
  // what the tail end of a normal playback looks like. Left as-is, a reduced-
  // motion viewer got a level-up takeover that was completely invisible for
  // its whole 1200ms hold: the ring, the rays, the numeral and the rank name
  // were all correctly positioned and completely transparent. The single
  // biggest reward moment in the app, silently deleted for exactly the
  // people the reduced-motion path exists to serve.
  const outStart = levelUpBeats.outAt / levelUpBeats.total;
  const scrimStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1 };
    return {
      opacity: interpolate(t.value, [0, 0.06, outStart, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    };
  });

  const ringStyle = useAnimatedStyle(() => {
    const p = ringAt(t.value);
    return {
      opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0.85], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 1], [0.4, 1], Extrapolation.CLAMP) }],
    };
  });

  const raysStyle = useAnimatedStyle(() => {
    const p = raysAt(t.value);
    return {
      opacity: interpolate(p, [0, 0.25, 1], [0, 0.9, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 1], [0.7, 1.6], Extrapolation.CLAMP) }],
    };
  });

  const numeralStyle = useAnimatedStyle(() => {
    const p = numeralAt(t.value);
    return {
      opacity: p,
      transform: [{ translateY: interpolate(p, [0, 1], [10, 0], Extrapolation.CLAMP) }],
    };
  });

  const nameStyle = useAnimatedStyle(() => {
    const p = nameAt(t.value);
    return {
      opacity: p,
      transform: [{ translateY: interpolate(p, [0, 1], [8, 0], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Level up. Level ${level}. ${rank}.`}
      style={[StyleSheet.absoluteFillObject, styles.takeover, scrimStyle]}>
      {/* Four rays, drawn as rotated hairlines. Cheaper than an SVG burst and
          it reads the same at this size and speed. */}
      <Animated.View style={[styles.rays, raysStyle]}>
        {[0, 45, 90, 135].map(deg => (
          <View key={deg} style={[styles.ray, { transform: [{ rotate: `${deg}deg` }] }]} />
        ))}
      </Animated.View>

      <Animated.View style={[styles.ring, ringStyle]} />

      <Animated.View style={numeralStyle}>
        <Text style={styles.takeoverLabel}>LEVEL</Text>
        <Text style={styles.takeoverNumeral}>{numeral}</Text>
      </Animated.View>

      <Animated.Text style={[styles.takeoverRank, nameStyle]}>{rank}</Animated.Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  /* Level card */
  levelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  levelTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  levelLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  levelNumber: {
    ...type.title,
    color: colors.textPrimary,
  },
  xpReadout: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  xpTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.xp,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rankName: {
    ...type.heading,
    color: colors.textPrimary,
  },
  rankNext: {
    ...type.bodySm,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  streakLine: {
    ...type.bodySm,
    color: colors.warning,
  },

  /* Quest row */
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontFamily: fontFamily.sansBlack,
    lineHeight: 15,
  },
  questTextBlock: {
    flex: 1,
    gap: 2,
  },
  questTitle: {
    ...type.body,
    color: colors.textPrimary,
  },
  questTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  autoTracked: {
    ...type.label,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  questXP: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
    color: colors.xp,
  },
  questXPDone: {
    color: colors.textMuted,
  },
  mote: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
    color: colors.xp,
    position: 'absolute',
    right: 0,
    top: 0,
  },

  /* Stat card */
  statCardWrap: {
    flex: 1,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  statLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  statHint: {
    ...type.bodySm,
    color: colors.textMuted,
  },

  /* Water */
  waterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  waterLabel: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
    color: colors.textPrimary,
  },
  waterReadout: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  waterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  waterFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.info,
  },
  waterButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  waterButtonLabel: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
    color: colors.textOnAccent,
  },

  /* Takeover */
  takeover: {
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  rays: {
    position: 'absolute',
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 260,
    height: 1,
    backgroundColor: colors.accent,
  },
  takeoverLabel: {
    ...type.label,
    color: colors.accent,
    textAlign: 'center',
  },
  takeoverNumeral: {
    ...type.display,
    fontSize: 64,
    lineHeight: 72,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  takeoverRank: {
    ...type.heading,
    color: colors.accent,
    textAlign: 'center',
  },
});
