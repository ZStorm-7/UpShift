// WorkoutScreen — the Workout tab's landing view.
//
// The recommendation comes from the workout template engine
// (data/workoutPlans.ts): the user's stored `tier` (beginner / intermediate
// / advanced / pro) picks one of six templates for that tier, indexed by
// day-of-year plus a rotation offset. Rep counts grow over time via
// progression points. Tier itself starts from the onboarding lifting-
// experience answer (see tierFromOnboardingAnswer) and climbs from there
// through in-app progression.
//
// Two very different things can happen here, based on whether today's
// workout is already done (ProgressionState.lastWorkoutDate === today):
//   * NOT done yet: shows the real sets/reps immediately (WorkoutSessionBody
//     rendered inline) — no extra tap between opening the tab and starting.
//   * Already done: shows a compact "logged for today" hub instead, with
//     Muscle Recovery and a "Log another workout" button. That button pushes
//     to WorkoutSessionScreen, a SEPARATE screen — re-showing the exact same
//     exercise list in place, with all its local set-counters silently reset
//     to zero, read as "did my sets get undone?" rather than "start a new
//     session," which is why a second session is a deliberate navigation
//     rather than something the tab just reappears into.
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import MuscleRecovery from '../components/MuscleRecovery';
import { WorkoutSessionBody } from '../components/WorkoutSession';
import { useUser } from '../context/UserContext';
import { getTodayKey } from '../firebase/progress';
import {
  loadWorkoutState,
  isFirstWorkoutVisitToday,
  recordWorkoutVisit,
} from '../firebase/workoutState';
import {
  pickTodaysWorkout,
  decayForInactivity,
  ProgressionState,
  EMPTY_PROGRESSION,
  WorkoutTemplate,
  WORKOUT_TIER_LABELS,
} from '../data/workoutPlans';
import { muscleLogDocRef, MuscleLogEntry } from '../firebase/muscleLog';
import haptics from '../services/haptics';
import { safeGoBack } from '../utils/nav';

// A run/walk exercise is detected by name — none of the current templates
// include one, but this is what routes a future "Run" or "Walk" exercise to
// the sensor mode instead of the camera mode.
const RUN_WALK_PATTERN = /\brun|\bjog|\bwalk/i;

// Day-of-year, used as the deterministic input to the workout picker.
function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default function WorkoutScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const [state, setState] = useState<ProgressionState>(EMPTY_PROGRESSION);
  const [workout, setWorkout] = useState<WorkoutTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [muscleEntries, setMuscleEntries] = useState<MuscleLogEntry[]>([]);

  // Whether THIS is the first time the Workout screen has been opened today
  // (null while unknown). First visit: greet + offer camera/sensor/manual.
  // Every visit after that, same day: skip straight past the greeting.
  const [firstVisitToday, setFirstVisitToday] = useState<boolean | null>(null);
  const [pastGreeting, setPastGreeting] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    isFirstWorkoutVisitToday(authUser.uid, getTodayKey())
      .then(isFirst => {
        setFirstVisitToday(isFirst);
        if (isFirst) recordWorkoutVisit(authUser.uid, getTodayKey());
      })
      .catch(() => setFirstVisitToday(false)); // fail open — show the workout, not a stuck greeting
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

  // Re-checked every time this screen regains focus (returning from
  // WorkoutSessionScreen after finishing a second session, say) via the
  // focus listener below, not just on mount.
  useEffect(() => {
    if (!authUser) return;
    const reload = () => {
      getDoc(muscleLogDocRef(authUser.uid))
        .then(snap => setMuscleEntries((snap.data()?.entries as MuscleLogEntry[]) || []))
        .catch(() => setMuscleEntries([]));
      loadWorkoutState(authUser.uid)
        .then(raw => setState(decayForInactivity(raw, getTodayKey())))
        .catch(() => {});
    };
    reload();
    const unsubscribe = navigation.addListener('focus', reload);
    return unsubscribe;
  }, [authUser?.uid, navigation]);

  const doneToday = state.lastWorkoutDate === getTodayKey();

  if (loading || !workout || firstVisitToday === null) {
    return (
      <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.md }}>
        <AppBar title="Workout" onBack={() => safeGoBack(navigation)} />
        <Shimmer width="100%" height={100} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
        <Shimmer width="100%" height={80} radius={radius.lg} />
      </Screen>
    );
  }

  // First visit today, mode not yet chosen: greet, then offer sensor /
  // manual. A run/walk exercise offers the sensor card, since that's a
  // genuinely different, orthogonal feature; everything else goes straight
  // to manual.
  if (firstVisitToday && !pastGreeting && !doneToday) {
    const isRunWalk = workout.exercises.some(ex => RUN_WALK_PATTERN.test(ex.name));
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const goToSensor = () => {
      setPastGreeting(true);
      haptics.selection();
      navigation.navigate('WorkoutSensor', { exerciseName: workout.exercises[0]?.name });
    };
    const goManual = () => {
      setPastGreeting(true);
      haptics.selection();
    };

    return (
      <Screen scroll contentStyle={{ backgroundColor: palette.bg }}>
        <AppBar title="Workout" onBack={() => safeGoBack(navigation)} />
        <View style={styles.greetingBody}>
          <Text style={[styles.greetingText, { color: palette.textPrimary }]}>
            {greeting}{(profile?.nickname || profile?.firstName) ? `, ${profile?.nickname || profile?.firstName}` : ''}!
          </Text>
          <Text style={[styles.greetingSubtitle, { color: palette.textSecondary }]}>
            Today's plan: {workout.title} ({WORKOUT_TIER_LABELS[workout.tier]}).
            {isRunWalk ? ' How do you want to track it?' : ''}
          </Text>

          {isRunWalk && (
            <>
              <Text style={[styles.betaLabel, { color: palette.textMuted, borderColor: palette.border }]}>BETA</Text>
              <Pressable
                onPress={goToSensor}
                style={[styles.modeCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                accessibilityRole="button">
                <Ionicons name="walk" size={24} color={palette.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, { color: palette.textPrimary }]}>Sensor</Text>
                  <Text style={[styles.modeSubtitle, { color: palette.textMuted }]}>
                    Keep your phone on you — it'll confirm you're moving.
                  </Text>
                </View>
                <Text style={[styles.modeChevron, { color: palette.textMuted }]}>›</Text>
              </Pressable>
              <Pressable onPress={goManual} style={styles.manualLink} hitSlop={8}>
                <Text style={[styles.manualLinkText, { color: palette.accentText }]}>
                  Or just track it manually
                </Text>
              </Pressable>
            </>
          )}

          {!isRunWalk && (
            <Button label="Start workout" onPress={goManual} fullWidth glow style={styles.startButton} />
          )}
        </View>
      </Screen>
    );
  }

  // Already done today — a compact hub instead of the exercise list, so
  // reopening the tab doesn't look like the workout un-finished itself.
  // "Log another workout" is a deliberate push to its own screen instance.
  if (doneToday) {
    return (
      <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.lg }}>
        <AppBar title="Workout" onBack={() => safeGoBack(navigation)} />
        <Enter index={0}>
          <View style={[styles.doneCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.doneIconCircle, { backgroundColor: palette.accentSoft }]}>
              <Ionicons name="checkmark" size={28} color={palette.accent} />
            </View>
            <Text style={[styles.doneTitle, { color: palette.textPrimary }]}>Today's workout is logged</Text>
            <Text style={[styles.doneSubtitle, { color: palette.textSecondary }]}>
              {workout.title} · {WORKOUT_TIER_LABELS[workout.tier]}
            </Text>
          </View>
        </Enter>
        <Enter index={1}>
          <MuscleRecovery entries={muscleEntries} palette={palette} />
        </Enter>
        <Enter index={2}>
          <Button
            label="Log another workout"
            onPress={() => navigation.navigate('WorkoutSession')}
            variant="secondary"
            fullWidth
          />
        </Enter>
      </Screen>
    );
  }

  // Not done yet — the real thing, right here, no extra tap.
  return <WorkoutSessionBody navigation={navigation} onBack={() => safeGoBack(navigation)} />;
}

const styles = StyleSheet.create({
  // Greeting + mode picker (first visit of the day)
  greetingBody: { flex: 1, padding: spacing.lg, gap: spacing.md },
  greetingText: { fontFamily: fontFamily.serif, fontSize: 26, marginTop: spacing.xl },
  greetingSubtitle: { fontFamily: fontFamily.sans, fontSize: 14, marginBottom: spacing.md },
  startButton: { marginTop: spacing.sm },
  betaLabel: {
    alignSelf: 'flex-start',
    fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 1.2,
    borderWidth: layout.hairline, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
    marginTop: spacing.lg,
  },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, borderWidth: layout.hairline,
    padding: spacing.lg,
  },
  modeTitle: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  modeSubtitle: { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
  modeChevron: { fontSize: 22 },
  manualLink: {
    alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  manualLinkText: { fontFamily: fontFamily.sansBold, fontSize: 14 },

  // Done-for-today hub
  doneCard: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  doneIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  doneTitle: { fontFamily: fontFamily.serif, fontSize: 20 },
  doneSubtitle: { fontFamily: fontFamily.sans, fontSize: 14 },
});
