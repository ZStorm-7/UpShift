// Firestore (Admin SDK) access. Admin bypasses security rules, which is what
// lets the usage document be read-only for clients.

import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { PREMIUM_CACHE_MS, REVENUECAT_ENTITLEMENT, type Bucket, type Tier } from './config.ts';
import { reserve, release, strike, summarize, EMPTY_USAGE, type UsageState, type Decision, type Usage } from './quota.ts';

if (getApps().length === 0) initializeApp();
export const db = getFirestore();

const usageRef = (uid: string) => db.collection('coachUsage').doc(uid);

export type Prefs = {
  consented?: boolean; consentVersion?: number; useData?: boolean; tone?: string;
  allergies?: string[]; diet?: string;
};

export async function loadPrefs(uid: string): Promise<Prefs> {
  const snap = await db.doc(`users/${uid}/coach/prefs`).get();
  return (snap.data() as Prefs) ?? {};
}

export async function loadProfile(uid: string): Promise<Record<string, any> | null> {
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as Record<string, any>) : null;
}

// Premium comes from RevenueCat's REST API, never from the client. A failed
// lookup falls back to the last known value, then to the free tier.
async function fetchPremium(uid: string, secret: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const ent = json?.subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT];
    if (!ent) return false;
    return ent.expires_date == null || Date.parse(ent.expires_date) > Date.now();
  } catch {
    return null;
  }
}

export async function resolveTier(uid: string, secret: string, now: number): Promise<{ tier: Tier; state: UsageState }> {
  const snap = await usageRef(uid).get();
  const state = { ...EMPTY_USAGE, ...(snap.data() as Partial<UsageState> | undefined) } as UsageState;
  const cached = state.premium;
  if (cached && now - cached.checkedAt < PREMIUM_CACHE_MS) {
    return { tier: cached.value ? 'premium' : 'free', state };
  }
  const fresh = await fetchPremium(uid, secret);
  const value = fresh ?? cached?.value ?? false;
  if (fresh !== null) await usageRef(uid).set({ premium: { value, checkedAt: now } }, { merge: true });
  return { tier: value ? 'premium' : 'free', state: { ...state, premium: { value, checkedAt: now } } };
}

export async function reserveUnit(uid: string, bucket: Bucket, tier: Tier, now: number): Promise<Decision> {
  return db.runTransaction(async tx => {
    const snap = await tx.get(usageRef(uid));
    const decision = reserve(snap.data() as Partial<UsageState> | undefined, bucket, tier, now);
    tx.set(usageRef(uid), decision.next, { merge: true });
    return decision;
  });
}

export async function releaseUnit(uid: string, bucket: Bucket, now: number, failed: boolean): Promise<UsageState> {
  return db.runTransaction(async tx => {
    const snap = await tx.get(usageRef(uid));
    const next = release(snap.data() as Partial<UsageState> | undefined, bucket, now, failed);
    tx.set(usageRef(uid), next, { merge: true });
    return next;
  });
}

export async function addStrike(uid: string, now: number): Promise<void> {
  await db.runTransaction(async tx => {
    const snap = await tx.get(usageRef(uid));
    tx.set(usageRef(uid), strike(snap.data() as Partial<UsageState> | undefined, now), { merge: true });
  });
}

export async function readUsage(uid: string, tier: Tier, now: number): Promise<Usage> {
  const snap = await usageRef(uid).get();
  return summarize(snap.data() as Partial<UsageState> | undefined, tier, now);
}

// ---- History tool ----
// Day documents are keyed by the USER'S local date, so shift "now" by the
// client's UTC offset (used only to pick which documents to read, never for quota).
const dayKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

export async function historyFor(uid: string, days: number, tzOffsetMin: number): Promise<Record<string, unknown>> {
  const n = Math.min(30, Math.max(1, Math.round(days) || 7));
  const keys: string[] = [];
  const localNow = Date.now() - tzOffsetMin * 60_000;
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(localNow - i * 86_400_000)));
  const refs = keys.map(k => db.doc(`users/${uid}/days/${k}`));
  const [daySnaps, stats, streak, weight] = await Promise.all([
    db.getAll(...refs),
    db.doc(`users/${uid}/meta/stats`).get(),
    db.doc(`users/${uid}/meta/streak`).get(),
    db.doc(`users/${uid}/meta/weightLog`).get(),
  ]);
  const rows = daySnaps.map((s, i) => {
    const d: any = s.data() ?? {};
    const food: any[] = d.foodLog ?? [];
    const sum = (k: string) => Math.round(food.reduce((a, f) => a + (f[k] || 0), 0));
    return {
      date: keys[i], calories: sum('calories'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'),
      waterMl: d.waterTotal || 0, sleepHours: d.sleepHours || 0, workouts: d.workoutsCompleted || 0,
      ...(d.checkin ? { mood: d.checkin.mood, soreness: d.checkin.soreness } : {}),
    };
  });
  const entries: any[] = (weight.data()?.entries ?? []).slice(-10);
  return {
    days: rows, level: stats.data()?.level ?? null,
    currentStreak: streak.data()?.currentStreak ?? 0, longestStreak: streak.data()?.longestStreak ?? 0,
    recentWeightsLbs: entries.map(e => ({ date: e.date, lbs: e.weightLbs })),
  };
}
