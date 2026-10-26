// Reads a week of days for the review, and remembers the goal picked for next week.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { dayDocRefForKey } from './progress';
import { summarizeDay, type DaySummary } from '../services/insights/days';
import { parseGoalId, type WeeklyGoal } from '../services/habits/weeklyReview';

export async function loadDaySummaries(uid: string, keys: string[]): Promise<DaySummary[]> {
  return Promise.all(keys.map(async key => {
    let day: any = null, breaks = 0;
    try { day = (await getDoc(dayDocRefForKey(uid, key))).data() ?? null; } catch { /* a missing day is just empty */ }
    try { breaks = Number((await getDoc(doc(db, 'users', uid, 'breakDays', key))).data()?.done) || 0; } catch { /* same */ }
    return summarizeDay(key, day, breaks);
  }));
}

const goalRef = (uid: string) => doc(db, 'users', uid, 'meta', 'weeklyGoal');
export async function loadWeeklyGoal(uid: string): Promise<{ weekKey: string; goal: WeeklyGoal } | null> {
  const d = (await getDoc(goalRef(uid))).data() as any;
  const goal = parseGoalId(d?.goalId);
  return goal && /^\d{4}-\d{2}-\d{2}$/.test(String(d?.weekKey)) ? { weekKey: d.weekKey, goal } : null;
}
export const saveWeeklyGoal = (uid: string, weekKey: string, goal: WeeklyGoal) => setDoc(goalRef(uid), { weekKey, goalId: goal.id });

const seenRef = (uid: string) => doc(db, 'users', uid, 'meta', 'reviewSeen');
export async function loadReviewSeen(uid: string): Promise<string> { return String(((await getDoc(seenRef(uid))).data() as any)?.weekOf ?? ''); }
export const saveReviewSeen = (uid: string, weekOf: string) => setDoc(seenRef(uid), { weekOf });
