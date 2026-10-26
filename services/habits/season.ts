// Calendar-month seasons for the leaderboard. Months are UTC, matching the server (functions/src/season.ts).

export const monthKeyUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Whole days left in the current UTC month, counting today (1 on the last day). */
export function daysLeftInMonthUtc(ms: number): number {
  const d = new Date(ms);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((end - ms) / 86_400_000));
}

export function monthLabel(ms: number, locale: string): string {
  try { return new Date(ms).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  catch { return monthKeyUtc(ms); }
}
