// XP for finishing a workout: full for the whole plan, scaled down for part of it, so tapping a
// single set and finishing can't farm the full reward.

export const WORKOUT_XP = 60;
export const MIN_WORKOUT_XP = 10;

export function workoutXp(doneSets: number, totalSets: number): number {
  if (!(totalSets > 0) || !(doneSets > 0)) return 0;
  return Math.max(MIN_WORKOUT_XP, Math.round(WORKOUT_XP * Math.min(1, doneSets / totalSets)));
}
