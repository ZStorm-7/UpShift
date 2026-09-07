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
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { awardXP, incrementTodayField } from '../firebase/progress';
import {
  loadWorkoutState,
  saveWorkoutState,
  isFirstWorkoutVisitToday,
  recordWorkoutVisit,
} from '../firebase/workoutState';
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
import WorkoutCalendar from '../components/WorkoutCalendar';
import { xpMultiplier } from '../utils/birthday';
import { safeGoBack } from '../utils/nav';

// A run/walk exercise is detected by name — none of the current templates
// include one, but this is what routes a future "Run" or "Walk" exercise to
// the sensor mode instead of the camera mode.
const RUN_WALK_PATTERN = /\brun|\bjog|\bwalk/i;

// XP per completed workout — same value as before the redesign so
// existing users don't feel their reward changed.
const WORKOUT_XP = 60;

// ── Overtime ──
//
// "Overtime" begins once every prescribed set is done and the user keeps
// going. Extra sets past the plan earn bonus XP, but the bonus is BOUNDED:
// +3 XP per extra set, capped at +30 total (10 extra sets' worth). Without
// a cap this would be the single easiest XP source in the app — tapping one
// exercise card repeatedly is far cheaper than completing quests — so the
// cap is what keeps the reward proportional to a genuinely longer session
// rather than to how long someone is willing to tap.
const OVERTIME_XP_PER_SET = 3;
const OVERTIME_XP_CAP = 30;
// Per-exercise ceiling on overtime taps, after which the counter wraps back
// to zero (preserving the "tap again to reset" affordance).
const OVERTIME_MAX_SETS_PER_EXERCISE = 5;

export function overtimeBonusXP(overtimeSets: number): number {
  if (overtimeSets <= 0) return 0;
  return Math.min(overtimeSets * OVERTIME_XP_PER_SET, OVERTIME_XP_CAP);
}

// Day-of-year, used as the deterministic input to the workout picker.
function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default function WorkoutScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [state, setState] = useState<ProgressionState>(EMPTY_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<WorkoutTemplate | null>(null);
  const [setsCompleted, setSetsCompleted] = useState<Record<number, number>>({});
  const [finishing, setFinishing] = useState(false);
  const inFlight = useRef(false);

  // Whether THIS is the first time the Workout screen has been opened today
  // (null while unknown). First visit: greet + offer camera/sensor/manual.
  // Every visit after that, same day: skip straight to the exercise list and
  // also show the rest-of-month calendar (see the render below).
  const [firstVisitToday, setFirstVisitToday] = useState<boolean | null>(null);
  // Flips true once the user has picked a mode (camera, sensor, or manual)
  // on a first-visit-today greeting — reveals the normal exercise list.
  // Also set on return-from-camera/sensor, so coming back doesn't re-show
  // the greeting a second time.
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

  // Placeholder — no actual audio wired up yet. Exists so the button has
  // somewhere to live in the layout ahead of a real music-during-workout
  // feature; tapping it just says so rather than silently doing nothing.
  const handleAddMusic = () => {
    haptics.selection();
    Alert.alert('Background music', "Coming soon — you'll be able to play music during your workout from here.");
  };

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
    // Taps now continue PAST the prescribed set count into overtime, up to
    // OVERTIME_MAX_SETS_PER_EXERCISE extra, and only then wrap back to 0.
    // The wrap is what preserves the old "tap again to reset" affordance —
    // it just sits further along now that overtime exists.
    const ceiling = total + OVERTIME_MAX_SETS_PER_EXERCISE;
    setSetsCompleted(prev => {
      const cur = prev[exIndex] || 0;
      const next = cur >= ceiling ? 0 : cur + 1;
      return { ...prev, [exIndex]: next };
    });
    haptics.selection();
    sound.questTick();
  }

  const totalSets = workout ? workout.exercises.reduce((s, e) => s + e.sets, 0) : 0;

  // Prescribed vs overtime are counted PER EXERCISE and then summed, not
  // from the raw grand total. Summing raw taps and subtracting totalSets
  // would mean four extra sets on one exercise show "+1 over" on that card
  // while the workout as a whole still reads as incomplete — the card and
  // the header would be telling the user two different things, and the
  // overtime XP would silently not accrue for overage the UI had already
  // credited.
  const { prescribedDone, overtimeSets } = workout
    ? workout.exercises.reduce(
        (acc, ex, i) => {
          const done = setsCompleted[i] || 0;
          acc.prescribedDone += Math.min(done, ex.sets);
          acc.overtimeSets += Math.max(0, done - ex.sets);
          return acc;
        },
        { prescribedDone: 0, overtimeSets: 0 },
      )
    : { prescribedDone: 0, overtimeSets: 0 };

  const doneSets = prescribedDone + overtimeSets;
  const allComplete = totalSets > 0 && prescribedDone >= totalSets;
  // Progress bar tracks PRESCRIBED work only, so it fills to exactly 100%
  // at the end of the plan; overtime is called out separately below rather
  // than overflowing the bar.
  const progressPct = totalSets > 0 ? prescribedDone / totalSets : 0;
  const inOvertime = overtimeSets > 0;
  const overtimeXP = overtimeBonusXP(overtimeSets);
  const overtimeCapped = overtimeXP >= OVERTIME_XP_CAP;

  async function finishWorkout() {
    if (!authUser || !workout || inFlight.current) return;
    inFlight.current = true;
    setFinishing(true);
    // Base + bounded overtime bonus, then the birthday multiplier applied
    // to the whole thing (see utils/birthday.ts) so every XP source in the
    // app gets the boost from one shared rule.
    const baseXP = WORKOUT_XP + overtimeXP;
    const gainedXP = baseXP * xpMultiplier(profile?.birthdayMonth, profile?.birthdayDay);

    try {
      // Award XP + bump the daily "workoutsCompleted" counter
      const { level, currentXP } = await awardXP(authUser.uid, gainedXP);
      await incrementTodayField(authUser.uid, 'workoutsCompleted', 1);

      // Advance workout progression
      const nextState = recordCompletedWorkout(state, getTodayKey());
      await saveWorkoutState(authUser.uid, nextState);

      haptics.goalMet();
      // Navigate to the celebration screen. `replace` so backing out
      // doesn't return to a "completed" workout that could be finished
      // again.
      navigation.replace('WorkoutSummary', {
        xpGained: gainedXP,
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
  // manual. Camera-based rep counting was removed entirely (it was a
  // placeholder — see git history — that only simulated counting reps, with
  // no real pose tracking behind it); manual is now the only path for the
  // overwhelming majority of exercises in this app, and reads as the primary
  // action rather than a fallback link. A run/walk exercise still offers the
  // sensor card, since that's a genuinely different, orthogonal feature.
  if (firstVisitToday && !pastGreeting) {
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
            {greeting}{profile?.firstName ? `, ${profile.firstName}` : ''}!
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

          {/* Manual is the ONLY path for a non-run/walk workout — which is
              every workout today, since no current template includes one —
              so it's a primary button here, not a quiet link underneath
              cards that no longer exist. */}
          {!isRunWalk && (
            <Button label="Start workout" onPress={goManual} fullWidth glow style={styles.startButton} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar title="Today's Workout" onBack={() => safeGoBack(navigation)} />

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

            <Pressable
              onPress={handleAddMusic}
              style={[styles.musicButton, { borderColor: palette.border, backgroundColor: palette.surfaceSunken }]}
              accessibilityRole="button"
              accessibilityLabel="Add background music">
              <Ionicons name="musical-notes" size={14} color={palette.textSecondary} />
              <Text style={[styles.musicButtonText, { color: palette.textSecondary }]}> Add background music</Text>
            </Pressable>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: palette.surfaceSunken }]}>
              <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: palette.accent }]} />
            </View>
            <Text style={[styles.progressText, { color: palette.textMuted }]}>
              {prescribedDone} / {totalSets} sets
            </Text>

            {inOvertime && (
              <View style={[styles.overtimeStrip, { backgroundColor: palette.xpSoft, borderColor: palette.xp, flexDirection: 'row', alignItems: 'center' }]}>
                <Ionicons name="flash" size={13} color={palette.xp} />
                <Text style={[styles.overtimeText, { color: palette.xp }]}>
                  {' '}OVERTIME · +{overtimeSets} {overtimeSets === 1 ? 'set' : 'sets'} · +{overtimeXP} XP
                  {overtimeCapped ? ' (max)' : ''}
                </Text>
              </View>
            )}
          </View>
        </Enter>

        {/* Exercise list */}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {workout.exercises.map((ex, index) => {
            const complete = setsCompleted[index] || 0;
            const done = complete >= ex.sets;
            const exOvertime = Math.max(0, complete - ex.sets);
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
                      <Text style={[styles.setCount, { color: exOvertime > 0 ? palette.xp : done ? palette.accent : palette.textPrimary }]}>
                        {complete}/{ex.sets}
                      </Text>
                      <Text style={[styles.setLabel, { color: exOvertime > 0 ? palette.xp : palette.textMuted }]}>
                        {exOvertime > 0 ? `+${exOvertime} over` : 'sets'}
                      </Text>
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
            Tap an exercise to mark a set complete. This workout is customized for your
            current tier ({WORKOUT_TIER_LABELS[state.tier]}).
          </Text>
        </View>

        {/* Rest-of-month calendar — only from the SECOND visit of the day
            onward. The greeting/mode-picker above already covers the first
            visit, so this doesn't need to repeat that context. */}
        {firstVisitToday === false && authUser?.metadata.creationTime && (
          <View style={styles.calendarWrap}>
            <WorkoutCalendar
              accountCreatedAt={new Date(authUser.metadata.creationTime)}
              progression={state}
            />
          </View>
        )}
      </Screen>

      {/* Floating finish button */}
      <View style={styles.fabWrap}>
        <Button
          label={
            finishing ? 'Saving…'
            : inOvertime ? `Finish workout (+${overtimeXP} XP overtime)`
            : allComplete ? 'Finish workout'
            : `Finish (${prescribedDone}/${totalSets} sets)`
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
  musicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill, borderWidth: layout.hairline,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    marginTop: spacing.xs,
  },
  musicButtonText: { fontFamily: fontFamily.sansBold, fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressText:  { fontFamily: fontFamily.sansBold, fontSize: 12, marginTop: 4 },
  overtimeStrip: {
    borderWidth: layout.hairline, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    marginTop: spacing.xs, alignSelf: 'flex-start',
  },
  overtimeText: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 0.4 },

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

  calendarWrap: { marginTop: spacing.xl },
});
