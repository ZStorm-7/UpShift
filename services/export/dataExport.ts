// "Download my data". Pure builders for the two files: one JSON with everything,
// and a daily CSV that opens in a spreadsheet.

import type { DaySummary } from '../insights/days';

export const EXPORT_VERSION = 1;

// A spreadsheet runs a cell that starts with = + - or @ as a formula. Food names come from the
// person (or a barcode database), so those cells get a leading apostrophe and stay plain text.
// Plain negative numbers are left alone.
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  return [columns, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const DAILY_COLUMNS = ['date', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'meals', 'water_ml', 'sleep_hours', 'workouts', 'mindful_breaks'];

export function dailyCsv(days: DaySummary[]): string {
  const rows = [...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => [d.date, d.calories, d.protein, d.carbs, d.fat, d.meals, d.water, d.sleep, d.workouts, d.breaks]);
  return toCsv(DAILY_COLUMNS, rows);
}

export type ExportParts = {
  profile: Record<string, unknown> | null;
  days: unknown[];            // raw day documents with their date
  weights: unknown[];
  workoutLogs: unknown[];
  customWorkouts: unknown[];
  records: unknown;
  streak: unknown;
};

// Never include credentials or the push token; the profile is the person's own answers.
const PROFILE_SKIP = new Set(['pushToken', 'expoPushToken', 'fcmToken']);

export function buildExportJson(parts: ExportParts, now: Date): string {
  const profile = parts.profile ? Object.fromEntries(Object.entries(parts.profile).filter(([k]) => !PROFILE_SKIP.has(k))) : null;
  return JSON.stringify({ app: 'UpShift', exportVersion: EXPORT_VERSION, exportedAt: now.toISOString(), ...parts, profile }, jsonSafe, 2);
}

// Firestore timestamps and the like become ISO strings; non-finite numbers become null.
function jsonSafe(_k: string, v: unknown): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') { try { return (v as any).toDate().toISOString(); } catch { return null; } }
  return v;
}

export const exportFileName = (kind: 'json' | 'csv', now: Date) =>
  `upshift-${kind === 'json' ? 'data' : 'daily'}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.${kind}`;
