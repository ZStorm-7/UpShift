// foodHealth — turns a food's nutrition into a single 0–100 "health score",
// and turns that score into an XP multiplier for logging it.
//
// Every tab that can log a food (Manual, Barcode, Custom, Picture) funnels
// through this so the score/reward math lives in exactly one place instead
// of four near-duplicates that would drift apart the first time someone
// tweaks one of them.
//
// Nutrition data quality varies a LOT by source: a barcode scan usually
// carries sugar/fiber/sodium from the label, but a quick manual or custom
// entry usually only has calories/protein/carbs/fat. Treating a missing
// optional field as "bad" would unfairly tank the score of anything typed in
// by hand, and treating it as "good" would let a barcode-scanned candy bar's
// honestly-reported sugar count score WORSE than a hand-typed guess that
// simply didn't ask. So every optional field is neutral (contributes zero)
// when absent — the score only ever reacts to data it actually has.

export type FoodNutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Grams. Optional — richer sources (barcode/USDA) tend to have this. */
  sugar?: number;
  /** Grams. Optional. */
  fiber?: number;
  /** Milligrams. Optional. */
  sodium?: number;
};

/**
 * computeHealthScore — a defensible, documented heuristic, not a clinical
 * tool. Starts from a neutral midpoint (50) and moves up for protein/fiber
 * density and down for sugar/sodium/fat density, each expressed as a share
 * of the food's OWN calories (not an absolute gram count) so a huge plate of
 * something reasonably balanced doesn't get penalized just for being large.
 *
 * Reward side (can add up to +35):
 *  - Protein density: protein calories ÷ total calories. Capped generously
 *    at 40% (very lean meat/shake territory) → up to +20.
 *  - Fiber density (only if provided): grams of fiber per 100 kcal, capped
 *    at 5g/100kcal (excellent — think beans/lentils) → up to +15.
 *
 * Penalty side (can subtract up to 65, only from what's actually reported):
 *  - Fat density beyond a reasonable 35% of calories → up to -25.
 *  - Sugar density (only if provided): sugar calories ÷ total calories,
 *    capped at 50% → up to -25. (50g/day is the WHO/FDA-style added-sugar
 *    reference used elsewhere in this file's sibling warnings — see
 *    screens/NutritionScreen.tsx — so a food that alone would blow well past
 *    that on its own scores accordingly.)
 *  - Sodium density (only if provided): mg of sodium per 200 kcal, capped at
 *    1000mg/200kcal (a genuinely salty processed food) → up to -15.
 *
 * Result is clamped to [0, 100].
 */
export function computeHealthScore(nutrition: FoodNutrition): number {
  const { calories, protein, fat, sugar, fiber, sodium } = nutrition;

  // A zero/negative-calorie entry has no ratios to compute (division by
  // zero) — treat it as neutral rather than crashing or scoring it as
  // artificially perfect.
  if (!calories || calories <= 0) return 50;

  let score = 50;

  // --- Rewards ---
  const proteinCalRatio = (protein * 4) / calories;
  score += Math.min(1, proteinCalRatio / 0.4) * 20;

  if (fiber !== undefined) {
    const fiberPer100kcal = fiber / (calories / 100);
    score += Math.min(1, fiberPer100kcal / 5) * 15;
  }

  // --- Penalties ---
  const fatCalRatio = (fat * 9) / calories;
  score -= Math.max(0, fatCalRatio - 0.35) * (25 / 0.65); // scales the excess over 35% up to -25 at 100% fat

  if (sugar !== undefined) {
    const sugarCalRatio = (sugar * 4) / calories;
    score -= Math.min(1, sugarCalRatio / 0.5) * 25;
  }

  if (sodium !== undefined) {
    const sodiumPer200kcal = sodium / (calories / 200);
    score -= Math.min(1, sodiumPer200kcal / 1000) * 15;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * xpMultiplierForHealthScore — maps a 0–100 health score to a smooth XP
 * multiplier from 1x (score 0) up to 3.5x (score 100).
 *
 * A straight line (1 + score/100 * 2.5) was rejected on purpose: it pays out
 * 2.25x for a mediocre 50/100 food, which is most of the way to the maximum
 * reward for something that's merely average. Raising the score to the power
 * 1.5 before scaling bends the curve so the 0–60 range stays close to the
 * 1x–1.9x floor and the payoff only really accelerates once a food is
 * genuinely good (70+) — the multiplier should feel like it was EARNED, not
 * handed out for showing up.
 *
 * Examples:
 *   score 0   → 1.00x
 *   score 30  → 1.41x
 *   score 50  → 1.88x
 *   score 70  → 2.46x
 *   score 90  → 3.14x
 *   score 100 → 3.50x
 */
export function xpMultiplierForHealthScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return 1 + 2.5 * Math.pow(clamped / 100, 1.5);
}

/**
 * healthScoreColor — maps a 0–100 health score to one of the app's three
 * semantic palette bands (see theme/themedColors.ts's `success`/`warning`/
 * `danger` tokens), Noom-style: a simple green/yellow/red signal layered on
 * top of the number, not a replacement for it.
 *
 * Same thresholds computeHealthScore's own doc comment already treats as
 * meaningful boundaries elsewhere in this file (70+ reads as genuinely
 * good, sub-40 as genuinely poor), kept to exactly three bands on purpose —
 * a five-color gradient would be more precise but harder to read at a
 * glance than the number right next to it already is.
 */
export function healthScoreColor(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
}
