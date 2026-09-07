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

// ── Workout screen visit tracking ────────────────────────────────────────
//
// Distinguishes the FIRST time the Workout screen is opened on a given day
// (shows the greeting + camera/sensor/manual mode picker) from every
// subsequent open that same day (skips straight to the exercise list, and
// also shows the rest-of-month calendar). Just a single stored date string
// — no history — since all that matters is "have we already greeted them
// today."
export function workoutVisitDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'workoutVisits');
}

export async function isFirstWorkoutVisitToday(uid: string, todayKey: string): Promise<boolean> {
  const snap = await getDoc(workoutVisitDocRef(uid));
  const lastVisitDate = snap.exists() ? (snap.data() as any).lastVisitDate : null;
  return lastVisitDate !== todayKey;
}

export async function recordWorkoutVisit(uid: string, todayKey: string): Promise<void> {
  await setDoc(workoutVisitDocRef(uid), { lastVisitDate: todayKey }, { merge: true });
}
