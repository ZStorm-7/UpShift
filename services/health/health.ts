// Health import (Apple Health on iPhone, Health Connect on Android).
//
// Reading from those apps needs a native library and permissions that only exist in a real device
// build, so this file holds the part that can be tested anywhere: what a "health day" looks like,
// how it is cleaned, and how it is merged without ever overwriting what the person logged by hand.
// A provider (see provider.ts) fills in the reading. With no provider the feature stays hidden.

export type HealthDay = { date: string; steps: number; sleepHours: number; weightKg: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : 0; };

export function cleanHealthDay(raw: any): HealthDay | null {
  if (!raw || typeof raw.date !== 'string' || !DAY.test(raw.date)) return null;
  return {
    date: raw.date,
    steps: Math.round(num(raw.steps, 0, 200_000)),
    sleepHours: Math.round(num(raw.sleepHours, 0, 24) * 10) / 10,
    weightKg: Math.round(num(raw.weightKg, 20, 400) * 10) / 10,
  };
}

export const LBS_PER_KG = 2.2046226218;
export const kgToLbs = (kg: number) => Math.round(kg * LBS_PER_KG * 10) / 10;

export type DayDoc = { sleepHours?: number; steps?: number; sleepLoggedFromTimes?: boolean };
export type WeightEntry = { date: string; weightLbs: number };

/**
 * What to write for one day. Anything the person already logged wins: sleep is only filled when
 * nothing was entered, steps only when none are stored, and a weight is only added for a day that
 * has no weigh-in. Returns just the fields that should change (empty = nothing to do).
 */
export function planMerge(h: HealthDay, day: DayDoc | null, weights: WeightEntry[]): { day: Partial<DayDoc>; weight: WeightEntry | null } {
  const patch: Partial<DayDoc> = {};
  if (h.sleepHours > 0 && !(Number(day?.sleepHours) > 0)) patch.sleepHours = h.sleepHours;
  if (h.steps > 0 && !(Number(day?.steps) > 0)) patch.steps = h.steps;
  const weight = h.weightKg > 0 && !weights.some(w => w.date === h.date) ? { date: h.date, weightLbs: kgToLbs(h.weightKg) } : null;
  return { day: patch, weight };
}

export type ProviderResult = { ok: true; days: HealthDay[] } | { ok: false; reason: 'denied' | 'unavailable' | 'error' };
