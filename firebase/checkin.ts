// Saved check-in reminder settings, and the water logged from the notification button.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { incrementTodayField } from './progress';
import { emitDayDataChanged } from '../services/dataEvents';
import { cleanCheckin, DEFAULT_CHECKIN, type CheckinSettings } from '../services/habits/checkin';

const settingsRef = (uid: string) => doc(db, 'users', uid, 'meta', 'checkin');
const handledRef = (uid: string) => doc(db, 'users', uid, 'meta', 'checkinHandled');

export async function loadCheckin(uid: string): Promise<CheckinSettings> {
  const snap = await getDoc(settingsRef(uid));
  return snap.exists() ? cleanCheckin(snap.data()) : DEFAULT_CHECKIN;
}
export const saveCheckin = (uid: string, s: CheckinSettings) => setDoc(settingsRef(uid), cleanCheckin(s));

export async function loadHandledAt(uid: string): Promise<number> {
  try { return Number(((await getDoc(handledRef(uid))).data() as any)?.at) || 0; } catch { return 0; }
}
export const saveHandledAt = (uid: string, at: number) => setDoc(handledRef(uid), { at });

export async function addWaterFromNotification(uid: string, ml: number): Promise<void> {
  await incrementTodayField(uid, 'waterTotal', ml);
  emitDayDataChanged();
}
