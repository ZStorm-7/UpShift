// What the weekly insights screen shows, as pure functions over the per-day
// counters kept in users/{uid}/breakDays/{yyyy-mm-dd}. Counts only: no app
// names and no free text are ever stored.

export type IntentId = 'specific' | 'connect' | 'unwind' | 'unsure';
export const INTENT_IDS: IntentId[] = ['specific', 'connect', 'unwind', 'unsure'];

export type DayStats = {
  done: number;      // breaks finished
  stay: number;      // chose to stay in UpShift afterwards
  exit: number;      // chose to leave
  passes: number;    // emergency passes used
  strict: number;    // strict-mode sessions started
  intent: Partial<Record<IntentId, number>>;
  // Mood tapped after a break (1 to 5): the running total and how many people-taps made it.
  moodSum: number;
  moodN: number;
  // Breaks finished in each hour of the local day: { h9: 2, h21: 3 }.
  hours: Record<string, number>;
};

export const EMPTY_DAY: DayStats = { done: 0, stay: 0, exit: 0, passes: 0, strict: 0, intent: {}, moodSum: 0, moodN: 0, hours: {} };

export const MOODS = [1, 2, 3, 4, 5] as const;

export function cleanDay(raw: any): DayStats {
  const n = (v: unknown) => Math.max(0, Math.min(10_000, Math.floor(Number(v)) || 0));
  const intent: Partial<Record<IntentId, number>> = {};
  for (const id of INTENT_IDS) if (raw?.intent?.[id]) intent[id] = n(raw.intent[id]);
  const hours: Record<string, number> = {};
  for (let h = 0; h < 24; h++) if (raw?.hours?.[`h${h}`]) hours[`h${h}`] = n(raw.hours[`h${h}`]);
  return {
    done: n(raw?.done), stay: n(raw?.stay), exit: n(raw?.exit), passes: n(raw?.passes), strict: n(raw?.strict), intent,
    moodSum: Math.min(50_000, n(raw?.moodSum)), moodN: n(raw?.moodN), hours,
  };
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The last `count` day keys, oldest first, ending with `today`.
export function lastDayKeys(today: Date, count = 7): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

export type WeekSummary = {
  days: { key: string; weekday: number; done: number }[];
  total: number;
  exits: number;
  stays: number;
  // Share of finished breaks where the user chose to leave (null until there is one).
  exitRate: number | null;
  passes: number;
  strict: number;
  intents: Partial<Record<IntentId, number>>;
  // Days in a row, ending today (or yesterday if today has none yet), with at least one break.
  streak: number;
  busiest: { key: string; done: number } | null;
  // Average mood after a break, 1 to 5 (null until someone taps one).
  moodAvg: number | null;
  // Breaks finished in each hour of the day over the week, and the busiest hour.
  hours: number[];
  peakHour: number | null;
};

// Sums the per-day hour counters into 24 slots.
export function weekHours(rows: DayStats[]): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const r of rows) for (let h = 0; h < 24; h++) out[h] += r.hours[`h${h}`] ?? 0;
  return out;
}

export function peakHourOf(hours: number[]): number | null {
  let best: number | null = null;
  hours.forEach((v, h) => { if (v > 0 && (best === null || v > hours[best])) best = h; });
  return best;
}

export function summarizeWeek(byDay: Record<string, Partial<DayStats> | undefined>, today: Date, count = 7): WeekSummary {
  const keys = lastDayKeys(today, count);
  const rows = keys.map(key => ({ key, stats: cleanDay(byDay[key]) }));
  const sum = (f: (s: DayStats) => number) => rows.reduce((n, r) => n + f(r.stats), 0);

  const total = sum(s => s.done);
  const exits = sum(s => s.exit);
  const stays = sum(s => s.stay);

  const intents: Partial<Record<IntentId, number>> = {};
  for (const id of INTENT_IDS) {
    const v = sum(s => s.intent[id] ?? 0);
    if (v > 0) intents[id] = v;
  }

  // Streak: look back from today; an empty today doesn't break it, it just hasn't happened yet.
  let streak = 0;
  let i = rows.length - 1;
  if (rows[i].stats.done === 0) i--;
  for (; i >= 0 && rows[i].stats.done > 0; i--) streak++;

  let busiest: WeekSummary['busiest'] = null;
  for (const r of rows) if (r.stats.done > 0 && (!busiest || r.stats.done > busiest.done)) busiest = { key: r.key, done: r.stats.done };

  return {
    days: rows.map(r => {
      const [yy, mm, dd] = r.key.split('-').map(Number);
      return { key: r.key, weekday: new Date(yy, mm - 1, dd).getDay(), done: r.stats.done };
    }),
    total, exits, stays,
    exitRate: exits + stays > 0 ? exits / (exits + stays) : null,
    passes: sum(s => s.passes),
    strict: sum(s => s.strict),
    intents, streak, busiest,
    moodAvg: sum(s => s.moodN) > 0 ? sum(s => s.moodSum) / sum(s => s.moodN) : null,
    hours: weekHours(rows.map(r => r.stats)),
    peakHour: peakHourOf(weekHours(rows.map(r => r.stats))),
  };
}
