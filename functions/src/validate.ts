// Input validation and output sanitizing. Pure functions.

import {
  MAX_TEXT_CHARS, MAX_HISTORY_TURNS, MAX_HISTORY_CHARS, MAX_FRIENDS,
} from './config.ts';

export type Turn = { role: 'user' | 'model'; text: string };

export function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (const t of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!t || (t.role !== 'user' && t.role !== 'model') || typeof t.text !== 'string') continue;
    turns.push({ role: t.role, text: t.text.slice(0, MAX_TEXT_CHARS * 2) });
  }
  // Total cap: drop oldest turns first.
  while (turns.length > 1 && turns.reduce((n, t) => n + t.text.length, 0) > MAX_HISTORY_CHARS) turns.shift();
  // Gemini requires the conversation to start with a user turn and the last to be the user's.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

export const clampText = (v: unknown, max = MAX_TEXT_CHARS) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const num = (v: unknown, max = 5000) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
const str = (v: unknown, max = 80) => String(v ?? '').slice(0, max);

export type MealItem = { name: string; calories: number; protein: number; carbs: number; fat: number };
export const cleanMeal = (i: any): MealItem => ({
  name: str(i?.name || 'Food', 60), calories: num(i?.calories), protein: num(i?.protein, 500),
  carbs: num(i?.carbs, 800), fat: num(i?.fat, 500),
});

export type PlanExercise = { name: string; sets: number; reps: string; restSec: number; cue?: string };
export type PlanDay = { day: string; focus: string; rest: boolean; exercises: PlanExercise[] };

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function cleanPlan(raw: any): PlanDay[] {
  const days: PlanDay[] = (raw?.days ?? []).slice(0, 7).map((d: any, i: number) => ({
    // The app maps this onto the real weekday, so force an English weekday name.
    day: WEEKDAYS.find(w => String(d?.day).toLowerCase().startsWith(w.slice(0, 3))) ?? WEEKDAYS[i],
    focus: str(d?.focus, 60), rest: !!d?.rest,
    exercises: (d?.exercises ?? []).slice(0, 6).map((e: any) => ({
      name: str(e?.name, 60),
      sets: Math.min(8, Math.max(1, Math.round(Number(e?.sets)) || 3)),
      reps: str(e?.reps, 12),
      restSec: Math.min(300, Math.max(15, Math.round(Number(e?.restSec)) || 60)),
      ...(e?.cue ? { cue: str(e.cue, 120) } : {}),
    })),
  }));
  return days;
}

export type Ingredient = { item: string; qty: number; unit: string; aisle: string };
export type Meal = { name: string; type: string; calories: number; protein: number; carbs: number; fat: number; ingredients: Ingredient[] };
export type MealDay = { day: string; meals: Meal[] };

export function cleanMealPlan(raw: any): MealDay[] {
  return (raw?.days ?? []).slice(0, 7).map((d: any, i: number) => ({
    day: WEEKDAYS.find(w => String(d?.day).toLowerCase().startsWith(w.slice(0, 3))) ?? WEEKDAYS[i],
    meals: (d?.meals ?? []).slice(0, 6).map((m: any) => ({
      name: str(m?.name, 80), type: str(m?.type, 20),
      calories: num(m?.calories, 3000), protein: num(m?.protein, 300), carbs: num(m?.carbs, 500), fat: num(m?.fat, 300),
      ingredients: (m?.ingredients ?? []).slice(0, 15).map((g: any) => ({
        item: str(g?.item, 50), qty: Math.round((Number(g?.qty) || 1) * 100) / 100,
        unit: str(g?.unit, 12), aisle: str(g?.aisle || 'Other', 30),
      })),
    })),
  }));
}

export const dayCalories = (d: MealDay) => d.meals.reduce((n, m) => n + m.calories, 0);

// ---- Allergen screening ----
// Substring matching against meal names and ingredients, with synonyms for
// the common allergens. This lowers risk; it can never guarantee safety, and
// the app says so next to every meal plan.
const SYNONYMS: Record<string, string[]> = {
  peanut: ['peanut', 'groundnut'],
  'tree nut': ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'nut butter'],
  nut: ['nut', 'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  dairy: ['milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'whey', 'casein', 'ghee', 'paneer', 'kefir'],
  milk: ['milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'whey', 'casein', 'ghee', 'paneer'],
  lactose: ['milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'whey', 'ice cream'],
  egg: ['egg', 'mayonnaise', 'mayo', 'meringue'],
  gluten: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous', 'noodle', 'tortilla', 'cracker', 'seitan', 'semolina', 'bulgur'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'couscous', 'noodle', 'tortilla', 'semolina', 'bulgur'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'sardine', 'anchovy', 'trout', 'halibut'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish'],
  sesame: ['sesame', 'tahini'],
};

export function cleanAllergies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(a => String(a).toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 12);
}

export function allergenHits(days: MealDay[], allergies: string[]): string[] {
  const terms = new Set<string>();
  for (const a of allergies) {
    terms.add(a);
    // Exact key first, then the LONGEST key contained in the entry, so "shellfish"
    // matches shellfish and not the shorter "fish".
    const key = SYNONYMS[a] ? a : Object.keys(SYNONYMS).filter(k => a.includes(k)).sort((x, y) => y.length - x.length)[0];
    if (key) SYNONYMS[key].forEach(s => terms.add(s));
  }
  const hits = new Set<string>();
  for (const d of days) for (const m of d.meals) {
    const hay = [m.name, ...m.ingredients.map(i => i.item)].join(' | ').toLowerCase();
    for (const t of terms) if (hay.includes(t)) hits.add(`${t} in "${m.name}"`);
  }
  return [...hits];
}

// Days whose total is outside +/-15% of the goal.
export function calorieMisses(days: MealDay[], goal: number): string[] {
  if (!goal) return [];
  return days.filter(d => {
    const c = dayCalories(d);
    return c < goal * 0.85 || c > goal * 1.15;
  }).map(d => `${d.day}: ${dayCalories(d)} kcal`);
}

export type FriendRow = { uid: string; name: string; level: number; totalXP: number; streak: number };
export function cleanFriends(raw: unknown): FriendRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_FRIENDS).filter(f => f && typeof f.uid === 'string').map(f => ({
    uid: str(f.uid, 128), name: str(f.name || 'Friend', 40),
    level: num(f.level, 1000), totalXP: num(f.totalXP, 10_000_000), streak: num(f.streak, 10_000),
  }));
}

// ---- Mindful-break statistics (for the coach) ----
export const BREATHING_STYLES = ['calm', 'sigh', 'box', 'long'] as const;
export type BreathingStyle = typeof BREATHING_STYLES[number];

export function cleanStyleSuggestion(args: any): { pattern: BreathingStyle; reason: string } | null {
  const pattern = String(args?.pattern ?? '').toLowerCase() as BreathingStyle;
  if (!BREATHING_STYLES.includes(pattern)) return null;
  return { pattern, reason: str(args?.reason, 200) };
}

const count = (v: unknown) => Math.max(0, Math.min(10_000, Math.floor(Number(v)) || 0));

export type BreakSummary = {
  daysWithData: number; breaksCompleted: number; perDay: { date: string; breaks: number }[];
  stayedInApp: number; leftApp: number; leftAppPercent: number | null;
  whyOpened: Record<string, number>; averageMoodAfterBreak: number | null;
  busiestHours: { hour: number; breaks: number }[]; emergencyPassesUsed: number; strictSessions: number;
};

// Folds the per-day counters (users/{uid}/breakDays) into what the coach can talk about.
// Counts only: the app never stores app names or free text for breaks.
export function summarizeBreakDays(rows: { date: string; data: any }[]): BreakSummary {
  let done = 0, stay = 0, exit = 0, passes = 0, strict = 0, moodSum = 0, moodN = 0, withData = 0;
  const intents: Record<string, number> = {};
  const hours = Array.from({ length: 24 }, () => 0);
  const perDay = rows.map(r => {
    const d = r.data ?? {};
    const n = count(d.done);
    if (n > 0 || count(d.passes) > 0 || count(d.strict) > 0) withData++;
    done += n; stay += count(d.stay); exit += count(d.exit); passes += count(d.passes); strict += count(d.strict);
    moodSum += count(d.moodSum); moodN += count(d.moodN);
    for (const id of ['specific', 'connect', 'unwind', 'unsure']) {
      const v = count(d.intent?.[id]);
      if (v) intents[id] = (intents[id] ?? 0) + v;
    }
    for (let h = 0; h < 24; h++) hours[h] += count(d.hours?.[`h${h}`]);
    return { date: r.date, breaks: n };
  });
  const busiest = hours.map((breaks, hour) => ({ hour, breaks })).filter(h => h.breaks > 0)
    .sort((a, b) => b.breaks - a.breaks || a.hour - b.hour).slice(0, 3);
  return {
    daysWithData: withData, breaksCompleted: done, perDay, stayedInApp: stay, leftApp: exit,
    leftAppPercent: stay + exit > 0 ? Math.round((exit / (stay + exit)) * 100) : null,
    whyOpened: intents, averageMoodAfterBreak: moodN > 0 ? Math.round((moodSum / moodN) * 10) / 10 : null,
    busiestHours: busiest, emergencyPassesUsed: passes, strictSessions: strict,
  };
}
