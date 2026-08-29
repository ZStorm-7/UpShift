// WorkoutScreen — the app recommends today's workout instead of asking the
// user to pick one.
//
// The recommendation comes from the workout template engine
// (data/workoutPlans.ts): the user's stored `tier` (beginner / intermediate
// / advanced / pro) picks one of six templates for that tier, indexed by
// day-of-year plus a rotation offset. Rep counts grow over time via
// progression points.
//
// On this screen the user sees the plan, marks each exercise's sets
// complete, and hits "Finish workout" — that advances progression and
// awards XP, then routes to WorkoutSummary.

import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { awardXP, incrementTodayField } from '../firebase/progress';
import { loadWorkoutState, saveWorkoutState } from '../firebase/workoutState';
import {
  pickTodaysWorkout,
  recordCompletedWorkout,
  decayForInactivity,
  ProgressionState,
  EMPTY_PROGRESSION,
  WorkoutTemplate,
  WORKOUT_TIER_LABELS,
} from '../data/workoutPlans';
import { getTodayKey } from '../firebase/progress';
import haptics from '../services/haptics';
import sound from '../services/sound';

// XP per completed workout — same value as before the redesign so
// existing users don't feel their reward changed.
const WORKOUT_XP = 60;

// Day-of-year, used as the deterministic input to the workout picker.
function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default function WorkoutScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { t } = useLanguage();
  const [state, setState] = useState<ProgressionState>(EMPTY_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<WorkoutTemplate | null>(null);
  const [setsCompleted, setSetsCompleted] = useState<Record<number, number>>({});
  const [finishing, setFinishing] = useState(false);
  const inFlight = useRef(false);

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

  function toggleSet(exIndex: number) {
    if (!workout) return;
    const total = workout.exercises[exIndex].sets;
    setSetsCompleted(prev => {
      const cur = prev[exIndex] || 0;
      const next = cur >= total ? 0 : cur + 1;
      return { ...prev, [exIndex]: next };
    });
    haptics.selection();
    sound.questTick();
  }

  const totalSets   = workout ? workout.exercises.reduce((s, e) => s + e.sets, 0) : 0;
  const doneSets    = Object.values(setsCompleted).reduce((s, n) => s + n, 0);
  const allComplete = totalSets > 0 && doneSets >= totalSets;
  const progressPct = totalSets > 0 ? doneSets / totalSets : 0;

  async function finishWorkout() {
    if (!authUser || !workout || inFlight.current) return;
    inFlight.current = true;
    setFinishing(true);
    try {
      // Award XP + bump the daily "workoutsCompleted" counter
      const { level, currentXP } = await awardXP(authUser.uid, WORKOUT_XP);
      await incrementTodayField(authUser.uid, 'workoutsCompleted', 1);

      // Advance workout progression
      const nextState = recordCompletedWorkout(state, getTodayKey());
      await saveWorkoutState(authUser.uid, nextState);

      haptics.goalMet();
      // Navigate to the celebration screen. `replace` so backing out
      // doesn't return to a "completed" workout that could be finished
      // again.
      navigation.replace('WorkoutSummary', {
        xpGained: WORKOUT_XP,
        level,
        currentXP,
        totalSets,
        workoutTitle: workout.title,
        durationMin: workout.durationMin,
        tierBefore: state.tier,
        tierAfter: nextState.tier,
        leveledUpTier: state.tier !== nextState.tier,
      });
    } catch {
      inFlight.current = false;
      setFinishing(false);
    }
  }

  if (loading || !workout) {
    return (
      <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.md }}>
        <AppBar title="Workout" onBack={() => navigation.goBack()} />
        <Shimmer style={{ height: 100, borderRadius: radius.lg }} />
        <Shimmer style={{ height: 80, borderRadius: radius.lg }} />
        <Shimmer style={{ height: 80, borderRadius: radius.lg }} />
        <Shimmer style={{ height: 80, borderRadius: radius.lg }} />
      </Screen>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar title="Today's Workout" onBack={() => navigation.goBack()} />

        {/* Header — plan card */}
        <Enter index={0}>
          <View style={[styles.planCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.planHeaderRow}>
              <Text style={[styles.tierBadge, { color: palette.accent, borderColor: palette.accentBorder, backgroundColor: palette.accentSoft }]}>
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

        {/* Exercise list */}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {workout.exercises.map((ex, index) => {
            const complete = setsCompleted[index] || 0;
            const done = complete >= ex.sets;
            return (
              <Enter key={ex.name} index={index + 1}>
                <Pressable
                  onPress={() => toggleSet(index)}
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
                      <Text style={[styles.setCount, { color: done ? palette.accent : palette.textPrimary }]}>
                        {complete}/{ex.sets}
                      </Text>
                      <Text style={[styles.setLabel, { color: palette.textMuted }]}>sets</Text>
                    </View>
                  </View>
                  <View style={styles.exerciseSpec}>
                    <SpecItem label="Reps"  value={ex.reps}                       palette={palette} />
                    <SpecItem label="Rest"  value={`${ex.restSec}s`}              palette={palette} />
                    <SpecItem label="Focus" value={workout.focus.split(',')[0].trim()} palette={palette} />
                  </View>
                </Pressable>
              </Enter>
            );
          })}
        </View>

        {/* Explainer strip */}
        <View style={[styles.explainer, { borderColor: palette.border }]}>
          <Text style={[styles.explainerText, { color: palette.textMuted }]}>
            Tap an exercise to mark a set complete. This workout is picked for your
            current tier ({WORKOUT_TIER_LABELS[state.tier]}); tomorrow's will be different.
          </Text>
        </View>
      </Screen>

      {/* Floating finish button */}
      <View style={styles.fabWrap}>
        <Button
          label={finishing ? 'Saving…' : allComplete ? 'Finish workout' : `Finish (${doneSets}/${totalSets} sets)`}
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
