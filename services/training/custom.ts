// Workouts people build themselves, and a compact share code so a friend can import one.

import type { Exercise, WorkoutTemplate } from '../../data/workoutPlans';

export const MAX_EXERCISES = 12;
export const MAX_NAME = 40;
export const MAX_TITLE = 40;

export type CustomWorkout = { id: string; title: string; focus: string; exercises: Exercise[] };

// 8, 8-12, 30s, 20-30s, 8/side or AMRAP
const REPS_RE = /^(\d{1,3}(-\d{1,3})?(s|\/side)?|AMRAP)$/i;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanExercise(raw: any): Exercise | null {
  const name = cleanText(raw?.name, MAX_NAME);
  if (!name) return null;
  const reps = cleanText(raw?.reps, 12);
  return {
    name,
    sets: clamp(Math.floor(Number(raw?.sets)) || 3, 1, 10),
    reps: REPS_RE.test(reps) ? reps : '8-12',
    restSec: clamp(Math.floor(Number(raw?.restSec)) || 90, 15, 300),
  };
}

/** Returns a clean workout, or null if there is no title or no usable exercise. */
export function cleanCustomWorkout(raw: any, id: string): CustomWorkout | null {
  const title = cleanText(raw?.title, MAX_TITLE);
  const exercises = (Array.isArray(raw?.exercises) ? raw.exercises : []).map(cleanExercise).filter(Boolean).slice(0, MAX_EXERCISES) as Exercise[];
  if (!title || exercises.length === 0) return null;
  return { id, title, focus: cleanText(raw?.focus, 60) || 'custom', exercises };
}

export function customToTemplate(c: CustomWorkout): WorkoutTemplate {
  const sets = c.exercises.reduce((n, e) => n + e.sets, 0);
  return { id: `custom-${c.id}`, title: c.title, focus: c.focus, tier: 'beginner', exercises: c.exercises, durationMin: Math.max(10, Math.round(sets * 2.5)) };
}

// ---- share code: UPW1.<base64url of compact JSON> ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function fromUtf8(b: number[]): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c < 0xf0) { cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); }
    else { cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); }
    s += String.fromCodePoint(cp);
  }
  return s;
}
function b64encode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}
function b64decode(s: string): number[] | null {
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); buf &= (1 << bits) - 1; }
  }
  return bytes;
}

export function encodeShareCode(c: CustomWorkout): string {
  const compact = { t: c.title, f: c.focus, e: c.exercises.map(e => [e.name, e.sets, e.reps, e.restSec]) };
  return 'UPW1.' + b64encode(utf8Bytes(JSON.stringify(compact)));
}

/** Parses and validates a pasted share code. Returns null for anything that is not a valid workout. */
export function decodeShareCode(code: string, id: string): CustomWorkout | null {
  const m = String(code ?? '').trim().match(/UPW1\.([A-Za-z0-9_-]{1,4000})/);
  if (!m) return null;
  const bytes = b64decode(m[1]);
  if (!bytes) return null;
  try {
    const j = JSON.parse(fromUtf8(bytes));
    return cleanCustomWorkout({
      title: j.t, focus: j.f,
      exercises: (Array.isArray(j.e) ? j.e : []).map((x: any[]) => ({ name: x?.[0], sets: x?.[1], reps: x?.[2], restSec: x?.[3] })),
    }, id);
  } catch { return null; }
}

export function shareText(c: CustomWorkout): string {
  const lines = c.exercises.map(e => `• ${e.name}: ${e.sets} × ${e.reps}`);
  return `${c.title} (UpShift)\n${lines.join('\n')}\n\nImport in UpShift > Workout > My workouts:\n${encodeShareCode(c)}`;
}
