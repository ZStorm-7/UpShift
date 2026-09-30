import { Alert } from 'react-native';
import { Achievement } from '../data/achievements';
import haptics from '../services/haptics';

// One shared celebration for every screen that can unlock an achievement
// (WorkoutScreen, NutritionScreen, DashboardScreen after a weigh-in or a
// streak advance) — a plain Alert rather than a bespoke animated takeover
// like LevelUpContext's. Rank-ups already own the "big, animated, one at a
// time" moment; achievements are meant to be the frequent, lightweight
// counterpart to that, so a heavier celebration here would compete with the
// thing it's supposed to feel smaller than.
export function celebrateAchievements(unlocked: Achievement[]) {
  if (unlocked.length === 0) return;
  haptics.goalMet();
  const title = unlocked.length === 1 ? '🏆 Achievement Unlocked!' : `🏆 ${unlocked.length} Achievements Unlocked!`;
  const body = unlocked.map(a => `${a.name} — ${a.description}`).join('\n');
  Alert.alert(title, body);
}
