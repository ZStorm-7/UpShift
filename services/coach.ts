// AI Coach client. All model access goes through the `coach` Cloud Function
// (functions/src/index.ts): the Gemini key, quota, rate limits, safety screen
// and consent check live on the server, not here. This file holds the typed
// wrapper plus the Firestore reads/writes the app itself is allowed to do.

import { httpsCallable } from 'firebase/functions';
import {
  addDoc, collection, doc, getDoc, getDocs, setDoc, query, orderBy, limit, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { dayDocRef } from '../firebase/progress';
import { streakDocRef, liveStreak, EMPTY_STREAK, StreakState } from '../firebase/streaks';
import { getQuestCycleKey } from '../firebase/quests';
import { emitDayDataChanged } from './dataEvents';
import type { WorkoutTemplate, WorkoutTier } from '../data/workoutPlans';
import type { GrocerySection } from './grocery';

// Must match CONSENT_VERSION in functions/src/config.ts. Bump both whenever the
// legal text changes materially so everyone sees and accepts it again.
export const COACH_CONSENT_VERSION = 1;

// ---- Types ----
export type MealItem = { name: string; calories: number; protein: number; carbs: number; fat: number };
export type PlanExercise = { name: string; sets: number; reps: string; restSec: number; cue?: string };
export type PlanDay = { day: string; focus: string; rest: boolean; exercises: PlanExercise[] };
export type Ingredient = { item: string; qty: number; unit: string; aisle: string };
export type MealPlanMeal = { name: string; type: string; calories: number; protein: number; carbs: number; fat: number; ingredients: Ingredient[] };
export type MealPlanDay = { day: string; meals: MealPlanMeal[] };
export type ChallengeSuggestion = { uid: string; name: string; goalLabel: string; reason: string; sent?: boolean };
export type Source = { title: string; uri: string };

export type CoachCard =
  | { kind: 'meal'; items: MealItem[]; logged?: boolean }
  | { kind: 'plan'; days: PlanDay[]; saved?: boolean }
  | { kind: 'mealplan'; days: MealPlanDay[]; allergies?: string[]; calorieNote?: string; saved?: boolean }
  | { kind: 'challenge'; suggestions: ChallengeSuggestion[] }
  | { kind: 'grocery'; sections: GrocerySection[] };

export type CoachMessage = {
  id: string;
  role: 'user' | 'coach';
  text: string;
  at: number;
  // Fixed/system replies (safety, errors, tips): never sent back to the model.
  safety?: boolean;
  card?: CoachCard;
  sources?: Source[];
  feedback?: 'up' | 'down';
};

export type Bucket = { used: number; limit: number; resetAt: number | null };
export type Usage = { tier: 'free' | 'premium'; chat: Bucket; tool: Bucket; rescue: Bucket };

export type Tone = 'friendly' | 'drill' | 'gentle' | 'funny';
export const TONES: { id: Tone; labelKey: string; emoji: string }[] = [
  { id: 'friendly', labelKey: 'coachToneFriendly', emoji: '🙂' },
  { id: 'drill', labelKey: 'coachToneDrill', emoji: '🪖' },
  { id: 'gentle', labelKey: 'coachToneGentle', emoji: '🌿' },
  { id: 'funny', labelKey: 'coachToneFunny', emoji: '😄' },
];

// ---- Calling the function ----
export type CoachErrorCode =
  | 'quota' | 'busy' | 'burst' | 'blocked' | 'consent' | 'offline' | 'allergen' | 'unknown';

export class CoachError extends Error {
  code: CoachErrorCode;
  retryAt?: number;
  bucket?: 'chat' | 'tool' | 'rescue';
  constructor(code: CoachErrorCode, retryAt?: number, bucket?: 'chat' | 'tool' | 'rescue') {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
    this.bucket = bucket;
  }
}

type Reply = {
  text?: string; sources?: Source[]; card?: CoachCard; safety?: boolean; usage?: Usage;
};

const callable = httpsCallable<Record<string, unknown>, Reply>(functions, 'coach', { timeout: 90_000 });

async function call(payload: Record<string, unknown>): Promise<Reply> {
  try {
    const res = await callable({ ...payload, tzOffsetMinutes: new Date().getTimezoneOffset() });
    return res.data;
  } catch (e: any) {
    const code: string = e?.code ?? '';
    const msg: string = e?.message ?? '';
    if (code === 'functions/resource-exhausted') {
      const d = e?.details ?? {};
      throw new CoachError(
        d.code === 'quota' ? 'quota' : d.code === 'busy' ? 'busy' : d.code === 'blocked' ? 'blocked' : 'burst',
        d.retryAt, d.bucket);
    }
    if (code === 'functions/failed-precondition') {
      throw new CoachError(msg.includes('allergen') ? 'allergen' : 'consent');
    }
    if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded' || msg.includes('network')) {
      throw new CoachError('offline');
    }
    throw new CoachError('unknown');
  }
}

export async function fetchUsage(): Promise<Usage | null> {
  try { return (await call({ mode: 'usage' })).usage ?? null; } catch { return null; }
}

const toHistory = (msgs: CoachMessage[]) =>
  msgs.filter(m => !m.safety).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));

export const sendChat = (msgs: CoachMessage[], screen?: string) =>
  call({ mode: 'chat', history: toHistory(msgs), screen });
export const analyzeMealPhoto = (imageBase64: string, mimeType: string) =>
  call({ mode: 'photo', imageBase64, mimeType });
export const requestWorkoutPlan = (request: string) => call({ mode: 'plan', request });
export const requestMealPlan = (allergies: string[], diet: string) => call({ mode: 'mealplan', allergies, diet });
export const requestChallenges = (friends: { uid: string; name: string; level: number; totalXP: number; streak: number }[]) =>
  call({ mode: 'challenge', friends });
export const requestRescueLine = (streak: number) => call({ mode: 'rescue', streak });

// ---- Preferences (also read by the server: consent, tone, allergies) ----
export type CoachPrefs = {
  tone: Tone; speak: boolean; useData: boolean; consented: boolean; consentVersion: number;
  allergies: string[]; diet: string;
};
export const DEFAULT_PREFS: CoachPrefs = {
  tone: 'friendly', speak: false, useData: true, consented: false, consentVersion: 0, allergies: [], diet: '',
};
export const hasConsent = (p: CoachPrefs) => p.consented && p.consentVersion >= COACH_CONSENT_VERSION;

const prefsRef = (uid: string) => doc(db, 'users', uid, 'coach', 'prefs');
export async function loadPrefs(uid: string): Promise<CoachPrefs> {
  const snap = await getDoc(prefsRef(uid));
  return { ...DEFAULT_PREFS, ...(snap.exists() ? snap.data() : {}) };
}
export const savePrefs = (uid: string, p: CoachPrefs) => setDoc(prefsRef(uid), p);

// ---- History ----
const messages = (uid: string) => collection(db, 'users', uid, 'coachMessages');

export async function loadHistory(uid: string): Promise<CoachMessage[]> {
  const snap = await getDocs(query(messages(uid), orderBy('at', 'desc'), limit(40)));
  return snap.docs.map(d => d.data() as CoachMessage).reverse();
}
export const saveMessage = (uid: string, m: CoachMessage) =>
  // Firestore rejects `undefined` fields.
  setDoc(doc(messages(uid), m.id), JSON.parse(JSON.stringify(m)));

export async function clearHistory(uid: string): Promise<void> {
  const snap = await getDocs(messages(uid));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ---- Writes the user confirms ----
export async function logMealItems(uid: string, items: MealItem[]): Promise<void> {
  const ref = dayDocRef(uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().foodLog ?? [] : [];
  const stamp = Date.now();
  const added = items.map((it, i) => ({ id: stamp + i, ...it }));
  await setDoc(ref, { foodLog: [...existing, ...added] }, { merge: true });
  // Nutrition and Dashboard keep today's log in state and stay mounted under
  // the coach, so tell them to reload.
  emitDayDataChanged();
}

export const savePlan = (uid: string, days: PlanDay[]) =>
  setDoc(doc(db, 'users', uid, 'meta', 'coachPlan'), { days, savedAt: Date.now() });
export async function loadPlan(uid: string): Promise<PlanDay[] | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'meta', 'coachPlan'));
  return snap.exists() ? (snap.data().days as PlanDay[]) : null;
}
export const saveMealPlan = (uid: string, days: MealPlanDay[], allergies: string[]) =>
  setDoc(doc(db, 'users', uid, 'meta', 'mealPlan'), { days, allergies, savedAt: Date.now() });

// Maps a saved coach-plan day onto the Workout screen's template shape.
export function planDayToTemplate(days: PlanDay[] | null, tier: WorkoutTier, now = new Date()): WorkoutTemplate | null {
  if (!days) return null;
  const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
  const d = days.find(x => x.day.toLowerCase().startsWith(key));
  if (!d || d.rest || d.exercises.length === 0) return null;
  return {
    id: `coach-${key}`, title: `Coach Plan: ${d.focus}`, focus: d.focus, tier,
    durationMin: Math.max(15, d.exercises.reduce((a, e) => a + e.sets * (e.restSec / 60 + 0.75), 0) | 0),
    exercises: d.exercises,
  };
}

// ---- Daily check-in (mood / soreness), read by the coach's history tool ----
export type Checkin = { mood: number; soreness: number };
export async function loadTodayCheckin(uid: string): Promise<Checkin | null> {
  const snap = await getDoc(dayDocRef(uid));
  const c = snap.data()?.checkin;
  return c ? { mood: c.mood, soreness: c.soreness } : null;
}
export const saveCheckin = (uid: string, c: Checkin) =>
  setDoc(dayDocRef(uid), { checkin: { ...c, at: Date.now() } }, { merge: true });

// ---- Feedback and problem reports ----
export async function sendFeedback(uid: string, f: {
  kind: 'rating' | 'problem'; rating?: 'up' | 'down'; reason?: string; note?: string; messageId?: string; replyText?: string;
}): Promise<void> {
  const body: Record<string, unknown> = { uid, kind: f.kind, at: serverTimestamp() };
  if (f.rating) body.rating = f.rating;
  if (f.reason) body.reason = f.reason.slice(0, 40);
  if (f.note) body.note = f.note.slice(0, 500);
  if (f.messageId) body.messageId = f.messageId;
  if (f.replyText) body.replyText = f.replyText.slice(0, 1500);
  await addDoc(collection(db, 'coachFeedback'), body);
}

// ---- Streak rescue ----
export async function getStreakStatus(uid: string): Promise<{ streak: number; atRisk: boolean }> {
  const snap = await getDoc(streakDocRef(uid));
  const s = snap.exists() ? (snap.data() as StreakState) : EMPTY_STREAK;
  const cycle = getQuestCycleKey();
  const streak = liveStreak(s, cycle);
  return { streak, atRisk: streak > 0 && s.lastCompletedCycleKey !== cycle };
}

// Latest AI-written streak line, read by the Dashboard when it schedules the
// streak-at-risk notification. Null falls back to the static text.
let rescueLine: string | null = null;
export const getStreakRescueLine = () => rescueLine;
export const setStreakRescueLine = (l: string | null) => { rescueLine = l; };
