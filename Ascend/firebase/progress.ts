import { doc, collection, getDocs, runTransaction, increment, setDoc } from 'firebase/firestore';
import { db } from './config';

// XP needed to go from `level` to `level + 1`. Exponential rather than flat:
// level 1 asks for 100 XP, level 50 for ~887, level 99 (the last stretch
// before the level-100 rank cap — see data/ranks.ts) for ~7,187. A player
// earning a steady 100-150 XP/day (a few quests plus a workout) reaches
// level 100 in low-single-digit YEARS, not weeks — "take a LOT of time" was
// the explicit ask, and a flat 100/level made every level after the first
// few trivial.
//
// GROWTH is deliberately mild (4.5%/level, compounding) rather than
// aggressive — a steeper curve either trivializes early levels even more or
// makes mid-game leveling feel like it stalls. Levels beyond 100 (prestige —
// see getRankInfo in data/ranks.ts, which freezes the RANK title at the top
// tier but never stops the level number from climbing) use the exact same
// formula uninterrupted: there's no special-case ceiling, the curve alone
// makes each additional level past 100 take proportionally longer forever.
const BASE_XP_PER_LEVEL = 100;
const XP_GROWTH_RATE = 1.045;

export function xpRequiredForLevel(level: number): number {
  return Math.round(BASE_XP_PER_LEVEL * Math.pow(XP_GROWTH_RATE, Math.max(level, 1) - 1));
}

// Kept as a named export (rather than deleting it) because several UI spots
// compute a 0..1 progress ratio and used to divide by this flat constant —
// see xpRequiredForLevel above for why per-level XP is no longer flat. Call
// sites should use `currentXP / xpRequiredForLevel(level)` instead; this is
// only the level-1 special case of that, kept for anything that still
// imports it directly during the transition.
export const TOTAL_XP_PER_LEVEL = BASE_XP_PER_LEVEL;

// Adds xpGained to (currentXP, level), rolling over into level-ups as
// needed (handles gaining enough XP to jump more than one level at once —
// e.g. a big health-score-boosted food log or a birthday XP multiplier).
export function applyXPGain(currentXP: number, level: number, xpGained: number) {
  let xp = currentXP + xpGained;
  let lvl = level;
  while (xp >= xpRequiredForLevel(lvl)) {
    xp -= xpRequiredForLevel(lvl);
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

// Overwrites a numeric field on TODAY's day document with an ABSOLUTE value,
// rather than adding to whatever's already there.
//
// This is deliberately NOT incrementTodayField. A synced-from-Health field
// like `steps` is a running total the OS already tracks for the whole day —
// every fetch of "today's steps" returns the full count so far, not a
// delta since the last fetch. Feeding that through increment() would add
// the same total again on every sync (open the app three times today, get
// 3x the real step count); this sets the field to exactly what was read,
// so re-syncing the same number is a no-op and syncing a bigger number
// later in the day simply replaces the smaller one.
export function setTodayField(uid: string, field: string, value: number) {
  return setDoc(dayDocRef(uid), { [field]: value }, { merge: true });
}

// Same idea as incrementTodayField, but on the LIFETIME stats doc
// (statsDocRef) instead of today's — for counters achievements care about
// (total workouts, total foods logged) that need to survive past midnight
// rather than reset with the day. Kept separate from awardXP's own
// transaction on this same doc: awardXP runs on every XP-earning action
// (quests, food logs, workouts alike), so folding a "totalWorkoutsCompleted"
// bump into it would count non-workout XP awards too. A plain increment()
// write is also cheaper than a transaction when there's no read-modify-write
// dependency on the previous value, which a pure counter bump never has.
export function incrementStatsField(uid: string, field: string, amount = 1) {
  return setDoc(statsDocRef(uid), { [field]: increment(amount) }, { merge: true });
}
