// Text for the share sheet. A card is a few lines built from the person's own numbers, never
// anything private beyond what they choose to send. Pure so it can be tested.

import type { WeeklyReview } from '../habits/weeklyReview';
import type { PersonalRecord } from '../training/progression';

export const fillCard = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export function weekCardVars(r: WeeklyReview, streak: number): Record<string, number> {
  const s = r.stats;
  return { workouts: s.workouts, waterDays: s.waterDays, sleep: s.sleepAvg, loggedDays: s.loggedDays, streak: Math.max(0, Math.floor(streak)) };
}

/** The best record, preferring a heavier lift; used for the headline of a workout card. */
export function topRecord(prs: PersonalRecord[]): PersonalRecord | null {
  if (!prs.length) return null;
  const order = { weight: 0, e1rm: 1, volume: 2 } as const;
  return [...prs].sort((a, b) => order[a.kind] - order[b.kind] || b.value - a.value)[0];
}

export function recordCardVars(pr: PersonalRecord): Record<string, string | number> {
  return { name: pr.name, v: Math.round(pr.value), p: Math.round(pr.previous) };
}
