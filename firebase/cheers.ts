import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { cheerId, cleanCheer, type Cheer, type CheerKind } from '../services/social/cheers';

// users/{friend}/cheers/{fromUid}_{day}_{kind}. The friend owns the collection (reads and deletes);
// a friend may create a cheer (see firestore.rules), never edit or remove one. A sender cannot read
// a friend's cheers, so what they sent today is remembered in their own meta/cheersSent.

export type SendResult = 'sent' | 'already_sent' | 'failed';

const sentRef = (uid: string) => doc(db, 'users', uid, 'meta', 'cheersSent');

export async function loadSentToday(uid: string, day: string): Promise<string[]> {
  try {
    const d: any = (await getDoc(sentRef(uid))).data();
    return d?.day === day && Array.isArray(d.ids) ? d.ids.filter((x: unknown) => typeof x === 'string').slice(0, 200) : [];
  } catch { return []; }
}

export async function sendCheer(fromUid: string, fromName: string, toUid: string, kind: CheerKind, day: string, sentToday: string[]): Promise<SendResult> {
  const id = cheerId(fromUid, day, kind);
  const key = `${toUid}:${id}`;
  if (sentToday.includes(key)) return 'already_sent';
  try {
    await setDoc(doc(db, 'users', toUid, 'cheers', id), { fromUid, fromName, kind, day, ts: serverTimestamp() });
  } catch {
    return 'failed';
  }
  try {
    // A new day starts a new list (merge would keep yesterday's ids).
    await setDoc(sentRef(fromUid), { day, ids: sentToday.length ? arrayUnion(key) : [key] }, { merge: true });
  } catch { /* the cheer was delivered; only the greyed-out button is lost */ }
  return 'sent';
}

export async function loadCheers(uid: string, day: string): Promise<Cheer[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'cheers'), where('day', '==', day)));
  return snap.docs.map(d => cleanCheer(d.id, d.data())).filter((c): c is Cheer => !!c);
}
