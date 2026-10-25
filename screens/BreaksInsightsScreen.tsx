// Weekly mindful-break insights.
//
// One series (breaks completed per day), so there is no legend: the title says
// what is plotted. Bars follow the chart rules: thin (<=24px), a 4px rounded top
// and a square base on one baseline, hairline recessive gridlines, value labels
// only where they help (the tallest day and today), text in text tokens (never
// the data colour), a press-for-detail tooltip, and a table view of the same data.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useLanguage } from '../i18n/LanguageContext';
import { useUser } from '../context/UserContext';
import { loadWeek } from '../services/breaks/statsStore';
import { INTENT_IDS, IntentId, WeekSummary } from '../services/breaks/stats';
import { weekdayLabel, percentLabel, timeLabel } from '../services/breaks/format';
import { useBreak } from '../context/BreakContext';
import { FRAMES, unlockedFrames, nextFrame } from '../services/breaks/rewards';

const CHART_H = 148;
const BAR_MAX_W = 24;
const INTENT_KEY: Record<IntentId, string> = {
  specific: 'intentSpecific', connect: 'intentConnect', unwind: 'intentUnwind', unsure: 'intentUnsure',
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// Round the axis maximum to a clean number so the one gridline label is readable.
export function niceMax(v: number): number {
  if (v <= 4) return 4;
  if (v <= 8) return 8;
  return Math.ceil(v / 5) * 5;
}

export default function BreaksInsightsScreen({ navigation }: any) {
  const p = usePalette();
  const { t, language } = useLanguage();
  const { authUser } = useUser();
  const { longestBreakStreak } = useBreak();
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!authUser) return;
    loadWeek(authUser.uid).then(setWeek).catch(() => setFailed(true));
  }, [authUser]);

  const max = useMemo(() => niceMax(Math.max(0, ...(week?.days.map(d => d.done) ?? [0]))), [week]);
  const peak = week ? Math.max(...week.days.map(d => d.done)) : 0;
  const chartSummary = week
    ? week.days.map(d => `${weekdayLabel(d.weekday, language)} ${d.done}`).join(', ')
    : '';

  const tile = (value: string, label: string) => (
    <View style={[styles.tile, { backgroundColor: p.surface, borderColor: p.border }]} key={label} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.tileValue, { color: p.textPrimary }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: p.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={[styles.back, { color: p.textPrimary }]}>‹</Text>
          </Pressable>
          <Text style={[styles.title, { color: p.textPrimary }]} accessibilityRole="header">{t('insTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {!week && !failed && <ActivityIndicator color={p.accent} style={{ marginTop: spacing.xxxl }} />}
        {failed && <Text style={[styles.note, { color: p.textMuted }]}>{t('coachErrGeneric')}</Text>}

        {week && (
          <>
            {/* The one hero figure on the screen. */}
            <View style={styles.hero}>
              <Text style={[styles.heroValue, { color: p.textPrimary }]} accessibilityRole="header">{week.total}</Text>
              <Text style={[styles.heroLabel, { color: p.textSecondary }]}>{t('insBreaks')}</Text>
            </View>

            {week.total === 0 ? (
              <Text style={[styles.note, { color: p.textMuted, textAlign: 'center' }]}>{t('insNone')}</Text>
            ) : (
              <View style={styles.tiles}>
                {tile(String(week.streak), t('insStreak'))}
                {week.exitRate !== null && tile(percentLabel(week.exitRate), t('insExitRate'))}
                {week.passes > 0 && tile(String(week.passes), t('insPasses'))}
                {week.strict > 0 && tile(String(week.strict), t('insStrict'))}
                {week.moodAvg !== null && tile(`${['😞', '🙁', '😐', '🙂', '😄'][Math.min(4, Math.max(0, Math.round(week.moodAvg) - 1))]} ${week.moodAvg.toFixed(1)}`, t('insMood'))}
              </View>
            )}

            {/* Chart / table */}
            <View style={styles.rowBetween}>
              <Text style={[styles.caption, { color: p.textSecondary }]}>{t('insCaption')}</Text>
              <View style={[styles.seg, { borderColor: p.border }]}>
                {(['chart', 'table'] as const).map(v => (
                  <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: view === v }}
                    onPress={() => setView(v)} style={[styles.segBtn, view === v && { backgroundColor: p.accentSoft }]}>
                    <Text style={[styles.segText, { color: p.textPrimary }]}>{v === 'chart' ? t('insViewChart') : t('insViewTable')}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {view === 'chart' ? (
              <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}
                accessible accessibilityLabel={`${t('insCaption')}: ${chartSummary}`}>
                <View style={{ height: CHART_H + 28 }}>
                  {/* hairline gridlines: the axis maximum, half, and the baseline */}
                  {[1, 0.5, 0].map(f => (
                    <View key={f} style={[styles.grid, { bottom: 28 + f * CHART_H, borderColor: p.divider }]}>
                      {f > 0 && <Text style={[styles.tick, { color: p.textMuted }]}>{Math.round(max * f)}</Text>}
                    </View>
                  ))}
                  <View style={styles.bars}>
                    {week.days.map((d, i) => {
                      const h = d.done === 0 ? 0 : Math.max(4, (d.done / max) * CHART_H);
                      const isToday = i === week.days.length - 1;
                      const showValue = d.done > 0 && (d.done === peak || isToday || picked === i);
                      return (
                        <Pressable key={d.key} style={styles.col} onPress={() => setPicked(picked === i ? null : i)}
                          accessibilityRole="button" accessibilityLabel={`${weekdayLabel(d.weekday, language, 'long')}: ${d.done}`}>
                          <View style={{ height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {showValue && <Text style={[styles.barValue, { color: p.textPrimary }]}>{d.done}</Text>}
                            {/* 4px rounded data-end, square at the baseline */}
                            <View style={{
                              width: BAR_MAX_W, height: h, backgroundColor: p.accent, opacity: picked === null || picked === i ? 1 : 0.45,
                              borderTopLeftRadius: 4, borderTopRightRadius: 4,
                            }} />
                          </View>
                          <Text style={[styles.axis, { color: isToday ? p.textPrimary : p.textMuted }]}>
                            {weekdayLabel(d.weekday, language, 'narrow')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {picked !== null && (
                  <View style={[styles.tooltip, { backgroundColor: p.surfaceRaised, borderColor: p.borderStrong }]} accessibilityLiveRegion="polite">
                    <Text style={[styles.tipText, { color: p.textPrimary }]}>
                      {weekdayLabel(week.days[picked].weekday, language, 'long')} · {week.days[picked].done}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
                <View style={styles.tableRow}>
                  <Text style={[styles.th, { color: p.textMuted }]}>{t('insDayCol')}</Text>
                  <Text style={[styles.th, { color: p.textMuted, textAlign: 'right' }]}>{t('insBreaksCol')}</Text>
                </View>
                {week.days.map((d, i) => (
                  <View key={d.key} style={[styles.tableRow, { borderTopColor: p.divider, borderTopWidth: 1 }]}>
                    <Text style={[styles.td, { color: p.textPrimary }]}>
                      {weekdayLabel(d.weekday, language, 'long')}{i === week.days.length - 1 ? ` · ${t('insToday')}` : ''}
                    </Text>
                    <Text style={[styles.td, { color: p.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{d.done}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Why people opened apps: horizontal bars, value at the tip */}
            {Object.keys(week.intents).length > 0 && (
              <>
                <Text style={[styles.section, { color: p.textMuted }]}>{t('insIntents').toUpperCase()}</Text>
                <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border, gap: spacing.md }]}>
                  {INTENT_IDS.filter(id => week.intents[id]).sort((a, b) => (week.intents[b] ?? 0) - (week.intents[a] ?? 0)).map(id => {
                    const v = week.intents[id] ?? 0;
                    const top = Math.max(...Object.values(week.intents).map(Number));
                    return (
                      <View key={id} accessible accessibilityLabel={`${t(INTENT_KEY[id])}: ${v}`}>
                        <Text style={[styles.intentLabel, { color: p.textSecondary }]}>{t(INTENT_KEY[id])}</Text>
                        <View style={styles.hRow}>
                          <View style={{ width: `${Math.max(4, (v / top) * 82)}%`, height: 14, backgroundColor: p.accent, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
                          <Text style={[styles.hValue, { color: p.textPrimary }]}>{v}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {week.peakHour !== null && (
              <Text style={[styles.note, { color: p.textMuted }]}>
                {fill(t('insPeakHour'), { time: timeLabel(week.peakHour * 60, language) })}
              </Text>
            )}

            {/* Rewards: capped XP, and frames that unlock with your longest streak. */}
            <Text style={[styles.section, { color: p.textMuted }]}>{t('rewardsTitle').toUpperCase()}</Text>
            <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border, gap: spacing.sm }]}>
              <Text style={[styles.note, { color: p.textSecondary }]}>{t('rewardsXpNote')}</Text>
              {FRAMES.map(f => {
                const got = unlockedFrames(longestBreakStreak).some(x => x.id === f.id);
                return (
                  <View key={f.id} style={styles.frameRow} accessible accessibilityLabel={`${t(f.nameKey)}: ${got ? t('rewardsUnlocked') : `${f.days}`}`}>
                    <View style={[styles.frameDot, { borderColor: f.color, opacity: got ? 1 : 0.35 }]} />
                    <Text style={[styles.frameName, { color: got ? p.textPrimary : p.textMuted }]}>{t(f.nameKey)}</Text>
                    <Text style={[styles.note, { color: got ? p.success : p.textMuted }]}>{got ? `✓ ${t('rewardsUnlocked')}` : `${f.days} ${t('insStreak')}`}</Text>
                  </View>
                );
              })}
              {(() => {
                const next = nextFrame(longestBreakStreak);
                return (
                  <Text style={[styles.note, { color: p.textMuted }]}>
                    {next ? fill(t('rewardsDaysLeft'), { n: next.daysLeft, name: t(next.nameKey) }) : t('rewardsAllUnlocked')}
                  </Text>
                );
              })()}
              <Text style={[styles.note, { color: p.textMuted }]}>{t('rewardsFramesNote')}</Text>
            </View>

            {week.busiest && (
              <Text style={[styles.note, { color: p.textMuted }]}>
                {t('insBusiest')}: {weekdayLabel(week.days.find(d => d.key === week.busiest!.key)!.weekday, language, 'long')} · {week.busiest.done}
              </Text>
            )}
            <Text style={[styles.note, { color: p.textMuted }]}>{fill(t('breaksIntentHint'), {})}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.screenPadding, paddingBottom: 56, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 34, lineHeight: 36, width: 24 },
  title: { fontFamily: fontFamily.serif, fontSize: 24 },
  // Hero figure: >=48px, sans, proportional figures (no tabular-nums at this size).
  hero: { alignItems: 'center', marginTop: spacing.md },
  heroValue: { fontFamily: fontFamily.sansBlack, fontSize: 64, lineHeight: 70 },
  heroLabel: { fontFamily: fontFamily.sans, fontSize: 15 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  tileValue: { fontFamily: fontFamily.sansBlack, fontSize: 26 },
  tileLabel: { fontFamily: fontFamily.sans, fontSize: 13, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  caption: { fontFamily: fontFamily.sans, fontSize: 13, flex: 1 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.pill, overflow: 'hidden' },
  segBtn: { paddingVertical: 6, paddingHorizontal: spacing.md },
  segText: { fontFamily: fontFamily.sansSemi, fontSize: 12 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  grid: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  tick: { position: 'absolute', right: 0, top: -16, fontFamily: fontFamily.sans, fontSize: 11 },
  bars: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 22 },
  col: { flex: 1, alignItems: 'center' },
  barValue: { fontFamily: fontFamily.sansBold, fontSize: 12, marginBottom: 4 },
  axis: { fontFamily: fontFamily.sansSemi, fontSize: 12, marginTop: 8, height: 20 },
  tooltip: { alignSelf: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  tipText: { fontFamily: fontFamily.sansSemi, fontSize: 13 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  th: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8, flex: 1 },
  td: { fontFamily: fontFamily.sans, fontSize: 15, flex: 1 },
  section: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.2, marginTop: spacing.md },
  intentLabel: { fontFamily: fontFamily.sans, fontSize: 13, marginBottom: 4 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hValue: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  frameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  frameDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  frameName: { fontFamily: fontFamily.sansSemi, fontSize: 14, flex: 1 },
  note: { fontFamily: fontFamily.sans, fontSize: 12.5, lineHeight: 18 },
});
