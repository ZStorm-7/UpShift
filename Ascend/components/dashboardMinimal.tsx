// Dashboard's actual presentation layer.
//
// Originally built as "restyled equivalents of the pieces in
// components/dashboard.tsx, against theme/minimal.ts instead of
// theme/colors.ts" — a proof-of-concept variant. Converted here to read
// colors from the app-wide light/dark palette (theme/themedColors.ts)
// instead of the static minimalColors object, so the Dashboard actually
// responds to the Settings toggle like every other screen. Structural
// values (spacing, radius, type sizes) still come from theme/minimal.ts —
// those were never the problem, only the hardcoded colors and a few
// stray editorial-font overrides were.
//
// `Enter` (the entrance stagger) and `LevelUpTakeover` (the level-up
// overlay) are still reused unmodified from components/dashboard.tsx.

import { useEffect, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { minimalType as type, minimalSpacing as spacing, minimalRadius as radius } from '../theme/minimal';
import { usePalette } from '../theme/themedColors';
import { duration, easing, beat, PRESS_SCALE } from '../animation/motion';

/* ------------------------------------------------------------------ *
 * Tag — the screen's one legitimate pill: small, uppercase, tracked,
 * pastel-filled. Used for XP values and the streak line.
 * ------------------------------------------------------------------ */

export function Tag({ label, tone = 'gold' }: { label: string; tone?: 'gold' | 'green' | 'blue' | 'red' | 'muted' }) {
  const palette = usePalette();
  const bg =
    tone === 'gold' ? palette.xpSoft
    : tone === 'green' ? palette.successSoft
    : tone === 'blue' ? palette.infoSoft
    : tone === 'red' ? palette.dangerSoft
    : palette.surfaceSunken;
  const fg =
    tone === 'gold' ? palette.xp
    : tone === 'green' ? palette.success
    : tone === 'blue' ? palette.info
    : tone === 'red' ? palette.danger
    : palette.textMuted;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Shimmer — the loading skeleton, palette-aware so it doesn't flash
 * near-black boxes on a light background or near-white boxes on dark.
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
  const palette = usePalette();
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
    backgroundColor: interpolateColor(t.value, [0, 1], [palette.surfaceSunken, palette.border]),
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
  const palette = usePalette();
  const target = totalXP > 0 ? Math.max(0, Math.min(1, currentXP / totalXP)) : 0;
  const fill = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced ? target : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
    return () => cancelAnimation(fill);
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
    backgroundColor: palette.xp,
  }));

  return (
    <View style={[styles.levelCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.levelTopRow}>
        <View style={styles.levelBadge}>
          <Text style={[styles.levelLabel, { color: palette.textMuted }]}>LEVEL</Text>
          <Text style={[styles.levelNumber, { color: palette.textPrimary }]}>{level}</Text>
        </View>
        <Text style={[styles.xpReadout, { color: palette.textSecondary }]}>
          {currentXP} / {totalXP} XP
        </Text>
      </View>

      <View style={[styles.xpTrack, { backgroundColor: palette.surfaceSunken }]}>
        <Animated.View style={[styles.xpFill, fillStyle]} />
      </View>

      <View style={styles.rankRow}>
        <Text style={[styles.rankName, { color: palette.textPrimary }]}>{rank}</Text>
        <Text style={[styles.rankNext, { color: palette.textMuted }]}>{nextLabel}</Text>
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
  const palette = usePalette();
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
    backgroundColor: completed ? palette.textPrimary : 'transparent',
    borderColor: completed ? palette.textPrimary : palette.borderStrong,
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
          {completed && <Ionicons name="checkmark" size={14} color={palette.surface} />}
        </Animated.View>

        <View style={styles.questTextBlock}>
          <Text
            numberOfLines={2}
            style={[
              styles.questTitle,
              { color: palette.textPrimary },
              completed && { color: palette.textMuted, textDecorationLine: 'line-through' },
            ]}>
            {title}
          </Text>
          {autoLabel && !completed && (
            <Text style={[styles.autoTracked, { color: palette.textMuted }]}>{autoLabel}</Text>
          )}
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
  const palette = usePalette();
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
        style={[styles.statCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.statValue, { color: palette.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[styles.statLabel, { color: palette.textSecondary }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Water block
 * ------------------------------------------------------------------ */

export function WaterBlock({ total, goal, onLog }: { total: number; goal: number; onLog: () => void }) {
  const palette = usePalette();
  const target = goal > 0 ? Math.max(0, Math.min(1, total / goal)) : 0;
  const fill = useSharedValue(0);
  const press = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    fill.value = reduced ? target : withTiming(target, { duration: beat.xpBar, easing: easing.standard });
    return () => cancelAnimation(fill);
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
    backgroundColor: palette.info,
  }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  return (
    <View style={[styles.waterCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.waterHeader}>
        <Text style={[styles.waterLabel, { color: palette.textPrimary }]}>Water</Text>
        <Text style={[styles.waterReadout, { color: palette.textSecondary }]}>
          {total}ml / {goal}ml
        </Text>
      </View>

      <View style={[styles.waterTrack, { backgroundColor: palette.surfaceSunken }]}>
        <Animated.View style={[styles.waterFill, fillStyle]} />
      </View>

      <Animated.View style={pressStyle}>
        <Pressable
          accessibilityRole="button"
          onPress={onLog}
          onPressIn={() => setPress(PRESS_SCALE)}
          onPressOut={() => setPress(1)}
          style={[styles.waterButton, { backgroundColor: palette.textPrimary }]}>
          <Text style={[styles.waterButtonLabel, { color: palette.surface }]}>+ Log water</Text>
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
  const palette = usePalette();
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const setPress = (v: number) => {
    press.value = reduced ? v : withTiming(v, { duration: duration.instant, easing: easing.standard });
  };

  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: palette.textPrimary, borderColor: palette.textPrimary }
      : { backgroundColor: 'transparent', borderColor: palette.borderStrong };
  const labelColor = variant === 'primary' ? palette.surface : palette.textPrimary;

  return (
    <Animated.View style={[animatedStyle, fullWidth && styles.buttonFull, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => setPress(PRESS_SCALE)}
        onPressOut={() => setPress(1)}
        style={[styles.button, variantStyle]}>
        <Text style={[styles.buttonLabel, { color: labelColor }]} numberOfLines={1}>
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
  const palette = usePalette();
  return (
    <TextInput
      style={[
        styles.field,
        { backgroundColor: palette.surfaceSunken, borderColor: palette.border, color: palette.textPrimary },
        style,
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.textMuted}
      keyboardType={keyboardType}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Styles — structural only (spacing, radius, type sizes). All color
 * properties were removed from here and now come from usePalette() at
 * each JSX call site above, since a static StyleSheet.create() is
 * evaluated once at module load and can never react to the theme
 * toggle — see the file header comment.
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
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  levelTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  levelBadge: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  levelLabel: { ...type.label },
  levelNumber: { ...type.serifHeading },
  xpReadout: { ...type.bodySm },
  xpTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  rankName: { ...type.serifHeading },
  rankNext: { ...type.bodySm, flexShrink: 1, textAlign: 'right' },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  checkbox: { width: 20, height: 20, borderRadius: radius.sm - 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  questTextBlock: { flex: 1, gap: 2 },
  questTitle: { ...type.body },
  autoTracked: { ...type.label, letterSpacing: 0.4 },
  mote: { position: 'absolute', right: 0, top: -22 },

  statCardWrap: { flex: 1 },
  statCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  statValue: { ...type.metric },
  statLabel: { ...type.bodySm },

  waterCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  waterHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  waterLabel: { ...type.heading },
  waterReadout: { ...type.bodySm },
  waterTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  waterFill: { height: '100%', borderRadius: 2 },
  waterButton: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  waterButtonLabel: { ...type.button },

  buttonFull: { width: '100%' },
  button: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonLabel: { ...type.button },

  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
  },
});
