// Until now every quest was pure honor system — you tapped it and got the XP
// whether or not you'd done it. But the app already KNOWS the answer to a lot
// of these questions: it has your calorie total, water total, sleep hours and
// workout count for today. This module closes that gap.
//
// Only quests the app can genuinely verify appear here. Everything else
// (e.g. "Take a 10-minute walk outside") stays tap-to-complete, because
// there's no data that could confirm or deny it — and silently pretending to
// verify something we can't would be worse than leaving it manual.

export type QuestContext = {
  totalCalories: number;
  calorieGoal: number;
  waterTotal: number;
  waterGoal: number;
  sleepHours: number;
  sleepLoggedFromTimes: boolean;
  workoutsCompleted: number;
  mealCount: number;
  smallestMealCalories: number | null;
  level: number;
};

// "Hit your calorie goal" was requiring landing within ±5% of the number —
// which meant staying comfortably UNDER goal (a calorie deficit day, the
// whole point for plenty of users) failed to count as "hitting" it, because
// coming in at, say, 80% of goal fell outside the ±5% band on the low side.
// A calorie goal is a budget, not a target to land on exactly: the quest
// should credit anyone who stayed at or under it, same as "under budget"
// reads as success everywhere else in personal finance/fitness framing.
// OVER-eating still needs a tolerance (nobody hits their goal to the exact
// calorie), so that side keeps a small allowance; the ZERO_FLOOR just
// excludes "logged almost nothing today" from counting as a deliberate
// deficit rather than an empty food log.
const CALORIE_OVER_TOLERANCE = 0.05;
const CALORIE_ZERO_FLOOR = 0.5;

function hitCalorieGoal(c: QuestContext): boolean {
  if (c.calorieGoal <= 0 || c.totalCalories <= 0) return false;
  const low = c.calorieGoal * CALORIE_ZERO_FLOOR;
  const high = c.calorieGoal * (1 + CALORIE_OVER_TOLERANCE);
  return c.totalCalories >= low && c.totalCalories <= high;
}

// Quest ID → a function that answers "has this been earned?" from today's
// real data. IDs match firebase/quests.ts exactly.
export const QUEST_VERIFIERS: Record<number, (c: QuestContext) => boolean> = {
  1: c => c.workoutsCompleted >= 1,                      // Log a workout
  6: c => c.workoutsCompleted >= 2,                      // Complete 2 workouts today
  21: hitCalorieGoal,                                    // Hit your calorie goal
  // Honest about what these two actually check: a COUNT of today's logged
  // meals, not whether any of them happened at breakfast time or covered
  // every meal of the day — mealCount has no timestamps to check against.
  // "Log every meal today" really means "log 3 meals today", and "Log
  // breakfast" really means "log at least 1 meal today". Adding real
  // time-of-day tracking would be a data-model change (meal log entries
  // don't carry a logged-at time), so that's intentionally out of scope
  // here — this is a comment fix, not a behavior fix.
  23: c => c.mealCount >= 3,                             // Log every meal today
  24: c => c.mealCount >= 1,                             // Log breakfast
  38: c => c.smallestMealCalories !== null && c.smallestMealCalories < 200, // Snack under 200 kcal
  40: c => c.mealCount >= 4,                             // Log 4 meals today
  41: c => c.waterTotal >= c.waterGoal && c.waterGoal > 0, // Drink your water goal
  // Only became verifiable once the water cap was removed — while logging was
  // clamped to the goal, waterTotal could never exceed it.
  50: c => c.waterGoal > 0 && c.waterTotal >= c.waterGoal + 500, // Extra 500ml beyond goal
  51: c => c.sleepHours >= 7,                            // Get 7+ hours of sleep
  52: c => c.sleepHours >= 8,                            // Get 8+ hours of sleep
  53: c => c.sleepLoggedFromTimes,                       // Logged sleep via bedtime + wake time
  65: c =>                                               // Hit every goal today
    hitCalorieGoal(c) &&
    c.waterGoal > 0 && c.waterTotal >= c.waterGoal &&
    c.sleepHours >= 7 &&
    c.workoutsCompleted >= 1,
  71: c => c.level >= 5,                                 // Reach Level 5
  72: c => c.level >= 10,                                // Reach Level 10
};

export function isAutoVerifiable(questId: number): boolean {
  return questId in QUEST_VERIFIERS;
}

/**
 * Checks ONE quest against today's real data. Used to gate a manual tap on a
 * verifiable quest — see the comment on that call site in DashboardScreen for
 * why a tap alone can't be enough for these.
 *
 * A quest with no verifier isn't "not earned", it's "not checkable" — that
 * distinction matters to the caller, which is why this returns a boolean
 * about the ID's checkability separately via isAutoVerifiable rather than
 * folding "unverifiable" and "unearned" into the same false.
 */
export function verifyQuest(questId: number, context: QuestContext): boolean {
  const verifier = QUEST_VERIFIERS[questId];
  return verifier ? verifier(context) : false;
}

// Returns the IDs of quests that are (a) in today's list, (b) not already
// marked done, and (c) verifiably earned. The caller applies them in one
// batch rather than one write per quest.
//
// `completedIds` is deliberately just "ids to exclude", not strictly
// "already-completed ids" — DashboardScreen also merges in that cycle's
// preSatisfiedIds (quests that were already true the instant they were
// drawn, e.g. redrawing "Log breakfast" at 12:01pm after logging it at 8am
// under the previous cycle) so they're never auto-paid a second time. It's
// also reused with an empty array purely to ask "which of these currently
// pass?" when a fresh set is drawn — see loadQuests in DashboardScreen.tsx.
export function findNewlyEarnedQuests(
  questIds: number[],
  completedIds: number[],
  context: QuestContext
): number[] {
  return questIds.filter(id => {
    if (completedIds.includes(id)) return false;
    const verifier = QUEST_VERIFIERS[id];
    return verifier ? verifier(context) : false;
  });
}
