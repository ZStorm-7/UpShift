import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { ProgressionState, EMPTY_PROGRESSION, WorkoutTier } from '../data/workoutPlans';

export function workoutStateDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'workoutState');
}

export async function loadWorkoutState(uid: string): Promise<ProgressionState> {
  const snap = await getDoc(workoutStateDocRef(uid));
  if (!snap.exists()) return EMPTY_PROGRESSION;
  const data = snap.data() as Partial<ProgressionState>;
  return {
    tier: (data.tier as WorkoutTier) || 'beginner',
    progressPoints: data.progressPoints ?? 0,
    lastWorkoutDate: data.lastWorkoutDate ?? null,
    rotationOffset: data.rotationOffset ?? 0,
  };
}

export async function saveWorkoutState(uid: string, state: ProgressionState): Promise<void> {
  await setDoc(workoutStateDocRef(uid), state, { merge: true });
}
