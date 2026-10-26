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

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { workoutXp } from '../services/workoutXp';
import { awardXP, incrementTodayField } from '../firebase/progress';
import { loadWorkoutState, saveWorkoutState } from '../firebase/workoutState';
import { loadPlan, planDayToTemplate } from '../services/coach';
import {
  pickTodaysWorkout,
  recordCompletedWorkout,
  decayForInactivity,
  ProgressionState,
  EMPTY_PROGRESSION,
  WorkoutTemplate,
  WORKOUT_TIER_LABELS,
} from '../data/workoutPlans';
import { getTodayKey, getRecentDayKeys, dayDocRefForKey } from '../firebase/progress';
import { getDoc } from 'firebase/firestore';
import {
  saveWorkoutLog, loadWorkoutLogs, loadRecords, saveRecords, loadDeload, saveDeload, loadCustomWorkouts,
  type DeloadState,
} from '../firebase/training';
import {
  suggestNext, detectRecords, cleanWeight, cleanReps, lastLogOf, type WorkoutLog, type LoggedExercise, type Records, type PersonalRecord, type Suggestion,
} from '../services/training/progression';
import { deloadAdvice, applyDeload, deloadWeight, trainingWeeksInARow, type DeloadReason } from '../services/training/deload';
import { customToTemplate } from '../services/training/custom';
import { restEndAt } from '../services/training/rest';
import { RestTimerBar, ExerciseGuideCard, SuggestionLine, SetLogger, fill, type SetRow } from '../components/training/TrainingParts';
import haptics from '../services/haptics';
import sound from '../services/sound';

// XP per completed workout — same value as before the redesign so
// existing users don't feel their reward changed.

// Day-of-year, used as the deterministic input to the workout picker.
function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

const addDaysKey = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export default function WorkoutScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { t } = useLanguage();
  const customId: string | undefined = route?.params?.customId;
  const [state, setState] = useState<ProgressionState>(EMPTY_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [baseWorkout, setBaseWorkout] = useState<WorkoutTemplate | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [records, setRecords] = useState<Records>({});
  const [deload, setDeload] = useState<DeloadState>(null);
  const [advice, setAdvice] = useState<{ recommended: boolean; reasons: DeloadReason[]; weeks: number }>({ recommended: false, reasons: [], weeks: 0 });
  const [adviceDismissed, setAdviceDismissed] = useState(false);
  const [rows, setRows] = useState<Record<number, SetRow[]>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const startedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const today = getTodayKey();
  const easyActive = !!deload && today >= deload.from && today <= deload.until;

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setLoading(true);
      try {
        const raw = await loadWorkoutState(authUser.uid);
        const decayed = decayForInactivity(raw, getTodayKey());
        setState(decayed);
        const [lg, rec, dl, customs] = await Promise.all([
          loadWorkoutLogs(authUser.uid).catch(() => [] as WorkoutLog[]),
          loadRecords(authUser.uid).catch(() => ({} as Records)),
          loadDeload(authUser.uid).catch(() => null),
          customId ? loadCustomWorkouts(authUser.uid).catch(() => []) : Promise.resolve([]),
        ]);
        setLogs(lg); setRecords(rec); setDeload(dl);
        const custom = customId ? customs.find(c => c.id === customId) : undefined;
        const planned = custom ? null : planDayToTemplate(await loadPlan(authUser.uid).catch(() => null), decayed.tier);
        setBaseWorkout(custom ? customToTemplate(custom) : planned ?? pickTodaysWorkout(decayed, dayOfYear()));
        // Is an easier week worth suggesting?
        const sleeps: number[] = [];
        for (const k of getRecentDayKeys(5)) {
          try { const d = await getDoc(dayDocRefForKey(authUser.uid, k)); const h = Number(d.data()?.sleepHours); if (h > 0) sleeps.push(h); } catch { /* ignore */ }
        }
        const dates = lg.map(l => l.date);
        const weeks = trainingWeeksInARow(dates, today);
        const last7 = new Set(lg.filter(l => l.date >= addDaysKey(today, -6)).map(l => l.date + l.ts)).size;
        const completion = lg.slice(0, 3).map(l => { const all = l.exercises.flatMap(e => e.sets); return all.length ? all.filter(x => x.done).length / all.length : 1; });
        const since = dl ? Math.max(0, Math.round((Date.parse(today) - Date.parse(dl.until)) / 86_400_000)) : null;
        const adv = deloadAdvice({ trainingWeeksInARow: weeks, workoutsLast7: last7, avgSleepLast5: sleeps.length >= 3 ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null, recentCompletion: completion, daysSinceDeload: since });
        setAdvice({ ...adv, weeks });
      } catch {
        setState(EMPTY_PROGRESSION);
        setBaseWorkout(pickTodaysWorkout(EMPTY_PROGRESSION, dayOfYear()));
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.uid, customId]);

  // An easy week trims the sets; custom workouts are the person's own plan and stay as written.
  const workout = useMemo(() => (baseWorkout && easyActive && !customId ? applyDeload(baseWorkout) : baseWorkout), [baseWorkout, easyActive, customId]);

  // What to aim for on each exercise, from the last time it was logged.
  const suggestions = useMemo(() => (workout ? workout.exercises.map(ex => {
    const prev = lastLogOf(ex.name, logs);
    const s = suggestNext(prev, ex.reps);
    return { s: easyActive && s.weight > 0 ? { ...s, weight: deloadWeight(s.weight) } as Suggestion : s, last: prev ? bestSet(prev) : null };
  }) : []), [workout, logs, easyActive]);

  // Fill each exercise with its planned sets, pre-set to the suggestion, once the plan is known.
  useEffect(() => {
    if (!workout) return;
    setRows(prev => {
      const next: Record<number, SetRow[]> = {};
      workout.exercises.forEach((ex, i) => {
        const sg = suggestions[i]?.s;
        next[i] = prev[i]?.length === ex.sets ? prev[i] : Array.from({ length: ex.sets }, () => ({ weight: sg && sg.weight > 0 ? String(sg.weight) : '', reps: sg ? String(sg.reps) : '', done: false }));
      });
      return next;
    });
  }, [workout, suggestions]);

  const doneCount = (i: number) => (rows[i] ?? []).filter(r => r.done).length;

  function toggleSet(exIndex: number) {
    if (!workout) return;
    const list = rows[exIndex] ?? [];
    const nextIdx = list.findIndex(r => !r.done);
    if (nextIdx === -1) {
      // Everything was done: tapping again clears the exercise (the old behaviour).
      setRows(prev => ({ ...prev, [exIndex]: list.map(r => ({ ...r, done: false })) }));
    } else {
      setRows(prev => ({ ...prev, [exIndex]: list.map((r, k) => (k === nextIdx ? { ...r, done: true } : r)) }));
      setRestEnd(restEndAt(Date.now(), workout.exercises[exIndex].restSec));
    }
    haptics.selection();
    sound.questTick();
  }
  function toggleRow(exIndex: number, setIdx: number) {
    if (!workout) return;
    const list = rows[exIndex] ?? [];
    const becoming = !list[setIdx]?.done;
    setRows(prev => ({ ...prev, [exIndex]: list.map((r, k) => (k === setIdx ? { ...r, done: becoming } : r)) }));
    if (becoming) setRestEnd(restEndAt(Date.now(), workout.exercises[exIndex].restSec));
    haptics.selection();
  }
  const editRow = (exIndex: number, setIdx: number, patch: Partial<SetRow>) =>
    setRows(prev => ({ ...prev, [exIndex]: (prev[exIndex] ?? []).map((r, k) => (k === setIdx ? { ...r, ...patch } : r)) }));
  const onRestDone = useCallback(() => { setRestEnd(null); }, []);

  async function startEasyWeek() {
    if (!authUser) return;
    const s = { from: today, until: addDaysKey(today, 6) };
    setDeload(s); setAdviceDismissed(true);
    saveDeload(authUser.uid, s).catch(() => {});
  }
  async function endEasyWeek() {
    if (!authUser || !deload) return;
    const s = { from: deload.from, until: addDaysKey(today, -1) };
    setDeload(s);
    saveDeload(authUser.uid, s).catch(() => {});
  }

  const totalSets   = workout ? workout.exercises.reduce((s, e) => s + e.sets, 0) : 0;
  const doneSets    = Object.values(rows).reduce((s, list) => s + list.filter(r => r.done).length, 0);
  const allComplete = totalSets > 0 && doneSets >= totalSets;
  const progressPct = totalSets > 0 ? doneSets / totalSets : 0;

  async function finishWorkout() {
    if (!authUser || !workout || inFlight.current) return;
    inFlight.current = true;
    setFinishing(true);
    try {
      // Award XP + bump the daily "workoutsCompleted" counter
      // Pay in proportion to the work done, so tapping one set and finishing can't farm full XP.
      const xp = workoutXp(doneSets, totalSets);
      await awardXP(authUser.uid, xp);
      await incrementTodayField(authUser.uid, 'workoutsCompleted', 1);

      // Advance workout progression (custom workouts are the person's own plan: no tier progress)
      if (!customId) {
        const nextState = recordCompletedWorkout(state, getTodayKey());
        await saveWorkoutState(authUser.uid, nextState);
      }

      // Save what was lifted and look for personal records. A failure here must not lose the XP above.
      let prs: PersonalRecord[] = [];
      let volume = 0;
      try {
        const logged: LoggedExercise[] = workout.exercises.map((ex, i) => ({
          name: ex.name,
          sets: (rows[i] ?? []).map(r => ({ weight: cleanWeight(r.weight), reps: cleanReps(r.reps), done: r.done })),
        }));
        const det = detectRecords(records, logged, getTodayKey());
        prs = det.prs;
        volume = logged.reduce((n, e) => n + e.sets.reduce((m, st) => m + (st.done && st.weight > 0 ? st.weight * st.reps : 0), 0), 0);
        await saveWorkoutLog(authUser.uid, { date: getTodayKey(), title: workout.title, durationSec: Math.round((Date.now() - startedAt.current) / 1000), exercises: logged, ts: Date.now() });
        await saveRecords(authUser.uid, det.next);
      } catch { /* the workout itself is already saved */ }

      haptics.goalMet();
      // Navigate to the celebration screen. `replace` so backing out
      // doesn't return to a "completed" workout that could be finished
      // again.
      navigation.replace('WorkoutSummary', {
        xpEarned: xp,
        completedSets: doneSets,
        totalSets,
        exerciseCount: workout.exercises.length,
        muscleGroup: workout.focus,
        durationMinutes: workout.durationMin,
        prs,
        volume,
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

  const cardCount = workout.exercises.length;
  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar
          title="Today's Workout"
          onBack={() => navigation.goBack()}
          right={
            <Pressable onPress={() => navigation.navigate('CustomWorkouts')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('wkMyWorkouts')}>
              <Text style={[styles.myWorkouts, { color: palette.accent }]}>{t('wkMyWorkouts')}</Text>
            </Pressable>
          }
        />

        {/* Easy week: offered when the signals say so, and shown while it is on. */}
        {easyActive && !customId && (
          <View style={[styles.banner, { backgroundColor: palette.accentSoft, borderColor: palette.accentBorder }]}>
            <Text style={[styles.bannerText, { color: palette.textPrimary }]}>{fill(t('wkEasyActive'), { date: deload!.until })}</Text>
            <Pressable onPress={endEasyWeek} hitSlop={8} accessibilityRole="button" style={styles.bannerBtn}>
              <Text style={[styles.bannerBtnText, { color: palette.textSecondary }]}>{t('wkEndEasy')}</Text>
            </Pressable>
          </View>
        )}
        {!easyActive && !customId && advice.recommended && !adviceDismissed && (
          <View style={[styles.banner, { backgroundColor: palette.surface, borderColor: palette.border }]} accessibilityRole="alert">
            <Text style={[styles.bannerTitle, { color: palette.textPrimary }]}>{t('wkDeloadTitle')}</Text>
            <Text style={[styles.bannerText, { color: palette.textSecondary }]}>{t('wkDeloadBody')}</Text>
            {advice.reasons.map(r => (
              <Text key={r} style={[styles.bannerReason, { color: palette.textMuted }]}>
                • {fill(t(({ weeks: 'wkReasonWeeks', frequency: 'wkReasonFrequency', sleep: 'wkReasonSleep', completion: 'wkReasonCompletion' } as const)[r]), { n: advice.weeks })}
              </Text>
            ))}
            <View style={styles.bannerRow}>
              <Button label={t('wkStartEasy')} onPress={startEasyWeek} size="sm" />
              <Pressable onPress={() => setAdviceDismissed(true)} hitSlop={8} accessibilityRole="button" style={styles.bannerBtn}>
                <Text style={[styles.bannerBtnText, { color: palette.textSecondary }]}>{t('wkNotNow')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Header — plan card */}
        <Enter index={0}>
          <View style={[styles.planCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.planHeaderRow}>
              <Text style={[styles.tierBadge, { color: palette.accent, borderColor: palette.accentBorder, backgroundColor: palette.accentSoft }]}>
                {(easyActive && !customId ? t('wkEasyWeek') : customId ? t('cwTitle') : WORKOUT_TIER_LABELS[workout.tier]).toUpperCase()}
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
            const complete = doneCount(index);
            const done = complete >= ex.sets;
            const isOpen = open === index;
            const sg = suggestions[index];
            return (
              <Enter key={`${ex.name}-${index}`} index={Math.min(index + 1, 6)}>
                <View style={[styles.exerciseCard, { backgroundColor: palette.surface, borderColor: done ? palette.accentBorder : palette.border }]}>
                  <Pressable
                    onPress={() => toggleSet(index)}
                    style={{ gap: spacing.sm }}
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
                  {/* Not inside the button above: a control can't hold another control. */}
                  <Pressable
                    onPress={() => setOpen(isOpen ? null : index)} hitSlop={8} accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${isOpen ? t('wkHideDetails') : t('wkLogDetails')}: ${ex.name}`}
                    style={styles.detailsBtn}>
                    <Text style={[styles.detailsText, { color: palette.accent }]}>{isOpen ? t('wkHideDetails') : t('wkLogDetails')}</Text>
                  </Pressable>
                  {isOpen && (
                    <View style={{ gap: spacing.md }}>
                      {sg && <SuggestionLine s={sg.s} last={sg.last} />}
                      <SetLogger rows={rows[index] ?? []} onChange={(i, patch) => editRow(index, i, patch)} onToggle={i => toggleRow(index, i)} />
                      <ExerciseGuideCard name={ex.name} />
                    </View>
                  )}
                </View>
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

      {/* Rest countdown + floating finish button */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        {restEnd !== null && (
          <View style={{ marginBottom: spacing.sm }}>
            <RestTimerBar endAt={restEnd} onSkip={() => setRestEnd(null)} onAdd={() => setRestEnd(e => (e ?? Date.now()) + 15_000)} onDone={onRestDone} />
          </View>
        )}
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

// The set to show as "last time": the heaviest done set.
function bestSet(e: LoggedExercise): { weight: number; reps: number } | null {
  const sets = e.sets.filter(x => x.done && x.reps > 0);
  if (!sets.length) return null;
  const top = sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
  return { weight: top.weight, reps: top.reps };
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

  myWorkouts: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  banner: { borderRadius: radius.lg, borderWidth: layout.hairline, padding: spacing.md, gap: 6, marginBottom: spacing.md },
  bannerTitle: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  bannerText: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 19 },
  bannerReason: { fontFamily: fontFamily.sans, fontSize: 12 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  bannerBtn: { minHeight: 44, justifyContent: 'center' },
  bannerBtnText: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  detailsBtn: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  detailsText: { fontFamily: fontFamily.sansBold, fontSize: 13 },

  fabWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg,
  },
});
