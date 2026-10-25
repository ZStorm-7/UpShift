// Mindful breaks settings: when a break happens, which apps count, what a
// break pauses, and the permissions each platform needs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Switch, TextInput, Modal, AppState, ActivityIndicator, Platform,
} from 'react-native';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useLanguage } from '../i18n/LanguageContext';
import { useBreak } from '../context/BreakContext';
import haptics from '../services/haptics';
import {
  INTERVAL_CHOICES, DEFAULT_INTERVAL_MIN, MIN_INTERVAL_MIN, MAX_INTERVAL_MIN,
} from '../services/breaks/settings';
import {
  capability, getPermissions, getInstalledApps, requestScreenTimeAccess, openUsageAccessSettings,
  openOverlaySettings, openBatterySettings, getIosPickerComponent, iosHasSelection, IOS_SELECTION_ID, InstalledApp,
} from '../services/breaks/native';

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export default function BreaksSettingsScreen({ navigation }: any) {
  const palette = usePalette();
  const { t } = useLanguage();
  const { settings, updateSettings, androidPackages, setAndroidPackages, startBreak } = useBreak();
  const cap = capability();

  const [perms, setPerms] = useState(getPermissions());
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iosCount, setIosCount] = useState<number | null>(null);

  // Permissions are granted on a system screen, so re-check when the user comes back.
  const refreshPerms = useCallback(() => setPerms(getPermissions()), []);
  useEffect(() => {
    refreshPerms();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refreshPerms(); });
    return () => sub.remove();
  }, [refreshPerms]);

  useEffect(() => {
    if (cap !== 'android') return;
    setAppsLoading(true);
    getInstalledApps().then(setApps).finally(() => setAppsLoading(false));
  }, [cap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? apps.filter(a => a.label.toLowerCase().includes(q)) : apps;
  }, [apps, query]);

  const hasApps = cap === 'android' ? androidPackages.length > 0 : cap === 'ios' ? iosHasSelection() || (iosCount ?? 0) > 0 : false;
  const setupDone = cap === 'none' ? settings.includeUpShift : perms.ready && (hasApps || settings.includeUpShift);
  const statusLabel = settings.enabled && setupDone ? t('breaksStatusOn') : t('breaksStatusSetup');

  function togglePackage(pkg: string) {
    haptics.selection();
    setAndroidPackages(androidPackages.includes(pkg) ? androidPackages.filter(p => p !== pkg) : [...androidPackages, pkg]);
  }

  function step(delta: number) {
    haptics.selection();
    updateSettings({ intervalMin: Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, settings.intervalMin + delta)) });
  }

  const Picker = cap === 'ios' ? getIosPickerComponent() : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={[styles.back, { color: palette.textPrimary }]}>‹</Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.textPrimary }]} accessibilityRole="header">{t('breaksTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={[styles.intro, { color: palette.textSecondary }]}>{t('breaksIntro')}</Text>

        {/* Master switch */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>{t('breaksToggle')}</Text>
              <Text style={[styles.badge, { color: settings.enabled && setupDone ? palette.success : palette.warning }]}>{statusLabel}</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={v => { haptics.selection(); updateSettings({ enabled: v }); }}
              trackColor={{ true: palette.accent, false: palette.borderStrong }}
              accessibilityLabel={t('breaksToggle')}
            />
          </View>
        </View>

        {cap === 'none' && (
          <Text style={[styles.note, { color: palette.textMuted }]}>{t('breaksUnavailable')}</Text>
        )}

        {/* Interval */}
        <Text style={[styles.section, { color: palette.textMuted }]}>{t('breaksEvery').toUpperCase()}</Text>
        <View style={styles.chips}>
          {INTERVAL_CHOICES.map(n => {
            const on = settings.intervalMin === n;
            return (
              <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: on }}
                onPress={() => { haptics.selection(); updateSettings({ intervalMin: n }); }}
                style={[styles.chip, { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accentSoft : 'transparent' }]}>
                <Text style={[styles.chipText, { color: palette.textPrimary }]}>
                  {fill(t('breaksMinutes'), { n })}{n === DEFAULT_INTERVAL_MIN ? ` · ${t('breaksDefault')}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.stepper, { borderColor: palette.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="-5" onPress={() => step(-5)} style={styles.stepBtn}>
            <Text style={[styles.stepGlyph, { color: palette.textPrimary }]}>−</Text>
          </Pressable>
          <Text style={[styles.stepLabel, { color: palette.textPrimary }]}>{fill(t('breaksCustom'), { n: settings.intervalMin })}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="+5" onPress={() => step(5)} style={styles.stepBtn}>
            <Text style={[styles.stepGlyph, { color: palette.textPrimary }]}>+</Text>
          </Pressable>
        </View>

        {/* Apps */}
        <Text style={[styles.section, { color: palette.textMuted }]}>{t('breaksApps').toUpperCase()}</Text>
        <Text style={[styles.note, { color: palette.textMuted }]}>{t('breaksAppsHint')}</Text>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>{t('breaksIncludeUpShift')}</Text>
            <Switch value={settings.includeUpShift}
              onValueChange={v => { haptics.selection(); updateSettings({ includeUpShift: v }); }}
              trackColor={{ true: palette.accent, false: palette.borderStrong }} />
          </View>
        </View>

        {cap === 'android' && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, paddingVertical: spacing.sm }]}>
            <TextInput value={query} onChangeText={setQuery} placeholder={t('breaksSearch')} placeholderTextColor={palette.textMuted}
              autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('breaksSearch')}
              style={[styles.search, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }]} />
            <Text style={[styles.note, { color: palette.textMuted, marginVertical: spacing.sm }]}>
              {fill(t('breaksSelectedCount'), { n: androidPackages.length })}
            </Text>
            {appsLoading ? <ActivityIndicator color={palette.accent} style={{ margin: spacing.lg }} />
              : filtered.length === 0 ? <Text style={[styles.note, { color: palette.textMuted }]}>{t('breaksNoApps')}</Text>
              : filtered.map(a => (
                <View key={a.packageName} style={styles.appRow}>
                  <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]} numberOfLines={1}>{a.label}</Text>
                  <Switch value={androidPackages.includes(a.packageName)} onValueChange={() => togglePackage(a.packageName)}
                    trackColor={{ true: palette.accent, false: palette.borderStrong }} accessibilityLabel={a.label} />
                </View>))}
          </View>
        )}

        {cap === 'ios' && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Pressable accessibilityRole="button" disabled={perms.screenTime !== 'approved'} onPress={() => setPickerOpen(true)}
              style={[styles.btn, { backgroundColor: palette.accent, opacity: perms.screenTime === 'approved' ? 1 : 0.45 }]}>
              <Text style={[styles.btnText, { color: palette.textOnAccent }]}>
                {t('breaksIosChoose')}{iosCount != null ? ` · ${fill(t('breaksSelectedCount'), { n: iosCount })}` : ''}
              </Text>
            </Pressable>
            <Text style={[styles.note, { color: palette.textMuted, marginTop: spacing.sm }]}>{t('breaksIosHint')}</Text>
          </View>
        )}

        {/* What a break pauses */}
        <Text style={[styles.section, { color: palette.textMuted }]}>{t('breaksPauses').toUpperCase()}</Text>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {([
            ['pauseWorkout', 'breaksPauseWorkout'], ['pauseAudio', 'breaksPauseAudio'], ['pauseQuestClock', 'breaksPauseQuest'],
          ] as const).map(([key, label]) => (
            <View key={key} style={styles.appRow}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary, flex: 1 }]}>{t(label)}</Text>
              <Switch value={settings[key]} onValueChange={v => { haptics.selection(); updateSettings({ [key]: v }); }}
                trackColor={{ true: palette.accent, false: palette.borderStrong }} accessibilityLabel={t(label)} />
            </View>))}
          <Text style={[styles.note, { color: palette.textMuted, marginTop: spacing.xs }]}>{t('breaksPauseQuestHint')}</Text>
        </View>

        {/* Permissions */}
        {cap !== 'none' && (
          <>
            <Text style={[styles.section, { color: palette.textMuted }]}>{t('breaksPermissions').toUpperCase()}</Text>
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              {cap === 'android' && (
                <>
                  <PermRow palette={palette} t={t} title={t('breaksPermUsage')} why={t('breaksPermUsageWhy')} granted={perms.usageAccess}
                    onGrant={() => setDisclosureOpen(true)} />
                  <PermRow palette={palette} t={t} title={t('breaksPermOverlay')} why={t('breaksPermOverlayWhy')} granted={perms.overlay}
                    onGrant={() => openOverlaySettings()} />
                  <PermRow palette={palette} t={t} title={t('breaksPermBattery')} why={t('breaksPermBatteryWhy')} granted={false}
                    onGrant={() => openBatterySettings()} optional />
                </>
              )}
              {cap === 'ios' && (
                <PermRow palette={palette} t={t} title={t('breaksPermScreenTime')} why={t('breaksPermScreenTimeWhy')}
                  granted={perms.screenTime === 'approved'}
                  onGrant={async () => { await requestScreenTimeAccess(); refreshPerms(); }} />
              )}
            </View>
            <Text style={[styles.note, { color: palette.textMuted }]}>{Platform.OS === 'ios' ? t('breaksNoteIos') : t('breaksNoteAndroid')}</Text>
          </>
        )}

        <Pressable accessibilityRole="button" onPress={() => startBreak({ source: 'in-app' })}
          style={[styles.btn, { borderWidth: 1, borderColor: palette.accent, marginTop: spacing.xl }]}>
          <Text style={[styles.btnText, { color: palette.textPrimary }]}>{t('breaksTryNow')}</Text>
        </Pressable>
      </ScrollView>

      {/* Prominent disclosure: shown BEFORE the system Usage Access screen (Google Play requirement). */}
      <Modal visible={disclosureOpen} transparent animationType="fade" onRequestClose={() => setDisclosureOpen(false)}>
        <View style={[styles.scrim, { backgroundColor: palette.scrim }]}>
          <View style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}>
            <Text style={[styles.dialogTitle, { color: palette.textPrimary }]} accessibilityRole="header">{t('breaksDisclosureTitle')}</Text>
            <Text style={[styles.dialogBody, { color: palette.textSecondary }]}>{t('breaksDisclosureBody')}</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setDisclosureOpen(false)} style={styles.dialogBtn}>
                <Text style={{ color: palette.textSecondary, fontFamily: fontFamily.sansSemi }}>{t('coachCancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setDisclosureOpen(false); openUsageAccessSettings(); }}
                style={[styles.dialogBtn, { backgroundColor: palette.accent }]}>
                <Text style={{ color: palette.textOnAccent, fontFamily: fontFamily.sansBold }}>{t('breaksContinue')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS: Apple's own app picker. */}
      {Picker && (
        <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <Picker
            style={{ flex: 1 }}
            familyActivitySelectionId={IOS_SELECTION_ID}
            includeEntireCategory
            onSelectionChange={(e: any) => {
              const m = e.nativeEvent ?? {};
              setIosCount((m.applicationCount ?? 0) + (m.categoryCount ?? 0));
            }}
            onDismissRequest={() => { setPickerOpen(false); updateSettings({}); }}
          />
        </Modal>
      )}
    </Screen>
  );
}

function PermRow({ palette, t, title, why, granted, onGrant, optional }: any) {
  return (
    <View style={styles.permRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>{title}{optional ? '' : ''}</Text>
        <Text style={[styles.note, { color: palette.textMuted }]}>{why}</Text>
      </View>
      {granted ? (
        <Text style={[styles.badge, { color: palette.success }]}>✓ {t('breaksGranted')}</Text>
      ) : (
        <Pressable accessibilityRole="button" onPress={onGrant} style={[styles.grant, { borderColor: palette.accent }]}>
          <Text style={[styles.chipText, { color: palette.textPrimary }]}>{t('breaksGrant')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.screenPadding, paddingBottom: 56, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 34, lineHeight: 36, width: 24 },
  title: { fontFamily: fontFamily.serif, fontSize: 24 },
  intro: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21 },
  section: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.2, marginTop: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { fontFamily: fontFamily.sansSemi, fontSize: 15 },
  badge: { fontFamily: fontFamily.sansBold, fontSize: 12, marginTop: 2 },
  note: { fontFamily: fontFamily.sans, fontSize: 12.5, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: fontFamily.sansSemi, fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.xs },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 24, fontFamily: fontFamily.sansBold },
  stepLabel: { fontFamily: fontFamily.sansSemi, fontSize: 14 },
  search: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, fontFamily: fontFamily.sans, fontSize: 15 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  grant: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  btn: { height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: 1, padding: spacing.xl },
  dialogTitle: { fontFamily: fontFamily.serif, fontSize: 22, marginBottom: spacing.sm },
  dialogBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.xl },
  dialogBtn: { minWidth: 96, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
});
