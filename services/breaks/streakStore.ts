// Firestore persistence for the break streak (users/{uid}/meta/breakStreak).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { BreakStreakState, cleanStreak } from './rewards';

const ref = (uid: string) => doc(db, 'users', uid, 'meta', 'breakStreak');

export async function loadBreakStreak(uid: string): Promise<BreakStreakState> {
  const snap = await getDoc(ref(uid));
  return cleanStreak(snap.exists() ? snap.data() : undefined);
}

export const saveBreakStreak = (uid: string, s: BreakStreakState) => setDoc(ref(uid), s);
