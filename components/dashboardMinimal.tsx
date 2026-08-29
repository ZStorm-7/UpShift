// Dashboard redesign — proof-of-concept presentation layer.
//
// Restyled equivalents of the pieces in components/dashboard.tsx (LevelCard,
// QuestRow, StatCard, WaterBlock) plus a small Button/Field pair for the
// screen's modals, all built against theme/minimal.ts instead of
// theme/colors.ts. DashboardScreen.tsx's state, effects and handlers are
// unchanged — only what renders them is different, and only on this screen.
//
// `Enter` (the entrance stagger) and `LevelUpTakeover` (the level-up overlay)
// are reused unmodified from components/dashboard.tsx: Enter has no visual
// chrome of its own, and LevelUpTakeover is a full-screen reward moment whose
// dark scrim reads fine over either background — restyling its Reanimated
// timeline isn't part of what this proof of concept is evaluating.

import { ReactNode, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  StyleProp,
  ViewStyle,
  AccessibilityInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  interpolate,
  interpolateColor,
  cancelAnimation,
  useReducedMotion,
  Extrapolation,
} from 'react-native-reanimated';
import { minimalColors as c, minimalType as type, minimalSpacing as spacing, minimalRadius as radius } from '../theme/minimal';
import { fontFamily } from '../theme/fonts';
import { duration, easing, beat, PRESS_SCALE } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * Tag — the skill's one legitimate pill: small, uppercase, tracked,
 * pastel-filled. Used for XP values and the streak line.
 * ------------------------------------------------------------------ */

export function Tag({ label, tone = 'gold' }: { label: string; tone?: 'gold' | 'green' | 'blue' | 'red' | 'muted' }) {
  const bg = tone === 'gold' ? c.goldSoft : tone === 'green' ? c.greenSoft : tone === 'blue' ? c.blueSoft : tone === 'red' ? c.redSoft : c.surfaceSunken;
  const fg = tone === 'gold' ? c.gold : tone === 'green' ? c.green : tone === 'blue' ? c.blue : tone === 'red' ? c.red : c.textMuted;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Shimmer — the loading skeleton, recolored for the light canvas. The
 * original in components/anim.tsx interpolates between two dark greys;
 * reusing it here would flash near-black boxes on a white screen.
 * ------------------------------------------------------------------ */

export function Shimmer({
  width,
  height,
  cornerRadius,
  style,
}: {
  width: number | string;
  height: number;
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: beat.skeletonLoop, easing: easing.loop }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [c.surfaceSunken, c.border]),
  }));

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius: cornerRadius ?? radius.sm }, animatedStyle, style]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Level card
 * ------------------------------------------------------------------ */

type LevelCardProps = {
  level: number;
  currentXP: number;
  totalXP: number;
  rank: string;
  nextLabel: string;
  streakDays: number;
};

export function LevelCard({ level, currentXP, totalXP, rank, nextLabel, streakDays }: LevelCardProps) {
  const target = totalXP > 0 ? Math.max(0, Math.min(1, currentXP / totalXP)) : 0;
  const fill = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced ? target : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
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
        <Tag label={`${streakDays} day${streakDays === 1 ? '' : 's'} streak`} tone="green" />
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
  autoLabel?: string;
  onPress?: () => void;
};

export function QuestRow({ title, xp, completed, autoLabel, onPress }: QuestRowProps) {
  const box = useSharedValue(completed ? 1 : 0);
  const press = useSharedValue(1);
  const mote = useSharedValue(0);
  const reduced = useReducedMotion();
  const wasCompleted = useRef(completed);

  useEffect(() => {
    if (completed && !wasCompleted.current) {
      if (reduced) {
        box.value = 1;
      } else {
        box.value = withSequence(
          withTiming(beat.questTickScale, { duration: beat.questTick * 0.45, easing: easing.standard }),
          withTiming(1, { duration: beat.questTick * 0.55, easing: easing.standard })
        );
        mote.value = withTiming(1, { duration: beat.xpMote, easing: easing.standard }, () => {
          mote.value = 0;
        });
      }
      AccessibilityInfo.announceForAccessibility?.(`${title} complete. Plus ${xp} XP.`);
    } else if (!completed) {
      box.value = 0;
    }
    wasCompleted.current = completed;
  }, [completed, reduced]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (box.value > 1 ? box.value - 1 : 0) }],
    backgroundColor: completed ? c.ink : 'transparent',
    borderColor: completed ? c.ink : c.borderStrong,
  }));

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const moteStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mote.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(mote.value, [0, 1], [0, -beat.xpMoteRise], Extrapolation.CLAMP) }],
  }));

  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
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
          <Text numberOfLines={2} style={[styles.questTitle, completed && styles.questTitleDone]}>
            {title}
          </Text>
          {autoLabel && !completed && <Text style={styles.autoTracked}>{autoLabel}</Text>}
        </View>

        <View>
          <Tag label={`+${xp} XP`} tone={completed ? 'muted' : 'gold'} />
          <Animated.View pointerEvents="none" style={[styles.mote, moteStyle]}>
            <Tag label={`+${xp} XP`} tone="gold" />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Stat card
 * ------------------------------------------------------------------ */

type StatCardProps = { value: string; label: string; onPress?: () => void };

export function StatCard({ value, label, onPress }: StatCardProps) {
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
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
        <Text style={styles.statLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Water block
 * ------------------------------------------------------------------ */

export function WaterBlock({ total, goal, onLog }: { total: number; goal: number; onLog: () => void }) {
  const target = goal > 0 ? Math.max(0, Math.min(1, total / goal)) : 0;
  const fill = useSharedValue(0);
  const press = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced ? target : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
    return () => cancelAnimation(fill);
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <View style={styles.waterCard}>
      <View style={styles.waterHeader}>
        <Text style={styles.waterLabel}>Water</Text>
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
          <Text style={styles.waterButtonLabel}>+ Log water</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Button — solid-ink primary, outlined secondary. Modals only.
 * ------------------------------------------------------------------ */

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', fullWidth, style }: ButtonProps) {
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <Animated.View style={[animatedStyle, fullWidth && styles.buttonFull, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => setPress(PRESS_SCALE)}
        onPressOut={() => setPress(1)}
        style={[styles.button, variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary]}>
        <Text style={[styles.buttonLabel, variant === 'primary' ? styles.buttonLabelPrimary : styles.buttonLabelSecondary]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Field
 * ------------------------------------------------------------------ */

type FieldProps = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  style?: StyleProp<ViewStyle>;
};

export function Field({ value, onChangeText, placeholder, keyboardType = 'default', style }: FieldProps) {
  return (
    <TextInput
      style={[styles.field, style]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.textMuted}
      keyboardType={keyboardType}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  tagText: {
    ...type.label,
    textTransform: 'uppercase',
  },

  levelCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  levelTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  levelBadge: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  levelLabel: { ...type.label, color: c.textMuted },
  levelNumber: { ...type.serifHeading, color: c.ink },
  xpReadout: { ...type.bodySm, color: c.textSecondary },
  xpTrack: { height: 3, borderRadius: 2, backgroundColor: c.surfaceSunken, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 2, backgroundColor: c.goldFill },
  rankRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  rankName: { ...type.serifHeading, fontFamily: fontFamily.editorialSerifItalic, color: c.ink },
  rankNext: { ...type.bodySm, color: c.textMuted, flexShrink: 1, textAlign: 'right' },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  checkbox: { width: 20, height: 20, borderRadius: radius.sm - 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: c.surface, fontSize: 12, fontFamily: fontFamily.editorialSansBold, lineHeight: 14 },
  questTextBlock: { flex: 1, gap: 2 },
  questTitle: { ...type.body, color: c.ink },
  questTitleDone: { color: c.textMuted, textDecorationLine: 'line-through' },
  autoTracked: { ...type.label, color: c.textMuted, letterSpacing: 0.4 },
  mote: { position: 'absolute', right: 0, top: -22 },

  statCardWrap: { flex: 1 },
  statCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.xs },
  statValue: { ...type.metric, color: c.ink },
  statLabel: { ...type.bodySm, color: c.textSecondary },

  waterCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.md },
  waterHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  waterLabel: { ...type.heading, color: c.ink },
  waterReadout: { ...type.bodySm, color: c.textSecondary },
  waterTrack: { height: 3, borderRadius: 2, backgroundColor: c.surfaceSunken, overflow: 'hidden' },
  waterFill: { height: '100%', borderRadius: 2, backgroundColor: c.blueFill },
  waterButton: { backgroundColor: c.ink, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  waterButtonLabel: { ...type.button, color: c.surface },

  buttonFull: { width: '100%' },
  button: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonPrimary: { backgroundColor: c.ink, borderColor: c.ink },
  buttonSecondary: { backgroundColor: 'transparent', borderColor: c.borderStrong },
  buttonLabel: { ...type.button },
  buttonLabelPrimary: { color: c.surface },
  buttonLabelSecondary: { color: c.ink },

  field: {
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: c.ink,
    fontFamily: fontFamily.editorialSans,
    fontSize: 15,
  },
});
