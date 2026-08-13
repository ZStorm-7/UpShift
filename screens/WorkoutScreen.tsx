import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { colors } from '../theme/colors';

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
const MUSCLE_ICONS: Record<MuscleGroup, string> = {
  arms: '💪',
  chest: '🫀',
  legs: '🦵',
  back: '🔙',
};

const XP_PER_SET = 8;
const REST_TIME = 60;
const GRACE_TIME = 5;

export default function WorkoutScreen({ navigation }: any) {
  const activityLevel = 'intermediate'; // will connect to Firebase later
  const routine = ROUTINES[activityLevel];

  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [totalXP, setTotalXP] = useState(0);
  const [restTimerVisible, setRestTimerVisible] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(GRACE_TIME);
  const [timerPhase, setTimerPhase] = useState<'grace' | 'rest'>('grace');
  const timerRef = useRef<any>(null);

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

  if (!workoutStarted) {
    return (
      <View style={styles.wrapper}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()}>
              <Text style={styles.backButton}>← Back</Text>
            </Pressable>
            <Text style={styles.screenTitle}>Workout</Text>
            <View style={{ width: 60 }} />
          </View>
          <Text style={styles.subtitle}>Choose a muscle group to train today.</Text>
          {MUSCLE_GROUPS.map(group => (
            <Pressable
              key={group}
              style={styles.groupCard}
              onPress={() => startWorkout(group)}>
              <Text style={styles.groupIcon}>{MUSCLE_ICONS[group]}</Text>
              <View>
                <Text style={styles.groupName}>
                  {group.charAt(0).toUpperCase() + group.slice(1)}
                </Text>
                <Text style={styles.groupExercises}>
                  {routine[group].join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => {
            setWorkoutStarted(false);
            setExercises([]);
          }}>
            <Text style={styles.backButton}>← Back</Text>
          </Pressable>
          <Text style={styles.screenTitle}>
            {selectedGroup?.charAt(0).toUpperCase()}{selectedGroup?.slice(1)} Day
          </Text>
          <Text style={styles.xpBadge}>+{totalXP} XP</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.card}>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{completedSets} / {totalSets} sets</Text>
            <Text style={styles.progressText}>{Math.round((completedSets / totalSets) * 100)}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${(completedSets / totalSets) * 100}%` }]} />
          </View>
        </View>

        {/* Exercises */}
        {exercises.map((exercise, index) => (
          <View key={exercise.name} style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseDetail}>{exercise.sets} sets × {exercise.reps} reps</Text>
            <View style={styles.setsRow}>
              {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                <View
                  key={setIndex}
                  style={[
                    styles.setDot,
                    setIndex < exercise.completedSets && styles.setDotDone,
                  ]}
                />
              ))}
            </View>
            <Pressable
              style={[
                styles.setButton,
                exercise.completedSets >= exercise.sets && styles.setButtonDone,
              ]}
              onPress={() => completeSet(index)}
              disabled={exercise.completedSets >= exercise.sets}>
              <Text style={styles.setButtonText}>
                {exercise.completedSets >= exercise.sets
                  ? '✅ Complete'
                  : `Complete Set ${exercise.completedSets + 1}`}
              </Text>
            </Pressable>
          </View>
        ))}

        {workoutComplete && (
          <View style={styles.completeCard}>
            <Text style={styles.completeTitle}>🎉 Workout Complete!</Text>
            <Text style={styles.completeXP}>You earned {totalXP} XP</Text>
            <Pressable
              style={styles.doneButton}
              onPress={() => navigation.goBack()}>
              <Text style={styles.doneButtonText}>Back to Dashboard</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Rest timer modal */}
      <Modal visible={restTimerVisible} transparent animationType="fade">
        <View style={styles.timerOverlay}>
          <View style={styles.timerCard}>
            <Text style={styles.timerPhaseText}>
              {timerPhase === 'grace' ? '⚡ Get Ready' : '😮‍💨 Rest'}
            </Text>
            <Text style={styles.timerSeconds}>{timerSeconds}</Text>
            <Text style={styles.timerLabel}>
              {timerPhase === 'grace' ? 'seconds grace period' : 'seconds rest'}
            </Text>
            <Pressable style={styles.skipButton} onPress={skipRest}>
              <Text style={styles.skipText}>Skip Rest</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    gap: 16,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    color: colors.accent,
    fontSize: 16,
    width: 60,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 8,
  },
  xpBadge: {
    color: colors.xp,
    fontWeight: '700',
    fontSize: 16,
    width: 60,
    textAlign: 'right',
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupIcon: {
    fontSize: 32,
  },
  groupName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  groupExercises: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  progressBg: {
    height: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  exerciseDetail: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  setsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  setDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setDotDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  setButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  setButtonDone: {
    backgroundColor: colors.surfaceRaised,
  },
  setButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 14,
  },
  completeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  completeTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  completeXP: {
    color: colors.xp,
    fontSize: 18,
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  doneButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 15,
  },
  timerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    gap: 12,
    width: '80%',
  },
  timerPhaseText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  timerSeconds: {
    color: colors.accent,
    fontSize: 72,
    fontWeight: '700',
  },
  timerLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  skipButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
  },
  skipText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});