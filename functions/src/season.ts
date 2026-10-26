// Monthly leaderboard: XP earned this calendar month (UTC). The server works it out from how much
// the stored total grew, so the app can't claim month XP any more than it can claim total XP.
// Keep monthKeyUtc in step with services/habits/season.ts (a test checks).

export const monthKeyUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function monthlyXp(opts: { prevKey?: unknown; prevMonthXP?: unknown; prevTotal: number | null; newTotal: number; nowMs: number }): { monthKey: string; monthXP: number } {
  const key = monthKeyUtc(opts.nowMs);
  // The first ever publish is a baseline, not earnings: nothing counts toward the month yet.
  const delta = opts.prevTotal === null ? 0 : Math.max(0, Math.floor(opts.newTotal - opts.prevTotal));
  const sameMonth = opts.prevKey === key;
  const base = sameMonth ? Math.max(0, Math.floor(Number(opts.prevMonthXP)) || 0) : 0;
  return { monthKey: key, monthXP: Math.min(base + delta, 10_000_000) };
}
