// Adaptive calorie recalculation — the MacroFactor-style piece this app was
// missing. calculateCalorieGoal (context/UserContext.tsx) still runs once at
// onboarding to produce a starting number from a formula (Mifflin-St Jeor +
// activity multiplier), but a formula is a guess — it doesn't know this
// particular body's actual metabolism. This file re-estimates TDEE from what
// actually happened: how intake and logged weight moved together over the
// last couple of weeks, then nudges the calorie goal toward whatever number
// would have produced the goal's intended trend (a deficit for "Lose
// weight", a surplus for "Build muscle", maintenance otherwise) — the same
// idea MacroFactor's weekly recalculation is built on, run client-side here
// since there's no backend job scheduler in this app.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { getRecentDayKeys, dayDocRefForKey } from './progress';
import { WeightEntry } from './weight';

export function adaptiveCaloriesDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'adaptiveCalories');
}

// Don't recalculate more than once a week — both because a single day's
// noise (water weight, a big meal) shouldn't whipsaw the goal, and because
// MacroFactor's own reasoning for a weekly cadence applies here too: give
// the trend enough days to mean something before acting on it.
const RECALC_INTERVAL_DAYS = 7;
// How far back to look for signal. Wider than the recalc interval on
// purpose — a user who only weighs in 3 days a week still gets enough
// data points if the window reaches back two weeks instead of one.
const WINDOW_DAYS = 14;
const MIN_WEIGHT_ENTRIES = 4;
const MIN_FOOD_DAYS = 4;
const MIN_DAY_SPAN = 3;
// Caps how much a single recalculation can move the goal — without this, a
// noisy week (one big loss from illness, one big gain from a salty
// weekend) could swing the target by hundreds of calories overnight. The
// trend still pulls the goal in the right direction every week; it just
// can't get there in one jump.
const MAX_ADJUST_FRACTION = 0.15;
// Below this, the change isn't worth surfacing to the user or writing to
// their profile — it's noise, not signal.
const MIN_MEANINGFUL_CHANGE = 25;
const CALORIES_PER_LB = 3500;

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export type AdaptiveGoalResult = {
  newGoal: number;
  /** What the last window's actual intake-vs-weight-trend implies TDEE
   *  currently is — shown to the user as the "why", not just the new number. */
  impliedTDEE: number;
};

// Pure and Firebase-free on purpose (see firebase/progress.ts's
// applyXPGain for the same reasoning) — the math is worth being able to
// call directly from a test or from a different screen without dragging
// Firestore along.
export function computeAdaptiveGoal(params: {
  currentGoal: number;
  weightEntries: WeightEntry[];
  /** One entry per day in the lookback window; days with nothing logged
   *  should still be present with calories: 0 so callers don't have to
   *  reconstruct which days were skipped. */
  dailyCalories: { date: string; calories: number }[];
  /** profile.goals?.[0] ?? '' — same single-goal convention
   *  calculateCalorieGoal already uses. */
  goal: string;
  isMinor: boolean;
}): AdaptiveGoalResult | null {
  const { currentGoal, weightEntries, dailyCalories, goal, isMinor } = params;
  if (weightEntries.length < MIN_WEIGHT_ENTRIES) return null;

  const cutoffKey = dailyCalories[0]?.date;
  const recentWeights = cutoffKey ? weightEntries.filter(e => e.date >= cutoffKey) : weightEntries;
  if (recentWeights.length < MIN_WEIGHT_ENTRIES) return null;

  const loggedDays = dailyCalories.filter(d => d.calories > 0);
  if (loggedDays.length < MIN_FOOD_DAYS) return null;

  const first = recentWeights[0];
  const last = recentWeights[recentWeights.length - 1];
  const daySpan = daysBetweenDateKeys(first.date, last.date);
  if (daySpan < MIN_DAY_SPAN) return null;

  const avgIntake = loggedDays.reduce((sum, d) => sum + d.calories, 0) / loggedDays.length;
  const weightChangeLbs = last.weightLbs - first.weightLbs;
  // Positive = the user was in a surplus over the window (gained weight),
  // negative = a deficit (lost weight) — this IS (avg intake - true TDEE)
  // by definition of what a caloric balance is, which is what makes solving
  // for TDEE below just algebra, not a guess.
  const dailyBalance = (weightChangeLbs * CALORIES_PER_LB) / daySpan;
  const impliedTDEE = avgIntake - dailyBalance;

  const deficit = isMinor ? 250 : 500;
  const surplus = isMinor ? 200 : 300;
  const minFloor = isMinor ? 1800 : 1200;

  let target = impliedTDEE;
  if (goal === 'Lose weight') target = impliedTDEE - deficit;
  else if (goal === 'Build muscle') target = impliedTDEE + surplus;

  target = Math.round(target);

  const maxDelta = Math.round(currentGoal * MAX_ADJUST_FRACTION);
  target = Math.max(currentGoal - maxDelta, Math.min(currentGoal + maxDelta, target));
  target = Math.max(target, isMinor ? minFloor : 1200);

  if (Math.abs(target - currentGoal) < MIN_MEANINGFUL_CHANGE) return null;

  return { newGoal: target, impliedTDEE: Math.round(impliedTDEE) };
}

/** Runs the once-a-week check and, if it's time AND there's enough signal,
 * updates the user's calorieGoal in place. Returns the before/after pair so
 * the caller (DashboardScreen) can show a one-line "your goal changed"
 * notice — or null when nothing changed, whether because it isn't time yet
 * or because there wasn't enough data to trust a recalculation. */
export async function maybeRecalculateCalorieGoal(
  uid: string,
  profile: { calorieGoal: number; goals?: string[] },
  weightEntries: WeightEntry[],
  isMinor: boolean
): Promise<{ oldGoal: number; newGoal: number } | null> {
  const todayKey = getRecentDayKeys(1)[0];
  const stateSnap = await getDoc(adaptiveCaloriesDocRef(uid));
  const lastRecalcDate = stateSnap.exists() ? (stateSnap.data().lastRecalcDate as string | undefined) : undefined;
  if (lastRecalcDate) {
    const sinceLast = daysBetweenDateKeys(lastRecalcDate, todayKey);
    if (sinceLast < RECALC_INTERVAL_DAYS) return null;
  }

  const keys = getRecentDayKeys(WINDOW_DAYS);
  const snaps = await Promise.all(keys.map(k => getDoc(dayDocRefForKey(uid, k))));
  const dailyCalories = keys.map((date, i) => {
    const data = snaps[i].exists() ? snaps[i].data() : undefined;
    const foodLog = (data?.foodLog as { calories?: number }[] | undefined) ?? [];
    const calories = foodLog.reduce((sum, f) => sum + (f.calories || 0), 0);
    return { date, calories };
  });

  // Recorded whether or not a new goal came out of it — this is what makes
  // the interval check above work; without it, a week with too little data
  // to trust would be re-attempted (and fail the same way) every single day.
  await setDoc(adaptiveCaloriesDocRef(uid), { lastRecalcDate: todayKey }, { merge: true });

  const result = computeAdaptiveGoal({
    currentGoal: profile.calorieGoal,
    weightEntries,
    dailyCalories,
    goal: profile.goals?.[0] ?? '',
    isMinor,
  });
  if (!result) return null;

  await setDoc(doc(db, 'users', uid), { calorieGoal: result.newGoal }, { merge: true });
  return { oldGoal: profile.calorieGoal, newGoal: result.newGoal };
}
