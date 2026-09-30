// WorkoutSessionBody — the actual "tap through sets and finish" workout
// experience. Extracted out of WorkoutScreen so it can be rendered from two
// different places without duplicating this logic:
//   1. Inline, on the Workout tab itself, for the FIRST session of the day —
//      "not done yet" should show the real sets/reps immediately, no extra
//      tap required.
//   2. On its own screen (WorkoutSessionScreen), reached by tapping "Log
//      another workout" from WorkoutScreen's hub once today's workout is
//      already done — a SECOND session needs a deliberate action to start,
//      rather than just reappearing (with all its local set-counters reset
//      to zero) the moment you revisit the tab.
//
// Both call sites get the identical exercise list, set-tapping, and
// finish/XP flow — the only thing that differs is what's rendered AROUND it.

import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getDoc } from 'firebase/firestore';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, Palette } from '../theme/themedColors';
import { easing } from '../animation/motion';
import { Screen, AppBar, Button } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import MuscleRecovery from '../components/MuscleRecovery';
import { useUser } from '../context/UserContext';
import { awardXP, incrementTodayField, incrementStatsField, getTodayKey } from '../firebase/progress';
import { checkAchievementsForUser } from '../firebase/achievements';
import { celebrateAchievements } from '../utils/achievementAlert';
import { musclesTrainedFor } from '../data/muscleGroups';
import { muscleLogDocRef, recordMusclesTrainedToday, MuscleLogEntry } from '../firebase/muscleLog';
import {
  loadWorkoutState,
  saveWorkoutState,
} from '../firebase/workoutState';
import {
  pickTodaysWorkout,
  recordCompletedWorkout,
  decayForInactivity,
  ProgressionState,
  EMPTY_PROGRESSION,
  WorkoutTemplate,
  Exercise,
  WORKOUT_TIER_LABELS,
} from '../data/workoutPlans';
import haptics from '../services/haptics';
import { xpMultiplier } from '../utils/birthday';
import { safeGoBack } from '../utils/nav';

// XP per completed workout — same value as before the redesign so
// existing users don't feel their reward changed.
const WORKOUT_XP = 60;

// How long an exercise stays visible, showing its completed state, after its
// last set is tapped — before ExerciseCard's own exit animation plays and it
// leaves the list for good. Long enough to register as "you finished this"
// rather than the card vanishing under the finger that just tapped it; short
// enough that clearing a 4-exercise workout doesn't feel like a wait.
const EXERCISE_CLEAR_DELAY_MS = 550;

// Day-of-year, used as the deterministic input to the workout picker.
function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function WorkoutSessionBody({
  navigation,
  onBack,
}: {
  navigation: any;
  /** Overrides the AppBar's back behavior — WorkoutScreen renders this
   *  inline (no back arrow makes sense there beyond the tab itself), where
   *  WorkoutSessionScreen wants the normal safeGoBack. Undefined hides the
   *  back arrow rather than guessing. */
  onBack?: () => void;
}) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const [state, setState] = useState<ProgressionState>(EMPTY_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<WorkoutTemplate | null>(null);
  const [setsCompleted, setSetsCompleted] = useState<Record<number, number>>({});
  const [finishing, setFinishing] = useState(false);
  const inFlight = useRef(false);

  const [muscleEntries, setMuscleEntries] = useState<MuscleLogEntry[]>([]);

  useEffect(() => {
    if (!authUser) return;
    getDoc(muscleLogDocRef(authUser.uid))
      .then(snap => setMuscleEntries((snap.data()?.entries as MuscleLogEntry[]) || []))
      .catch(() => setMuscleEntries([]));
  }, [authUser?.uid]);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setLoading(true);
      try {
        const raw = await loadWorkoutState(authUser.uid);
        const decayed = decayForInactivity(raw, getTodayKey());
        setState(decayed);
        setWorkout(pickTodaysWorkout(decayed, dayOfYear()));
      } catch {
        setState(EMPTY_PROGRESSION);
        setWorkout(pickTodaysWorkout(EMPTY_PROGRESSION, dayOfYear()));
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.uid]);

  // Exercises whose completion celebration has finished playing and should
  // no longer render at all — see toggleSet below for when this fills in.
  const [clearedExercises, setClearedExercises] = useState<Set<number>>(new Set());

  function toggleSet(exIndex: number) {
    if (!workout) return;
    const total = workout.exercises[exIndex].sets;
    const cur = setsCompleted[exIndex] || 0;
    if (cur >= total) return;
    const next = cur + 1;
    setSetsCompleted(prev => ({ ...prev, [exIndex]: next }));
    haptics.selection();
    if (next >= total) {
      haptics.goalMet();
      setTimeout(() => {
        setClearedExercises(prev => new Set(prev).add(exIndex));
      }, EXERCISE_CLEAR_DELAY_MS);
    }
  }

  const totalSets = workout ? workout.exercises.reduce((s, e) => s + e.sets, 0) : 0;
  const doneSets = workout
    ? workout.exercises.reduce((sum, ex, i) => sum + Math.min(setsCompleted[i] || 0, ex.sets), 0)
    : 0;
  const allComplete = totalSets > 0 && doneSets >= totalSets;
  const progressPct = totalSets > 0 ? doneSets / totalSets : 0;

  async function finishWorkout() {
    if (!authUser || !workout || inFlight.current) return;
    inFlight.current = true;
    setFinishing(true);
    // Finishing early (the Finish button only requires doneSets > 0, not
    // allComplete — see the FAB below) shouldn't pay the same as finishing
    // every set. Scaling the flat WORKOUT_XP by how much of the workout
    // actually got done means someone who has to bail after 4 of 12 sets
    // still gets credit for what they did, without it being worth as much
    // as the full session.
    const completionRatio = totalSets > 0 ? doneSets / totalSets : 1;
    const gainedXP = Math.round(
      WORKOUT_XP * completionRatio * xpMultiplier(profile?.birthdayMonth, profile?.birthdayDay)
    );

    try {
      await awardXP(authUser.uid, gainedXP);
      await incrementTodayField(authUser.uid, 'workoutsCompleted', 1);
      await incrementStatsField(authUser.uid, 'totalWorkoutsCompleted', 1);

      const nextState = recordCompletedWorkout(state, getTodayKey());
      await saveWorkoutState(authUser.uid, nextState);

      haptics.goalMet();
      checkAchievementsForUser(authUser.uid).then(celebrateAchievements).catch(() => {});
      recordMusclesTrainedToday(authUser.uid, musclesTrainedFor(workout.focus)).catch(() => {});
      navigation.replace('WorkoutSummary', {
        xpEarned: gainedXP,
        completedSets: doneSets,
        totalSets,
        exerciseCount: workout.exercises.length,
        muscleGroup: workout.title,
        durationMinutes: workout.durationMin,
      });
    } catch {
      inFlight.current = false;
      setFinishing(false);
    }
  }

  if (loading || !workout) {
    return (
      <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.md }}>
        <AppBar title="Workout" onBack={onBack} />
        <Shimmer width="100%" height={100} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
      </Screen>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar title="Today's Workout" onBack={onBack} />

        {/* Header — plan card */}
        <Enter index={0}>
          <View style={[styles.planCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.planHeaderRow}>
              <Text style={[styles.tierBadge, { color: palette.accentText, borderColor: palette.accentBorder, backgroundColor: palette.accentSoft }]}>
                {WORKOUT_TIER_LABELS[workout.tier].toUpperCase()}
              </Text>
              <Text style={[styles.duration, { color: palette.textMuted }]}>
                ~{workout.durationMin} min
              </Text>
            </View>
            <Text style={[styles.planTitle, { color: palette.textPrimary }]}>{workout.title}</Text>
            <Text style={[styles.planFocus, { color: palette.textSecondary }]}>{workout.focus}</Text>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: palette.surfaceSunken }]}>
              <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: palette.accent }]} />
            </View>
            <Text style={[styles.progressText, { color: palette.textMuted }]}>
              {doneSets} / {totalSets} sets
            </Text>
          </View>
        </Enter>

        {/* Recovery view — where each muscle group stands since it was last
            trained, so today's plan can be weighed against what's actually
            due rather than only against the fixed rotation. */}
        <Enter index={1}>
          <View style={{ marginTop: spacing.md }}>
            <MuscleRecovery entries={muscleEntries} palette={palette} />
          </View>
        </Enter>

        {/* Exercise list */}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {workout.exercises.map((ex, index) => {
            if (clearedExercises.has(index)) return null;
            const complete = setsCompleted[index] || 0;
            const done = complete >= ex.sets;
            return (
              <Enter key={ex.name} index={index + 1}>
                <ExerciseCard
                  ex={ex}
                  complete={complete}
                  done={done}
                  focus={workout.focus.split(',')[0].trim()}
                  palette={palette}
                  onPress={() => toggleSet(index)}
                />
              </Enter>
            );
          })}
        </View>

        {/* Explainer strip */}
        <View style={[styles.explainer, { borderColor: palette.border }]}>
          <Text style={[styles.explainerText, { color: palette.textMuted }]}>
            Tap an exercise to mark a set complete. This workout is customized for your
            current tier ({WORKOUT_TIER_LABELS[state.tier]}).
          </Text>
        </View>
      </Screen>

      {/* Floating finish button */}
      <View style={styles.fabWrap}>
        <Button
          label={
            finishing ? 'Saving…'
            : allComplete ? 'Finish workout'
            : `Finish (${doneSets}/${totalSets} sets)`
          }
          onPress={finishWorkout}
          variant={allComplete ? 'primary' : 'secondary'}
          fullWidth
          disabled={finishing || doneSets === 0}
        />
      </View>
    </View>
  );
}

function SpecItem({ label, value, palette }: any) {
  return (
    <View style={styles.spec}>
      <Text style={[styles.specLabel, { color: palette.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.specValue, { color: palette.textPrimary }]}>{value}</Text>
    </View>
  );
}

// One exercise's card, including its own completion celebration. Tapping it
// while `done` is false marks the next set; the moment `done` flips true
// (the parent decides that — this component just reacts to it) this plays a
// quick pulse + checkmark, then fades and shrinks itself out over the same
// window the parent holds before actually removing it from the list — so the
// card is already invisible by the time it's pulled from the array, instead
// of just vanishing outright.
function ExerciseCard({
  ex,
  complete,
  done,
  focus,
  palette,
  onPress,
}: {
  ex: Exercise;
  complete: number;
  done: boolean;
  focus: string;
  palette: Palette;
  onPress: () => void;
}) {
  const pulse = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    if (!done) return;
    pulse.value = withSequence(
      withTiming(1, { duration: 150, easing: easing.standard }),
      withTiming(0, { duration: 150, easing: easing.standard })
    );
    checkOpacity.value = withTiming(1, { duration: 150 });
    exit.value = withDelay(300, withTiming(1, { duration: 250, easing: easing.standard }));
  }, [done]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exit.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [1, 1.03], Extrapolation.CLAMP)
          * interpolate(exit.value, [0, 1], [1, 0.94], Extrapolation.CLAMP) },
    ],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: interpolate(checkOpacity.value, [0, 1], [0.6, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPress={onPress}
        disabled={done}
        style={[
          styles.exerciseCard,
          { backgroundColor: palette.surface, borderColor: done ? palette.accentBorder : palette.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${ex.name}, ${complete} of ${ex.sets} sets complete. Tap to mark next set.`}>
        <View style={styles.exerciseHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.exerciseName, { color: palette.textPrimary }]}>{ex.name}</Text>
            {ex.cue && (
              <Text style={[styles.exerciseCue, { color: palette.textMuted }]}>{ex.cue}</Text>
            )}
          </View>
          <View style={styles.setCounter}>
            {done ? (
              <Animated.View style={checkStyle}>
                <Ionicons name="checkmark-circle" size={26} color={palette.accent} />
              </Animated.View>
            ) : (
              <>
                <Text style={[styles.setCount, { color: palette.textPrimary }]}>
                  {complete}/{ex.sets}
                </Text>
                <Text style={[styles.setLabel, { color: palette.textMuted }]}>sets</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.exerciseSpec}>
          <SpecItem label="Reps"  value={ex.reps}          palette={palette} />
          <SpecItem label="Rest"  value={`${ex.restSec}s`} palette={palette} />
          <SpecItem label="Focus" value={focus}            palette={palette} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 120 },

  planCard: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  planHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierBadge: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10, letterSpacing: 0.8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: layout.hairline,
    overflow: 'hidden',
  },
  duration: { fontFamily: fontFamily.sans, fontSize: 13 },
  planTitle: { fontFamily: fontFamily.serif, fontSize: 24, marginTop: 2 },
  planFocus: { fontFamily: fontFamily.sans, fontSize: 14 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressText:  { fontFamily: fontFamily.sansBold, fontSize: 12, marginTop: 4 },
  exerciseCard: {
    borderRadius: radius.lg, borderWidth: layout.hairline,
    padding: spacing.md, gap: spacing.sm,
  },
  exerciseHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  exerciseName: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  exerciseCue:  { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
  setCounter:   { alignItems: 'center', minWidth: 56 },
  setCount:     { fontFamily: fontFamily.sansBlack, fontSize: 22 },
  setLabel:     { fontFamily: fontFamily.sans, fontSize: 11, letterSpacing: 0.6 },
  exerciseSpec: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  spec:         { gap: 2 },
  specLabel:    { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.6 },
  specValue:    { fontFamily: fontFamily.sansBold, fontSize: 14 },

  explainer: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: layout.hairline,
    borderStyle: 'dashed',
  },
  explainerText: { fontFamily: fontFamily.sans, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  fabWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg,
  },
});
