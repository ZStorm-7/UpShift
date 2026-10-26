// One tidy summary per day, built from a day document. Used by the weekly review, the trends and the export.

export type DaySummary = {
  date: string;       // YYYY-MM-DD
  calories: number; protein: number; carbs: number; fat: number; meals: number;
  water: number;      // ml
  sleep: number;      // hours
  workouts: number;
  breaks: number;     // finished mindful breaks
  logged: boolean;    // anything at all was recorded
};

const num = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

export function summarizeDay(date: string, raw: any, breaks = 0): DaySummary {
  const food: any[] = Array.isArray(raw?.foodLog) ? raw.foodLog : [];
  const sum = (k: string, max: number) => Math.round(food.reduce((n, f) => n + num(f?.[k], max), 0) * 10) / 10;
  const s: DaySummary = {
    date,
    calories: Math.round(sum('calories', 5000)), protein: sum('protein', 500), carbs: sum('carbs', 1000), fat: sum('fat', 500), meals: food.length,
    water: Math.round(num(raw?.waterTotal, 20000)), sleep: Math.round(num(raw?.sleepHours, 24) * 10) / 10,
    workouts: Math.floor(num(raw?.workoutsCompleted, 20)), breaks: Math.floor(num(breaks, 200)), logged: false,
  };
  s.logged = s.meals > 0 || s.water > 0 || s.sleep > 0 || s.workouts > 0;
  return s;
}

export const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
