// Saved training data: set-by-set logs, personal records, easy weeks and custom workouts.
// Everything lives under users/{uid}, which only that person can read or write.

import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from './config';
import type { LoggedExercise, Records, WorkoutLog } from '../services/training/progression';
import { cleanCustomWorkout, type CustomWorkout } from '../services/training/custom';

const col = (uid: string, name: string) => collection(db, 'users', uid, name);
const metaDoc = (uid: string, name: string) => doc(db, 'users', uid, 'meta', name);

export const MAX_LOGS_LOADED = 60;
export const MAX_CUSTOM_WORKOUTS = 30;

const cleanLoggedExercise = (e: any): LoggedExercise | null => {
  const name = String(e?.name ?? '').slice(0, 60);
  const sets = (Array.isArray(e?.sets) ? e.sets : []).slice(0, 12).map((s: any) => ({
    weight: Math.max(0, Math.min(2000, Number(s?.weight) || 0)),
    reps: Math.max(0, Math.min(200, Math.floor(Number(s?.reps)) || 0)),
    done: s?.done === true,
  }));
  return name && sets.length ? { name, sets } : null;
};

export async function saveWorkoutLog(uid: string, log: Omit<WorkoutLog, 'id'>): Promise<string> {
  const ref = await addDoc(col(uid, 'workoutLogs'), {
    date: log.date, title: String(log.title).slice(0, 60), durationSec: Math.max(0, Math.min(86_400, Math.round(log.durationSec) || 0)),
    exercises: log.exercises, ts: log.ts,
  });
  return ref.id;
}

export async function loadWorkoutLogs(uid: string, max = MAX_LOGS_LOADED): Promise<WorkoutLog[]> {
  const snap = await getDocs(query(col(uid, 'workoutLogs'), orderBy('ts', 'desc'), limit(max)));
  return snap.docs.map(d => {
    const x = d.data() as any;
    return {
      id: d.id, date: String(x.date ?? ''), title: String(x.title ?? ''), durationSec: Number(x.durationSec) || 0, ts: Number(x.ts) || 0,
      exercises: (Array.isArray(x.exercises) ? x.exercises : []).map(cleanLoggedExercise).filter(Boolean) as LoggedExercise[],
    };
  });
}

export async function loadRecords(uid: string): Promise<Records> {
  const snap = await getDoc(metaDoc(uid, 'records'));
  return snap.exists() ? ((snap.data() as any).byExercise ?? {}) : {};
}
export const saveRecords = (uid: string, byExercise: Records) => setDoc(metaDoc(uid, 'records'), { byExercise });

export type DeloadState = { from: string; until: string } | null;
export async function loadDeload(uid: string): Promise<DeloadState> {
  const snap = await getDoc(metaDoc(uid, 'deload'));
  const d = snap.exists() ? (snap.data() as any) : null;
  return d?.from && d?.until ? { from: String(d.from), until: String(d.until) } : null;
}
export const saveDeload = (uid: string, s: NonNullable<DeloadState>) => setDoc(metaDoc(uid, 'deload'), s);

export async function loadCustomWorkouts(uid: string): Promise<CustomWorkout[]> {
  const snap = await getDocs(query(col(uid, 'customWorkouts'), limit(MAX_CUSTOM_WORKOUTS)));
  return snap.docs.map(d => cleanCustomWorkout(d.data(), d.id)).filter(Boolean) as CustomWorkout[];
}
export async function saveCustomWorkout(uid: string, w: Omit<CustomWorkout, 'id'> & { id?: string }): Promise<string> {
  const clean = cleanCustomWorkout(w, w.id ?? 'new');
  if (!clean) throw new Error('invalid workout');
  const body = { title: clean.title, focus: clean.focus, exercises: clean.exercises };
  if (w.id) { await setDoc(doc(db, 'users', uid, 'customWorkouts', w.id), body); return w.id; }
  return (await addDoc(col(uid, 'customWorkouts'), body)).id;
}
export const deleteCustomWorkout = (uid: string, id: string) => deleteDoc(doc(db, 'users', uid, 'customWorkouts', id));
