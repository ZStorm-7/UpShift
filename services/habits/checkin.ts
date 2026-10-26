// The daily check-in reminder: when it fires, and what the "log water" button on it does.
// Pure rules here; scheduling is in services/notifications.ts.

export type CheckinSettings = { enabled: boolean; hour: number; minute: number };
export const DEFAULT_CHECKIN: CheckinSettings = { enabled: false, hour: 19, minute: 30 };
export const CHECKIN_WATER_ML = 250;
export const CHECKIN_ACTION_LOG_WATER = 'LOG_WATER';
export const CHECKIN_CATEGORY = 'daily-checkin';
export const CHECKIN_IDENTIFIER = 'daily-checkin-reminder';

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function cleanCheckin(raw: any): CheckinSettings {
  return {
    enabled: raw?.enabled === true,
    hour: int(raw?.hour, 0, 23, DEFAULT_CHECKIN.hour),
    minute: int(raw?.minute, 0, 59, DEFAULT_CHECKIN.minute),
  };
}

/** Moves the time by whole steps of `stepMin`, wrapping around midnight. */
export function shiftTime(s: CheckinSettings, stepMin: number): CheckinSettings {
  const total = (((s.hour * 60 + s.minute + stepMin) % 1440) + 1440) % 1440;
  return { ...s, hour: Math.floor(total / 60), minute: total % 60 };
}

export function formatClock(hour: number, minute: number, locale = 'en-US'): string {
  try { return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }); }
  catch { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; }
}

/** The next time the reminder will show, so the settings screen can say so. */
export function nextFire(now: Date, s: CheckinSettings): Date {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), s.hour, s.minute, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

// ---- what to do with a tap on the notification ----
export type ResponseLike = { actionIdentifier: string; notification: { date: number; request: { identifier: string } } };
export type ResponseDeps = {
  uid: string | null;
  lastHandledAt: number;                       // the newest notification time already handled
  addWater: (uid: string, ml: number) => Promise<void>;
  rememberHandled: (uid: string, at: number) => Promise<void>;
};

/**
 * Logs the water for the "+250 ml" button, once per notification. Taps that merely open the app, other
 * notifications, signed-out users and repeats of an already-handled response do nothing here.
 * Returns what happened, for tests and for the confirmation message.
 */
export async function handleCheckinResponse(r: ResponseLike, d: ResponseDeps): Promise<'logged' | 'ignored' | 'duplicate' | 'signed-out' | 'failed'> {
  if (r.notification.request.identifier !== CHECKIN_IDENTIFIER || r.actionIdentifier !== CHECKIN_ACTION_LOG_WATER) return 'ignored';
  if (!d.uid) return 'signed-out';
  const at = Number(r.notification.date) || 0;
  if (at > 0 && at <= d.lastHandledAt) return 'duplicate';
  try {
    await d.addWater(d.uid, CHECKIN_WATER_ML);
    await d.rememberHandled(d.uid, at || Date.now());
    return 'logged';
  } catch { return 'failed'; }
}
