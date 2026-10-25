// Pure helpers for the small server-side limits: per-action rate limits and
// the leaderboard XP "bank". No Firebase imports so they're unit tested.

export const prune = (ts: number[] | undefined, now: number, windowMs: number): number[] =>
  (ts ?? []).filter(t => now - t < windowMs);

// Sliding-window limiter: returns the new timestamp list, or null if over limit.
export function hit(ts: number[] | undefined, now: number, max: number, windowMs: number): number[] | null {
  const recent = prune(ts, now, windowMs);
  if (recent.length >= max) return null;
  return [...recent, now];
}

// ---- Leaderboard XP bank ----
// Scores are computed by the app, which the server can't re-derive, so the
// server bounds how fast a score may grow instead. A user "earns" allowance
// over time (DAILY_XP_ALLOWANCE per day, banked up to MAX_BANK_DAYS days) and
// each accepted increase spends it. Normal play never notices; a tampered
// client can only climb at the legitimate rate.
export const DAILY_XP_ALLOWANCE = 1000;
export const MAX_BANK_DAYS = 3;
export const INITIAL_BANK = DAILY_XP_ALLOWANCE * 2;
export const FIRST_PUBLISH_MAX_TOTAL_XP = 20_000; // ~200 levels, for accounts that already have XP

export type XpState = { bank: number; at: number };

export function applyXpBank(
  prevTotal: number | null,
  state: XpState | undefined,
  requestedTotal: number,
  now: number,
): { total: number; state: XpState; clamped: boolean } {
  const requested = Math.max(0, Math.round(requestedTotal) || 0);

  if (prevTotal === null) {
    const total = Math.min(requested, FIRST_PUBLISH_MAX_TOTAL_XP);
    return { total, state: { bank: INITIAL_BANK, at: now }, clamped: total !== requested };
  }

  const elapsedDays = Math.max(0, now - (state?.at ?? now)) / 86_400_000;
  const cap = DAILY_XP_ALLOWANCE * MAX_BANK_DAYS;
  const bank = Math.min(cap, (state?.bank ?? INITIAL_BANK) + elapsedDays * DAILY_XP_ALLOWANCE);

  const gain = requested - prevTotal;
  if (gain <= 0) return { total: requested, state: { bank, at: now }, clamped: false };
  if (gain <= bank) return { total: requested, state: { bank: bank - gain, at: now }, clamped: false };
  return { total: prevTotal + Math.floor(bank), state: { bank: bank - Math.floor(bank), at: now }, clamped: true };
}

// Account deletion needs a login from the last few minutes.
export const RECENT_LOGIN_SECONDS = 5 * 60;
export const isRecentLogin = (authTimeSeconds: number | undefined, nowMs: number) =>
  typeof authTimeSeconds === 'number' && nowMs / 1000 - authTimeSeconds <= RECENT_LOGIN_SECONDS;

// A break streak can't be longer than the account has existed (plus today).
// Bounds a tampered client without needing to see the individual days.
export function maxPlausibleStreak(accountCreatedMs: number, nowMs: number): number {
  const days = Math.floor(Math.max(0, nowMs - accountCreatedMs) / 86_400_000);
  return days + 1;
}
