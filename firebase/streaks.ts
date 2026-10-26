import { doc } from 'firebase/firestore';
import { db } from './config';

// Several quests in the pool talk about streaks ("Keep a 3-day quest streak
// alive", "Complete all 3 daily quests 3 days in a row"), so the app needs
// to actually track them. A streak advances by one each quest-cycle in which
// the user finishes every quest they were given. The rules, including streak
// freezes, are in services/habits/streakLogic.ts so they can be tested alone.
export {
  type StreakState, EMPTY_STREAK, MAX_FREEZES, cleanStreak, advanceStreak, liveStreak, daysToNextFreeze, recentlyFrozen,
} from '../services/habits/streakLogic';

export function streakDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'streak');
}
