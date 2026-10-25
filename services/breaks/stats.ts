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
};

export const EMPTY_DAY: DayStats = { done: 0, stay: 0, exit: 0, passes: 0, strict: 0, intent: {} };

export function cleanDay(raw: any): DayStats {
  const n = (v: unknown) => Math.max(0, Math.min(10_000, Math.floor(Number(v)) || 0));
  const intent: Partial<Record<IntentId, number>> = {};
  for (const id of INTENT_IDS) if (raw?.intent?.[id]) intent[id] = n(raw.intent[id]);
  return { done: n(raw?.done), stay: n(raw?.stay), exit: n(raw?.exit), passes: n(raw?.passes), strict: n(raw?.strict), intent };
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
};

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
  };
}
