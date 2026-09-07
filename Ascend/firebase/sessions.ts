// Multi-device session tracking — "Log out of all devices" and "Trusted
// devices" in Settings > Account, built entirely client-side.
//
// WHY NOT CLOUD FUNCTIONS: revoking a session server-side (the Admin SDK's
// revokeRefreshTokens) is the textbook way to do this, but Cloud Functions
// require the Firebase project to be on the Blaze (pay-as-you-go) plan —
// that's a hard platform rule, not a config choice, and applies the moment
// ANY function is deployed regardless of whether it ever runs. Since the
// goal here is zero billing setup, this instead uses a small Firestore
// document every signed-in device already has free access to, and a
// listener each device keeps open on itself.
//
// HOW IT WORKS: users/{uid}/meta/sessions holds one entry per device this
// account has ever signed into, keyed by a random ID generated once and
// persisted locally (AsyncStorage). Each device subscribes to its OWN
// entry. "Log out of all devices" bumps a single `invalidatedAt`
// timestamp; revoking one device sets that device's own `revokedAt`.
// Either one being newer than the device's `loginAt` means "this session
// is no longer valid" — the device notices on its next snapshot (near-
// instant while online, or on the next reconnect if it was offline) and
// signs itself out.
//
// LIMITATION, stated plainly: a device that is fully offline (airplane
// mode, no connectivity) keeps whatever local Firebase Auth session it
// already has until it reconnects and its listener fires. There is no way
// to force an offline device to lose access instantly without a server —
// this is the real tradeoff for avoiding Blaze, not a bug.

import { Platform } from 'react-native';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './config';

export type DeviceEntry = {
  name: string;
  platform: string;
  loginAt: number;
  lastSeen: number;
  revokedAt: number | null;
};

export type SessionsDoc = {
  invalidatedAt: number | null;
  devices: Record<string, DeviceEntry>;
};

const DEVICE_ID_KEY = 'ascend:deviceId';
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function sessionsDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'sessions');
}

// A simple, dependency-free random ID — this only needs to be unique
// enough to tell devices apart, not cryptographically strong.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Persisted once per install; the same value survives reloads and app restarts. */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = generateId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

// A readable label, not a precise device model — good enough to tell rows
// apart in a list ("Web browser" vs "iOS device") without adding
// expo-device as a dependency for a Settings sub-screen.
function deviceLabel(): string {
  if (Platform.OS === 'web') return 'Web browser';
  if (Platform.OS === 'ios') return 'iPhone / iPad';
  if (Platform.OS === 'android') return 'Android device';
  return 'Unknown device';
}

/**
 * Called on every app boot once a user is signed in. If this device has
 * never registered before, creates its entry. If it already has one,
 * leaves loginAt/revokedAt untouched (a plain reload must NOT look like a
 * fresh login, or a revoked device would silently un-revoke itself just by
 * being reopened) and only bumps lastSeen.
 */
export async function ensureDeviceRegistered(uid: string, deviceId: string): Promise<void> {
  const ref = sessionsDocRef(uid);
  const snap = await getDoc(ref);
  const existing = (snap.data() as Partial<SessionsDoc> | undefined)?.devices?.[deviceId];
  const now = Date.now();
  if (existing) {
    await setDoc(ref, { devices: { [deviceId]: { lastSeen: now } } }, { merge: true });
    return;
  }
  await setDoc(ref, {
    devices: {
      [deviceId]: { name: deviceLabel(), platform: Platform.OS, loginAt: now, lastSeen: now, revokedAt: null },
    },
  }, { merge: true });
}

/**
 * Called on an explicit sign-up/log-in (not on reload) — see UserContext's
 * signUp/logIn. Always stamps a fresh loginAt, which is what lets a
 * previously-revoked device become trusted again by simply logging back
 * in for real.
 */
export async function startFreshSession(uid: string, deviceId: string): Promise<void> {
  const now = Date.now();
  await setDoc(sessionsDocRef(uid), {
    devices: {
      [deviceId]: { name: deviceLabel(), platform: Platform.OS, loginAt: now, lastSeen: now, revokedAt: null },
    },
  }, { merge: true });
}

export async function touchLastSeen(uid: string, deviceId: string): Promise<void> {
  await setDoc(sessionsDocRef(uid), { devices: { [deviceId]: { lastSeen: Date.now() } } }, { merge: true }).catch(() => {});
}

export { LAST_SEEN_UPDATE_INTERVAL_MS };

/**
 * Subscribes to THIS device's own validity. Fires `onInvalidated` at most
 * once (per call) the moment either the global "log out everywhere"
 * timestamp or this specific device's revocation timestamp is newer than
 * the session this device logged in with.
 */
export function subscribeToSessionValidity(
  uid: string,
  deviceId: string,
  onInvalidated: () => void,
): () => void {
  let fired = false;
  return onSnapshot(sessionsDocRef(uid), snap => {
    if (fired) return;
    const data = snap.data() as Partial<SessionsDoc> | undefined;
    const mine = data?.devices?.[deviceId];
    if (!mine) return; // not registered yet — nothing to invalidate
    const globallyInvalidated = !!data?.invalidatedAt && data!.invalidatedAt! > mine.loginAt;
    const deviceRevoked = !!mine.revokedAt && mine.revokedAt > mine.loginAt;
    if (globallyInvalidated || deviceRevoked) {
      fired = true;
      onInvalidated();
    }
  });
}

/** "Log out of all devices" — every device (including this one) signs
 *  itself out the next time its listener fires. */
export async function invalidateAllSessions(uid: string): Promise<void> {
  await setDoc(sessionsDocRef(uid), { invalidatedAt: Date.now() }, { merge: true });
}

/** Signs out one specific device (from the Trusted Devices list) without
 *  touching any other device's session. */
export async function revokeDevice(uid: string, deviceId: string): Promise<void> {
  await setDoc(sessionsDocRef(uid), { devices: { [deviceId]: { revokedAt: Date.now() } } }, { merge: true });
}

/** Devices currently shown in the Trusted Devices list — revoked ones are
 *  filtered out client-side rather than deleted, since a deleted entry
 *  would have no revokedAt left for that device's own listener to see. */
export function activeDevices(doc: Partial<SessionsDoc> | undefined): Array<DeviceEntry & { id: string }> {
  if (!doc?.devices) return [];
  return Object.entries(doc.devices)
    .filter(([, d]) => !d.revokedAt)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
