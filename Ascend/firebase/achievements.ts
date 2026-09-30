import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from './config';
import { ACHIEVEMENTS, Achievement, AchievementStat } from '../data/achievements';
import { statsDocRef } from './progress';
import { streakDocRef, StreakState } from './streaks';
import { weightLogDocRef } from './weight';

export function achievementsDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'achievements');
}

export type UnlockedAchievements = {
  // achievement id -> ISO timestamp it was unlocked at. A plain map (not an
  // array) so re-checking an already-unlocked achievement is an O(1) lookup
  // instead of an array scan, and so the write is a single merged field
  // rather than replacing the whole document.
  unlocked: Record<string, string>;
};

export async function loadUnlockedAchievements(uid: string): Promise<Record<string, string>> {
  const snap = await getDoc(achievementsDocRef(uid));
  return snap.exists() ? (snap.data() as UnlockedAchievements).unlocked || {} : {};
}

/** Compares the account's current stats against every achievement's
 * threshold, unlocks any newly-met ones, and returns just the newly-unlocked
 * list (empty if nothing new) so the caller can show a celebration for
 * exactly those and nothing already-seen. Never re-locks anything — an
 * achievement earned once stays earned even if the underlying stat could
 * theoretically go back down (it can't, for any of the stats these check,
 * but the one-way rule is deliberate: an achievement is a record of having
 * done something, not a live status). */
export async function checkAchievements(
  uid: string,
  stats: Record<AchievementStat, number>
): Promise<Achievement[]> {
  // A transaction, not a plain read-then-write, because this runs from
  // several independent screens (finishing a workout, logging food, logging
  // weight, a streak advancing) and two of those can genuinely land within
  // milliseconds of each other — e.g. the Dashboard's streak-advance effect
  // and its own daily-weight submit both fire from the same visit. A plain
  // getDoc-then-setDoc lets both calls read the SAME "not yet unlocked"
  // snapshot before either write lands, so both compute the same
  // newly-unlocked achievement and both show a celebration for it — the
  // "unlocking incorrectly" duplicate-popup bug. Firestore transactions
  // serialize on the document, so the second call's tx.get always sees the
  // first call's write and correctly finds nothing new left to unlock.
  const ref = achievementsDocRef(uid);
  const newlyUnlocked: Achievement[] = [];
  const now = new Date().toISOString();

  await runTransaction(db, async tx => {
    newlyUnlocked.length = 0; // reset in case Firestore retries the transaction
    const snap = await tx.get(ref);
    const alreadyUnlocked = snap.exists() ? ((snap.data() as UnlockedAchievements).unlocked || {}) : {};
    const updates: Record<string, string> = {};

    for (const achievement of ACHIEVEMENTS) {
      if (alreadyUnlocked[achievement.id]) continue;
      const value = stats[achievement.stat] ?? 0;
      if (value >= achievement.threshold) {
        newlyUnlocked.push(achievement);
        updates[`unlocked.${achievement.id}`] = now;
      }
    }

    if (newlyUnlocked.length > 0) {
      tx.set(ref, updates, { merge: true });
    }
  });

  return newlyUnlocked;
}

/** Reads every stat an achievement could possibly check and runs
 * checkAchievements against a fully-current snapshot, in one call. Meant to
 * be called from wherever a stat that FEEDS an achievement just changed
 * (finishing a workout, logging food, logging weight, a streak advancing) —
 * a few extra reads on an infrequent user action is a fair trade for never
 * having each call site hand-assemble a partial, possibly-stale stats
 * object and risk a threshold silently never firing because one field was
 * missing from it. */
export async function checkAchievementsForUser(uid: string): Promise<Achievement[]> {
  const [statsSnap, streakSnap, weightSnap] = await Promise.all([
    getDoc(statsDocRef(uid)),
    getDoc(streakDocRef(uid)),
    getDoc(weightLogDocRef(uid)),
  ]);
  const statsData = statsSnap.exists() ? statsSnap.data() : {};
  const streakData = streakSnap.exists() ? (streakSnap.data() as StreakState) : undefined;
  const weightEntries = weightSnap.exists() ? (weightSnap.data().entries || []) : [];

  return checkAchievements(uid, {
    totalWorkoutsCompleted: statsData.totalWorkoutsCompleted || 0,
    totalFoodLogged: statsData.totalFoodLogged || 0,
    longestStreak: streakData?.longestStreak || 0,
    weightEntriesLogged: weightEntries.length,
    // Read from the same stats doc as the others rather than trusting a
    // caller-supplied value — DashboardScreen's own `level` state can be
    // stale by exactly the amount of XP the action that triggered this
    // check just awarded, if this runs before that screen's next reload.
    level: statsData.level || 1,
  });
}
