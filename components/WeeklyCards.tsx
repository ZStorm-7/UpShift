// Dashboard cards for the weekly review: an invitation on Sunday and Monday, and the goal picked last time.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { minimalColors as c, minimalSpacing as spacing, minimalRadius as radius } from '../theme/minimal';
import { fontFamily } from '../theme/fonts';
import { useLanguage } from '../i18n/LanguageContext';
import { useUser, calculateWaterGoal } from '../context/UserContext';
import { loadReviewSeen, loadWeeklyGoal, loadDaySummaries } from '../firebase/weekly';
import { goalProgress, isReviewDay, reviewRange, weekKey, type WeeklyGoal } from '../services/habits/weeklyReview';

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), s);
const GOAL_KEY = { workouts: 'wrGoalWorkouts', water: 'wrGoalWater', sleep: 'wrGoalSleep', logging: 'wrGoalLogging' } as const;

export default function WeeklyCards({ navigation, refreshKey }: { navigation: any; refreshKey?: unknown }) {
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [invite, setInvite] = useState(false);
  const [goal, setGoal] = useState<{ goal: WeeklyGoal; value: number; done: boolean } | null>(null);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    (async () => {
      const now = new Date();
      const [seen, g] = await Promise.all([loadReviewSeen(authUser.uid).catch(() => ''), loadWeeklyGoal(authUser.uid).catch(() => null)]);
      if (!alive) return;
      setInvite(isReviewDay(now) && seen !== reviewRange(now).weekOf);
      const thisWeek = weekKey(keyOf(now));
      if (g && g.weekKey === thisWeek) {
        const days: string[] = [];
        for (let d = new Date(`${thisWeek}T12:00:00`); keyOf(d) <= keyOf(now) && days.length < 7; d.setDate(d.getDate() + 1)) days.push(keyOf(d));
        const sums = await loadDaySummaries(authUser.uid, days).catch(() => []);
        const p = goalProgress(g.goal, sums, { calories: profile?.calorieGoal || 2000, water: profile?.waterGoalMl || calculateWaterGoal(profile?.age ?? 30), sleep: 8 });
        if (alive) setGoal({ goal: g.goal, value: p.value, done: p.done });
      } else setGoal(null);
    })();
    return () => { alive = false; };
  }, [authUser?.uid, refreshKey]);

  if (!invite && !goal) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {invite && (
        <Pressable onPress={() => navigation.navigate('WeeklyReview')} accessibilityRole="button" accessibilityLabel={`${t('wrBanner')}. ${t('wrOpen')}`} style={styles.card}>
          <Text style={styles.title}>{t('wrBanner')}</Text>
          <Text style={styles.link}>{t('wrOpen')} ›</Text>
        </Pressable>
      )}
      {goal && (
        <View style={styles.card} accessible accessibilityLabel={`${t('wrYourGoal')}: ${fmt(t(GOAL_KEY[goal.goal.area]), { n: goal.goal.target })}. ${goal.done ? t('wrGoalDone') : fmt(t('wrGoalProgress'), { v: goal.value, t: goal.goal.target })}`}>
          <Text style={styles.kicker}>{t('wrYourGoal').toUpperCase()}</Text>
          <Text style={styles.title}>{fmt(t(GOAL_KEY[goal.goal.area]), { n: goal.goal.target })}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, (goal.value / goal.goal.target) * 100)}%` }]} /></View>
          <Text style={styles.meta}>{goal.done ? t('wrGoalDone') : fmt(t('wrGoalProgress'), { v: goal.value, t: goal.goal.target })}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  kicker: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8, color: c.textMuted },
  title: { fontFamily: fontFamily.sansBold, fontSize: 16, color: c.ink },
  link: { fontFamily: fontFamily.sansBold, fontSize: 13, color: c.green },
  track: { height: 6, borderRadius: 3, backgroundColor: c.surfaceSunken, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', backgroundColor: c.greenFill, borderRadius: 3 },
  meta: { fontFamily: fontFamily.sans, fontSize: 12, color: c.textSecondary },
});
