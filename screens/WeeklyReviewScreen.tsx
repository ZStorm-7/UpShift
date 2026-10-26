// Your week in review: numbers, what went well, one thing to work on, and a goal for next week.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import { Screen, AppBar, Button, Card } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { loadDaySummaries, saveWeeklyGoal, saveReviewSeen } from '../firebase/weekly';
import { buildWeeklyReview, reviewRange, nextWeekKey, type WeeklyGoal, type Win, type Area, type WeeklyReview } from '../services/habits/weeklyReview';
import { getQuestCycleKey } from '../firebase/quests';
import { streakDocRef, cleanStreak, liveStreak } from '../firebase/streaks';
import { getDoc } from 'firebase/firestore';
import { calculateWaterGoal } from '../context/UserContext';
import haptics from '../services/haptics';
import { fillCard, weekCardVars } from '../services/share/cards';

const fmt = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), s);
const WIN_KEY: Record<Win['key'], string> = { workouts: 'wrWinWorkouts', water: 'wrWinWater', sleep: 'wrWinSleep', logging: 'wrWinLogging', calories: 'wrWinCalories', breaks: 'wrWinBreaks', streak: 'wrWinStreak', showedUp: 'wrWinShowedUp' };
const IMPROVE_KEY: Record<Area, string> = { workouts: 'wrImproveWorkouts', water: 'wrImproveWater', sleep: 'wrImproveSleep', logging: 'wrImproveLogging' };
const GOAL_KEY: Record<Area, string> = { workouts: 'wrGoalWorkouts', water: 'wrGoalWater', sleep: 'wrGoalSleep', logging: 'wrGoalLogging' };

export default function WeeklyReviewScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t, language } = useLanguage();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [weekOf, setWeekOf] = useState('');
  const [range, setRange] = useState<[string, string]>(['', '']);
  const [picked, setPicked] = useState<string | null>(null);
  const [streakNow, setStreakNow] = useState(0);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const { keys, weekOf: wk } = reviewRange(new Date());
      setWeekOf(wk); setRange([keys[0], keys[6]]);
      const days = await loadDaySummaries(authUser.uid, keys);
      let streak = 0;
      try { streak = liveStreak(cleanStreak((await getDoc(streakDocRef(authUser.uid))).data()), getQuestCycleKey()); } catch { /* no streak */ }
      const goals = { calories: profile?.calorieGoal || 2000, water: profile?.waterGoalMl || calculateWaterGoal(profile?.age ?? 30), sleep: 8 };
      setStreakNow(streak);
      setReview(buildWeeklyReview(days, goals, streak));
      saveReviewSeen(authUser.uid, wk).catch(() => {});
    })();
  }, [authUser?.uid]);

  const fmtDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); try { return new Date(y, m - 1, d).toLocaleDateString(language === 'zh' ? 'zh-CN' : language, { month: 'short', day: 'numeric' }); } catch { return k; } };
  const goalText = (g: WeeklyGoal) => fmt(t(GOAL_KEY[g.area] as any), { n: g.target });

  async function pick(g: WeeklyGoal) {
    if (!authUser) return;
    setPicked(g.id); haptics.setComplete();
    await saveWeeklyGoal(authUser.uid, nextWeekKey(weekOf), g).catch(() => {});
  }

  async function shareWeek() {
    if (!review) return;
    haptics.selection();
    try { await Share.share({ message: fillCard(t('shWeek'), weekCardVars(review, streakNow)) }); } catch { /* dismissed */ }
  }

  const stats = review?.stats;
  const tiles = useMemo(() => stats ? [
    { label: t('wrStatWorkouts'), value: String(stats.workouts) },
    { label: t('wrStatWater'), value: `${stats.waterDays}/7` },
    { label: t('wrStatSleep'), value: stats.sleepAvg ? String(stats.sleepAvg) : '–' },
    { label: t('wrStatFood'), value: `${stats.loggedDays}/7` },
  ] : [], [stats, t]);

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppBar title={t('wrTitle')} subtitle={range[0] ? `${fmtDay(range[0])} – ${fmtDay(range[1])}` : undefined} onBack={() => navigation.goBack()} />
      {review && (
        <>
          <View style={styles.tiles}>
            {tiles.map(x => (
              <View key={x.label} style={[styles.tile, { backgroundColor: palette.surface, borderColor: palette.border }]} accessible accessibilityLabel={`${x.label}: ${x.value}`}>
                <Text style={[styles.tileValue, { color: palette.textPrimary }]}>{x.value}</Text>
                <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{x.label}</Text>
              </View>
            ))}
          </View>

          <Card style={{ gap: spacing.sm }}>
            <Text style={[styles.head, { color: palette.textMuted }]}>{t('wrWins').toUpperCase()}</Text>
            {review.wins.length === 0
              ? <Text style={[styles.body, { color: palette.textSecondary }]}>{t('wrNoWins')}</Text>
              : review.wins.map(w => <Text key={w.key} style={[styles.body, { color: palette.textPrimary }]}>✓ {fmt(t(WIN_KEY[w.key] as any), { n: w.n })}</Text>)}
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={[styles.head, { color: palette.textMuted }]}>{t('wrImprove').toUpperCase()}</Text>
            <Text style={[styles.body, { color: palette.textPrimary }]}>{t(IMPROVE_KEY[review.improve] as any)}</Text>
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={[styles.head, { color: palette.textMuted }]}>{t('wrPickGoal').toUpperCase()}</Text>
            {review.goals.map(g => {
              const on = picked === g.id;
              return (
                <Pressable key={g.id} onPress={() => pick(g)} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} aria-checked={on} accessibilityLabel={goalText(g)}
                  style={[styles.goal, { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accentSoft : 'transparent' }]}>
                  <Text style={[styles.goalText, { color: palette.textPrimary }]}>{goalText(g)}</Text>
                  {on && <Text style={{ color: palette.accent, fontFamily: fontFamily.sansBold }}>✓</Text>}
                </Pressable>
              );
            })}
            {picked && <Text style={[styles.body, { color: palette.textSecondary }]} accessibilityLiveRegion="polite">{t('wrGoalSet')}</Text>}
          </Card>
          <Button label={t('shWeekButton')} variant="secondary" onPress={shareWeek} />
          <Button label={t('back')} variant="ghost" onPress={() => navigation.goBack()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.lg, borderWidth: layout.hairline, padding: spacing.md, gap: 2 },
  tileValue: { fontFamily: fontFamily.sansBlack, fontSize: 28 },
  tileLabel: { fontFamily: fontFamily.sans, fontSize: 12 },
  head: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 21 },
  goal: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalText: { fontFamily: fontFamily.sansBold, fontSize: 15, flex: 1 },
});
