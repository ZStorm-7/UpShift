import { Ionicons } from '@expo/vector-icons';

// A SEPARATE layer from rank (data/ranks.ts). Rank is one long ladder tied
// to total XP — climbing it takes a long time by design (see
// firebase/progress.ts's xpRequiredForLevel comment), which is exactly right
// for "this is your long-term standing" but means the gap between rewards
// gets wider the further in you are. Achievements are the opposite shape on
// purpose: lots of small, specific, one-time moments ("your first workout",
// "you hit a 7-day streak") that don't require reaching a whole new rank
// tier to feel like something happened. The two systems never share a
// threshold — nothing here just repeats a rank's minLevel.
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementStat =
  | 'totalWorkoutsCompleted'
  | 'longestStreak'
  | 'totalFoodLogged'
  | 'weightEntriesLogged'
  | 'level';

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tier: AchievementTier;
  stat: AchievementStat;
  threshold: number;
};

export const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: '#CD7F32',
  silver: '#A8A9AD',
  gold: '#D4AF37',
  platinum: '#8FA8B8',
};

export const ACHIEVEMENTS: Achievement[] = [
  // ---- Bronze — the first time you do the thing at all ----
  { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', icon: 'barbell', tier: 'bronze', stat: 'totalWorkoutsCompleted', threshold: 1 },
  { id: 'first_food_log', name: 'First Bite', description: 'Log your first meal', icon: 'restaurant', tier: 'bronze', stat: 'totalFoodLogged', threshold: 1 },
  { id: 'first_weigh_in', name: 'On the Scale', description: 'Log your weight for the first time', icon: 'scale', tier: 'bronze', stat: 'weightEntriesLogged', threshold: 1 },
  { id: 'streak_3', name: 'Warming Up', description: 'Reach a 3-day streak', icon: 'flame', tier: 'bronze', stat: 'longestStreak', threshold: 3 },

  // ---- Silver — real, if early, consistency ----
  { id: 'workouts_10', name: 'Regular', description: 'Complete 10 workouts', icon: 'barbell', tier: 'silver', stat: 'totalWorkoutsCompleted', threshold: 10 },
  { id: 'streak_7', name: 'One Week Strong', description: 'Reach a 7-day streak', icon: 'flame', tier: 'silver', stat: 'longestStreak', threshold: 7 },
  { id: 'food_logged_50', name: 'Food Diarist', description: 'Log 50 meals', icon: 'restaurant', tier: 'silver', stat: 'totalFoodLogged', threshold: 50 },
  { id: 'weigh_ins_7', name: 'Tracking It', description: 'Log your weight 7 times', icon: 'scale', tier: 'silver', stat: 'weightEntriesLogged', threshold: 7 },
  { id: 'level_10', name: 'Leveling Up', description: 'Reach level 10', icon: 'trending-up', tier: 'silver', stat: 'level', threshold: 10 },

  // ---- Gold — the kind of consistency that changes outcomes ----
  { id: 'workouts_50', name: 'Committed', description: 'Complete 50 workouts', icon: 'barbell', tier: 'gold', stat: 'totalWorkoutsCompleted', threshold: 50 },
  { id: 'streak_30', name: 'One Month In', description: 'Reach a 30-day streak', icon: 'flame', tier: 'gold', stat: 'longestStreak', threshold: 30 },
  { id: 'food_logged_200', name: 'Meticulous', description: 'Log 200 meals', icon: 'restaurant', tier: 'gold', stat: 'totalFoodLogged', threshold: 200 },
  { id: 'level_25', name: 'Seasoned', description: 'Reach level 25', icon: 'trending-up', tier: 'gold', stat: 'level', threshold: 25 },

  // ---- Platinum — the rare ones ----
  { id: 'workouts_100', name: 'Iron Will', description: 'Complete 100 workouts', icon: 'barbell', tier: 'platinum', stat: 'totalWorkoutsCompleted', threshold: 100 },
  { id: 'streak_100', name: 'Unstoppable', description: 'Reach a 100-day streak', icon: 'flame', tier: 'platinum', stat: 'longestStreak', threshold: 100 },
  { id: 'level_50', name: 'Veteran', description: 'Reach level 50', icon: 'trending-up', tier: 'platinum', stat: 'level', threshold: 50 },
];
