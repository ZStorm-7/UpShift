// Recent foods (read from the last two weeks of day logs) and saved meals (a small list in meta/savedMeals).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { getRecentDayKeys, dayDocRefForKey } from './progress';
import { cleanSavedMeal, recentFoods, MAX_SAVED_MEALS, type FoodItem, type SavedMeal } from '../services/food/library';

const savedRef = (uid: string) => doc(db, 'users', uid, 'meta', 'savedMeals');

export async function loadRecentFoods(uid: string, days = 14, limit = 12): Promise<FoodItem[]> {
  const keys = getRecentDayKeys(days).reverse(); // newest first
  const logs = await Promise.all(keys.map(async k => {
    try { const s = await getDoc(dayDocRefForKey(uid, k)); return ((s.data()?.foodLog as FoodItem[]) ?? []); } catch { return [] as FoodItem[]; }
  }));
  return recentFoods(logs, limit);
}

export async function loadSavedMeals(uid: string): Promise<SavedMeal[]> {
  const snap = await getDoc(savedRef(uid));
  const raw = snap.exists() ? ((snap.data() as any).meals ?? []) : [];
  return (Array.isArray(raw) ? raw : []).map((m: any, i: number) => cleanSavedMeal(m, String(m?.id ?? i))).filter(Boolean) as SavedMeal[];
}

export async function addSavedMeal(uid: string, name: string, items: FoodItem[]): Promise<SavedMeal[] | 'full' | 'invalid'> {
  const current = await loadSavedMeals(uid);
  if (current.length >= MAX_SAVED_MEALS) return 'full';
  const meal = cleanSavedMeal({ name, items }, String(Date.now()));
  if (!meal) return 'invalid';
  const next = [meal, ...current];
  await setDoc(savedRef(uid), { meals: next });
  return next;
}

export async function removeSavedMeal(uid: string, id: string): Promise<SavedMeal[]> {
  const next = (await loadSavedMeals(uid)).filter(m => m.id !== id);
  await setDoc(savedRef(uid), { meals: next });
  return next;
}
