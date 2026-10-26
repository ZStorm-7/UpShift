import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './config';
import { weightLogDocRef } from './weight';
import { streakDocRef } from './streaks';
import { summarizeDay, type DaySummary } from '../services/insights/days';
import type { ExportParts } from '../services/export/dataExport';

const all = async (uid: string, name: string) => (await getDocs(collection(db, 'users', uid, name))).docs.map(d => ({ id: d.id, ...d.data() }));
const one = async (ref: ReturnType<typeof doc>) => { try { return (await getDoc(ref)).data() ?? null; } catch { return null; } };

/** Everything the person owns, read with their own sign-in. */
export async function loadExportData(uid: string): Promise<{ parts: ExportParts; summaries: DaySummary[] }> {
  const [profile, days, breakDays, logs, customWorkouts, weightLog, records, streak] = await Promise.all([
    one(doc(db, 'users', uid)),
    all(uid, 'days'),
    all(uid, 'breakDays').catch(() => [] as any[]),
    all(uid, 'workoutLogs').catch(() => [] as any[]),
    all(uid, 'customWorkouts').catch(() => [] as any[]),
    one(weightLogDocRef(uid)),
    one(doc(db, 'users', uid, 'meta', 'records')),
    one(streakDocRef(uid)),
  ]);
  const breaks = new Map<string, number>(breakDays.map((b: any) => [b.id, Number(b.done) || 0]));
  const summaries = days.map((d: any) => summarizeDay(d.id, d, breaks.get(d.id) ?? 0));
  return {
    parts: { profile, days: days.map((d: any) => ({ date: d.id, ...d, id: undefined })), weights: (weightLog as any)?.entries ?? [], workoutLogs: logs, customWorkouts, records, streak },
    summaries,
  };
}
