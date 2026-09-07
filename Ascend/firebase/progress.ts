import { doc, collection, getDocs, runTransaction, increment, setDoc } from 'firebase/firestore';
import { db } from './config';

// XP needed to go up one level. Shared by every screen that awards XP
// (Dashboard quests, Workout sets) so leveling logic stays consistent.
export const TOTAL_XP_PER_LEVEL = 100;

// Adds xpGained to (currentXP, level), rolling over into level-ups as
// needed (handles gaining enough XP to jump more than one level at once).
export function applyXPGain(currentXP: number, level: number, xpGained: number) {
  let xp = currentXP + xpGained;
  let lvl = level;
  while (xp >= TOTAL_XP_PER_LEVEL) {
    xp -= TOTAL_XP_PER_LEVEL;
    lvl += 1;
  }
  return { currentXP: xp, level: lvl };
}

// Local calendar date as YYYY-MM-DD, used as the daily document ID.
// Using the local date (not UTC) so a day's data resets when it's midnight
// for the person actually using the app.
export function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Quests, water, sleep, and food log all live here — one document per
// calendar day, so they naturally reset when a new day starts.
export function dayDocRef(uid: string) {
  return doc(db, 'users', uid, 'days', getTodayKey());
}

// Same document, but for an arbitrary past day — needed by the History
// screen, which reads several days at once rather than just today's.
export function dayDocRefForKey(uid: string, dayKey: string) {
  return doc(db, 'users', uid, 'days', dayKey);
}

// The last `count` day keys, oldest first, ending with today. Built by
// stepping a real Date backwards rather than by subtracting from the day
// number, so month and year boundaries are handled for free.
export function getRecentDayKeys(count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    keys.push(`${yyyy}-${mm}-${dd}`);
  }
  return keys;
}

// Counts how many PAST days this user has actually logged something on.
// "Something" means real activity — a day document that exists but is empty
// (created by, say, opening the app and nothing else) doesn't count, because
// the point is to measure whether there's enough history for a multi-day
// quest to be achievable, not whether a document happens to exist.
//
// Today is deliberately excluded: a quest needing "3 days in a row" needs
// two days *behind* it plus today, and counting today would let it appear a
// day early.
export async function countLoggedHistoryDays(uid: string): Promise<number> {
  const todayKey = getTodayKey();
  const snapshot = await getDocs(collection(db, 'users', uid, 'days'));
  let count = 0;
  snapshot.forEach(docSnap => {
    if (docSnap.id === todayKey) return;
    const data = docSnap.data();
    const hasActivity =
      (data.waterTotal || 0) > 0 ||
      (data.sleepHours || 0) > 0 ||
      (data.workoutsCompleted || 0) > 0 ||
      (data.foodLog || []).length > 0;
    if (hasActivity) count += 1;
  });
  return count;
}

// "2026-08-15" → "Sat". Parsed manually instead of via new Date(string)
// because Date parsing of a bare "YYYY-MM-DD" is treated as UTC, which can
// land on the wrong weekday for anyone in a negative-offset timezone.
export function dayKeyToWeekdayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

// XP and level are cumulative across all days, so they live in their own
// document instead of resetting with the daily doc above.
export function statsDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'stats');
}

// Awards XP against whatever the SERVER currently holds, not against a value
// the caller is holding in memory.
//
// This is the difference between correct and nearly-correct. The old code
// computed `applyXPGain(currentXP, level, gained)` from React state and wrote
// the resulting absolute number. Two screens both doing that will overwrite
// each other: the Dashboard stays mounted underneath the Workout screen, so
// its `currentXP` is whatever it was when you left. Finish a workout (+72 XP,
// written correctly), come back, tap a quest — the Dashboard writes
// `0 + 10 = 10` over the server's 72 and the workout's XP is simply gone,
// with no error anywhere.
//
// A transaction reads and writes as one atomic unit, so concurrent awards
// queue up instead of racing. `increment()` would be cheaper, but XP rolls
// over into levels, which is a read-modify-write no matter how you slice it.
export async function awardXP(
  uid: string,
  gainedXP: number
): Promise<{ currentXP: number; level: number }> {
  return runTransaction(db, async tx => {
    const ref = statsDocRef(uid);
    const snap = await tx.get(ref);
    const base = snap.exists() ? snap.data() : {};
    const next = applyXPGain(base.currentXP || 0, base.level || 1, gainedXP);
    tx.set(ref, next, { merge: true });
    return next;
  });
}

// Adds to a numeric field on TODAY's day document atomically.
//
// Two bugs die here at once. The obvious one is the same race as awardXP.
// The subtle one is the midnight rollover: `dayDocRef()` resolves the date
// when it's CALLED, so an app left open overnight would take yesterday's
// in-memory total (say 2500ml), add 500, and write 3000 into today's brand
// new, otherwise-empty document. The day would begin already past its water
// goal, and the water quest would auto-complete for water nobody drank.
// `increment` is relative, so on a fresh document it starts from 0 —
// correct by construction rather than by remembering to reload.
export function incrementTodayField(uid: string, field: string, amount: number) {
  return setDoc(dayDocRef(uid), { [field]: increment(amount) }, { merge: true });
}
