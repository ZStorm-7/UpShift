// Firestore persistence for mindful-break settings (synced across devices).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { BreakSettings, normalizeSettings } from './settings';

const ref = (uid: string) => doc(db, 'users', uid, 'meta', 'breaks');

export async function loadBreakSettings(uid: string): Promise<BreakSettings> {
  const snap = await getDoc(ref(uid));
  return normalizeSettings(snap.exists() ? (snap.data() as Partial<BreakSettings>) : undefined);
}

export const saveBreakSettings = (uid: string, s: BreakSettings) => setDoc(ref(uid), s);
