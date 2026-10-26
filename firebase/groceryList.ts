// The grocery list is built from the saved meal plan; what is ticked off and any extra items live here.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import type { MealPlanDay } from '../services/coach';

const checksRef = (uid: string) => doc(db, 'users', uid, 'meta', 'groceryChecks');

export async function loadSavedMealPlan(uid: string): Promise<{ days: MealPlanDay[]; savedAt: number } | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'meta', 'mealPlan'));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return Array.isArray(d.days) ? { days: d.days, savedAt: Number(d.savedAt) || 0 } : null;
}

export type GroceryState = { planStamp: number; checked: string[]; extra: string[] };
export const EMPTY_GROCERY: GroceryState = { planStamp: 0, checked: [], extra: [] };

export async function loadGroceryState(uid: string): Promise<GroceryState> {
  const snap = await getDoc(checksRef(uid));
  const d = snap.exists() ? (snap.data() as any) : {};
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, max) : []);
  return { planStamp: Number(d.planStamp) || 0, checked: strs(d.checked, 300), extra: strs(d.extra, 50) };
}
export const saveGroceryState = (uid: string, s: GroceryState) => setDoc(checksRef(uid), s);
