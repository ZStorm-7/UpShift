import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import {
  Screen,
  AppBar,
  Card,
  Pill,
  Button,
  text,
} from '../components/ui';
import { PressableScale, AnimatedMeter } from '../components/anim';
import { Enter } from '../components/dashboard';
import { CalorieRing } from '../components/CalorieRing';
import { useUser } from '../context/UserContext';
import { awardXP, incrementTodayField } from '../firebase/progress';
import { useLanguage } from '../i18n/LanguageContext';
import haptics from '../services/haptics';
import sound from '../services/sound';

type Exercise = {
  name: string;
  sets: number;
  reps: number;
  completedSets: number;
};

type MuscleGroup = 'arms' | 'chest' | 'legs' | 'back';

const ROUTINES: Record<string, Record<MuscleGroup, string[]>> = {
  beginner: {
    arms: ['Bicep Curls', 'Tricep Dips', 'Hammer Curls'],
    chest: ['Push-ups', 'Knee Push-ups', 'Chest Flyes'],
    legs: ['Bodyweight Squats', 'Lunges', 'Calf Raises'],
    back: ['Superman', 'Resistance Band Rows', 'Dead Hangs'],
  },
  intermediate: {
    arms: ['Barbell Curls', 'Skull Crushers', 'Hammer Curls'],
    chest: ['Bench Press', 'Incline Push-ups', 'Chest Flyes'],
    legs: ['Goblet Squats', 'Romanian Deadlifts', 'Leg Press'],
    back: ['Bent Over Rows', 'Lat Pulldowns', 'Seated Cable Rows'],
  },
  advanced: {
    arms: ['Barbell Curls', 'Close-grip Bench', 'Concentration Curls'],
    chest: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Cable Flyes'],
    legs: ['Back Squats', 'Romanian Deadlifts', 'Bulgarian Split Squats'],
    back: ['Pull-ups', 'Deadlifts', 'T-Bar Rows'],
  },
};

const MUSCLE_GROUPS: MuscleGroup[] = ['arms', 'chest', 'legs', 'back'];
// Note: there's no real "human back" emoji in Unicode (no back-facing
// person exists), so this is the closest reasonable stand-in — a gorilla,
// which is common gym slang for a broad, developed back ("gorilla back").
// The old '🔙' was literally the wrong symbol — that's the "BACK" arrow
// used for UI navigation, not a body part; it just happened to match the
// word "back" as a pun.
const MUSCLE_ICONS: Record<MuscleGroup, string> = {
  arms: '💪',
  chest: '🫀',
  legs: '🦵',
  back: '🦍',
};

const XP_PER_SET = 8;
const REST_TIME = 60;
const GRACE_TIME = 5;

// Maps the activity level chosen during onboarding to a workout routine tier.
const ACTIVITY_TO_TIER: Record<string, string> = {
  'Sedentary': 'beginner',
  'Lightly active': 'beginner',
  'Moderately active': 'intermediate',
  'Very active': 'advanced',
};

export default function WorkoutScreen({ navigation }: any) {
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const tier = ACTIVITY_TO_TIER[profile?.activityLevel || ''] || 'beginner';
  const routine = ROUTINES[tier];

  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [totalXP, setTotalXP] = useState(0);
  const [restTimerVisible, setRestTimerVisible] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(GRACE_TIME);
  const [timerPhase, setTimerPhase] = useState<'grace' | 'rest'>('grace');
  const timerRef = useRef<any>(null);

  // Set once this workout's completion has been saved to Firestore, so a
  // re-render (or the completion card staying on screen) doesn't save twice.
  const [workoutSaved, setWorkoutSaved] = useState(false);

  const startWorkout = (group: MuscleGroup) => {
    const groupExercises = routine[group].map(name => ({
      name,
      sets: 3,
      reps: 10,
      completedSets: 0,
    }));
    setSelectedGroup(group);
    setExercises(groupExercises);
    setWorkoutStarted(true);
    setTotalXP(0);
    setWorkoutSaved(false);
  };

  const completeSet = (exerciseIndex: number) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exerciseIndex && ex.completedSets < ex.sets
          ? { ...ex, completedSets: ex.completedSets + 1 }
          : ex
      )
    );
    setTotalXP(prev => prev + XP_PER_SET);
    haptics.setComplete();
    sound.xpEarned();
    startRestTimer();
  };

  const startRestTimer = () => {
    setTimerPhase('grace');
    setTimerSeconds(GRACE_TIME);
    setRestTimerVisible(true);
  };

  useEffect(() => {
    if (!restTimerVisible) return;
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          if (timerPhase === 'grace') {
            setTimerPhase('rest');
            return REST_TIME;
          } else {
            clearInterval(timerRef.current);
            setRestTimerVisible(false);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [restTimerVisible, timerPhase]);

  const skipRest = () => {
    clearInterval(timerRef.current);
    setRestTimerVisible(false);
  };

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const completedSets = exercises.reduce((sum, ex) => sum + ex.completedSets, 0);
  const workoutComplete = totalSets > 0 && completedSets === totalSets;

  // Persist the finished workout: bump today's workout count and add this
  // session's XP to the user's lifetime XP/level, exactly once per workout.
  useEffect(() => {
    if (!workoutComplete || workoutSaved || !authUser) return;
    setWorkoutSaved(true);
    (async () => {
      try {
        // Both writes go through the transactional helpers rather than
        // read-modify-write. `firebase/progress.ts` spells out why at length:
        // the Dashboard stays mounted underneath this screen holding a stale
        // `currentXP`, so a workout that wrote an absolute XP total would be
        // silently erased the next time a quest was ticked back on the
        // Dashboard. The helpers exist precisely to close that race, and this
        // screen was the one still going around them.
        await Promise.all([
          incrementTodayField(authUser.uid, 'workoutsCompleted', 1),
          awardXP(authUser.uid, totalXP),
        ]);
      } catch {
        // If this fails, workoutSaved stays true so we don't retry-loop;
        // the workout's local UI state is unaffected either way.
      }

      // Hand off to the summary AFTER the writes settle, so the celebration
      // can't appear for a workout that failed to save. `replace`, not
      // `navigate`: backing out of the summary should return to the Dashboard,
      // not to a finished workout the user would then be able to "complete"
      // again.
      navigation.replace('WorkoutSummary', {
        xpEarned: totalXP,
        completedSets,
        totalSets,
        exerciseCount: exercises.length,
        muscleGroup: selectedGroup ?? '',
      });
    })();
  }, [workoutComplete, workoutSaved, authUser, totalXP]);

  if (!workoutStarted) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <AppBar title="Workout" onBack={() => navigation.goBack()} />
        <Enter index={0}>
          <Text style={styles.subtitle}>{t('chooseMuscleGroup')}</Text>
        </Enter>
        {MUSCLE_GROUPS.map((group, index) => (
          <Enter key={group} index={index + 1}>
            <PressableScale
              onPress={() => startWorkout(group)}
              accessibilityRole="button"
              accessibilityLabel={`Start ${group} workout: ${routine[group].join(', ')}`}>
              <Card style={styles.groupCard}>
                <Text style={styles.groupIcon}>{MUSCLE_ICONS[group]}</Text>
                <View style={styles.groupTextCol}>
                  <Text style={styles.groupName}>
                    {group.charAt(0).toUpperCase() + group.slice(1)}
                  </Text>
                  <Text style={styles.groupExercises}>
                    {routine[group].join(' · ')}
                  </Text>
                </View>
              </Card>
            </PressableScale>
          </Enter>
        ))}
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppBar
        title={`${selectedGroup?.charAt(0).toUpperCase()}${selectedGroup?.slice(1)} Day`}
        onBack={() => {
          setWorkoutStarted(false);
          setExercises([]);
        }}
        right={<Pill label={`+${totalXP} XP`} color={colors.xp} />}
      />

      {/* Progress. AnimatedMeter rather than Meter: the bar retargets from
          where it currently is when a set lands mid-fill, and it celebrates
          the crossing to 100% instead of just stopping there. */}
      <Enter index={0}>
        <Card>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{completedSets} / {totalSets} {t('sets')}</Text>
            <Text style={styles.progressValue}>{Math.round((completedSets / totalSets) * 100)}%</Text>
          </View>
          <AnimatedMeter progress={completedSets / totalSets} />
        </Card>
      </Enter>

      {/* Exercises */}
      {exercises.map((exercise, index) => (
        <Enter key={exercise.name} index={index + 1}>
          <Card style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseDetail}>{exercise.sets} {t('sets')} × {exercise.reps} {t('reps')}</Text>
            {/* One pill per set: filled = done, outlined = pending. The count
                below repeats the same information as text, so completion is
                never carried by colour alone. */}
            <View style={styles.setsRow}>
              {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                <Pill
                  key={setIndex}
                  label={`${setIndex + 1}`}
                  filled={setIndex < exercise.completedSets}
                  color={setIndex < exercise.completedSets ? colors.accent : colors.border}
                />
              ))}
              <Text style={styles.setsCount}>
                {exercise.completedSets} / {exercise.sets}
              </Text>
            </View>
            <Button
              label={
                exercise.completedSets >= exercise.sets
                  ? `✅ ${t('complete')}`
                  : `${t('completeSet')} ${exercise.completedSets + 1}`
              }
              variant="secondary"
              onPress={() => completeSet(index)}
              disabled={exercise.completedSets >= exercise.sets}
              fullWidth
            />
          </Card>
        </Enter>
      ))}

      {workoutComplete && (
        <Enter index={0}>
          <Card accentColor={colors.accent} style={styles.completeCard}>
            <Text style={styles.completeTitle}>🎉 {t('workoutComplete')}</Text>
            <Text style={styles.completeXP}>{t('youEarned')} {totalXP} XP</Text>
            <Button
              label={t('backToDashboard')}
              variant="primary"
              onPress={() => navigation.goBack()}
              fullWidth
              style={styles.doneButton}
            />
          </Card>
        </Enter>
      )}

      {/* Rest timer modal */}
      <Modal visible={restTimerVisible} transparent animationType="fade">
        <View style={styles.timerOverlay}>
          <View style={styles.timerCard}>
            <Text style={styles.timerPhaseText}>
              {timerPhase === 'grace' ? t('getReady') : t('rest')}
            </Text>

            {/* The countdown ring is the same component as the calorie ring,
                driven backwards: it empties as the rest period runs out. One
                ring in the app, two jobs, so the two screens read as the same
                product rather than two takes on "a circle with a number". */}
            <CalorieRing
              value={timerSeconds}
              goal={timerPhase === 'grace' ? GRACE_TIME : REST_TIME}
              size={172}
              thickness={10}
              instant
              caption={timerPhase === 'grace' ? t('secondsGrace') : t('secondsRest')}
              color={timerPhase === 'grace' ? colors.xp : colors.accent}
            />

            <Button label={t('skipRest')} variant="ghost" onPress={skipRest} fullWidth />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Screen owns the gutter and the bottom inset; this only adds the rhythm
  // between the stacked sections.
  content: {
    gap: layout.gap,
    paddingBottom: layout.bottomInset,
  },
  subtitle: {
    ...text.bodySecondary,
    marginBottom: spacing.sm,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  // Lets a long exercise list wrap inside the card instead of pushing the
  // icon off the row.
  groupTextCol: {
    flex: 1,
    gap: spacing.xs,
  },
  groupIcon: {
    fontSize: 32,
  },
  groupName: {
    ...type.heading,
    color: colors.textPrimary,
  },
  groupExercises: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  // The percentage is the readout, so it gets primary ink — the label beside
  // it stays secondary. Same relationship as every other section header.
  progressValue: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
  },
  exerciseCard: {
    gap: spacing.md,
  },
  exerciseName: {
    ...type.heading,
    color: colors.textPrimary,
  },
  exerciseDetail: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  setsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  setsCount: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  completeCard: {
    alignItems: 'center',
    gap: spacing.md,
  },
  completeTitle: {
    ...type.title,
    color: colors.textPrimary,
  },
  completeXP: {
    ...type.heading,
    color: colors.xp,
  },
  doneButton: {
    marginTop: spacing.sm,
  },
  timerOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  timerPhaseText: {
    ...type.label,
    color: colors.textMuted,
  },
  timerLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
});