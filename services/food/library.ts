// Recent foods and saved meals: one-tap ways to log what you eat often.

export type FoodItem = { name: string; calories: number; protein: number; carbs: number; fat: number };
export type SavedMeal = { id: string; name: string; items: FoodItem[] };

export const MAX_SAVED_MEALS = 20;
export const MAX_ITEMS_PER_MEAL = 20;

const n = (v: unknown, max = 10_000) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(Math.round(x * 10) / 10, max) : 0; };
const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanFoodItem(raw: any): FoodItem | null {
  const name = text(raw?.name, 80);
  if (!name) return null;
  return { name, calories: n(raw?.calories, 5000), protein: n(raw?.protein, 500), carbs: n(raw?.carbs, 1000), fat: n(raw?.fat, 500) };
}

export function cleanSavedMeal(raw: any, id: string): SavedMeal | null {
  const name = text(raw?.name, 40);
  const items = (Array.isArray(raw?.items) ? raw.items : []).map(cleanFoodItem).filter(Boolean).slice(0, MAX_ITEMS_PER_MEAL) as FoodItem[];
  return name && items.length ? { id, name, items } : null;
}

export const mealTotals = (items: FoodItem[]) => items.reduce((t, i) => ({ calories: t.calories + i.calories, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

/** Distinct foods from the last days' logs, most recent first. Same name and numbers count as one. */
export function recentFoods(logsNewestFirst: FoodItem[][], limit = 12): FoodItem[] {
  const seen = new Set<string>();
  const out: FoodItem[] = [];
  for (const day of logsNewestFirst) {
    for (const raw of [...day].reverse()) {
      const f = cleanFoodItem(raw);
      if (!f) continue;
      const key = `${f.name.toLowerCase()}|${f.calories}|${f.protein}|${f.carbs}|${f.fat}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
