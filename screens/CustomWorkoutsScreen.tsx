// My workouts: build your own, start one, share one as a code, or import a friend's code.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share } from 'react-native';
import { Screen, AppBar, Button, Card } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { loadCustomWorkouts, saveCustomWorkout, deleteCustomWorkout, MAX_CUSTOM_WORKOUTS } from '../firebase/training';
import { cleanCustomWorkout, decodeShareCode, shareText, MAX_EXERCISES, MAX_TITLE, MAX_NAME, type CustomWorkout } from '../services/training/custom';
import { fill } from '../components/training/TrainingParts';
import haptics from '../services/haptics';

type Draft = { id?: string; title: string; exercises: { name: string; sets: string; reps: string; restSec: string }[] };
const blankExercise = () => ({ name: '', sets: '3', reps: '8-12', restSec: '90' });

export default function CustomWorkoutsScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { t } = useLanguage();
  const [list, setList] = useState<CustomWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!authUser) return;
    try { setList(await loadCustomWorkouts(authUser.uid)); } catch { /* shown as empty */ }
    setLoading(false);
  }, [authUser?.uid]);
  useEffect(() => { refresh(); }, [refresh]);

  const input = [styles.input, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }];

  async function save() {
    if (!authUser || !draft || saving) return;
    const clean = cleanCustomWorkout({ title: draft.title, exercises: draft.exercises.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, restSec: e.restSec })) }, draft.id ?? 'new');
    if (!clean) { setMessage(t('cwNeedExercise')); haptics.error(); return; }
    if (!draft.id && list.length >= MAX_CUSTOM_WORKOUTS) { setMessage(t('cwLimit')); return; }
    setSaving(true);
    try { await saveCustomWorkout(authUser.uid, { id: draft.id, title: clean.title, focus: clean.focus, exercises: clean.exercises }); haptics.setComplete(); setDraft(null); setMessage(''); await refresh(); }
    catch { setMessage(t('errorSaveFailed')); }
    finally { setSaving(false); }
  }

  async function importCode() {
    if (!authUser) return;
    const w = decodeShareCode(importText, 'new');
    if (!w) { setMessage(t('cwImportBad')); haptics.error(); return; }
    if (list.length >= MAX_CUSTOM_WORKOUTS) { setMessage(t('cwLimit')); return; }
    try { await saveCustomWorkout(authUser.uid, { title: w.title, focus: w.focus, exercises: w.exercises }); setImportText(''); setMessage(t('cwImported')); haptics.setComplete(); await refresh(); }
    catch { setMessage(t('errorSaveFailed')); }
  }

  async function share(w: CustomWorkout) {
    setSharing(sharing === w.id ? null : w.id);
    try { await Share.share({ message: shareText(w) }); } catch { /* the code stays visible below to copy */ }
  }

  async function remove(id: string) {
    if (!authUser) return;
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    try { await deleteCustomWorkout(authUser.uid, id); setConfirmDelete(null); await refresh(); } catch { setMessage(t('errorSaveFailed')); }
  }

  if (draft) {
    const setEx = (i: number, patch: Partial<Draft['exercises'][number]>) => setDraft(d => d && ({ ...d, exercises: d.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)) }));
    return (
      <Screen scroll contentStyle={styles.content}>
        <AppBar title={draft.id ? t('cwEdit') : t('cwNew')} onBack={() => { setDraft(null); setMessage(''); }} />
        <TextInput value={draft.title} onChangeText={v => setDraft({ ...draft, title: v.slice(0, MAX_TITLE) })} placeholder={t('cwName')} placeholderTextColor={palette.textMuted}
          accessibilityLabel={t('cwName')} maxLength={MAX_TITLE} style={input} />
        {draft.exercises.map((e, i) => (
          <Card key={i} style={{ gap: spacing.sm }}>
            <TextInput value={e.name} onChangeText={v => setEx(i, { name: v.slice(0, MAX_NAME) })} placeholder={t('cwExerciseName')} placeholderTextColor={palette.textMuted}
              accessibilityLabel={`${t('cwExerciseName')} ${i + 1}`} maxLength={MAX_NAME} style={input} />
            <View style={styles.row}>
              {([['sets', 'cwSets', 'number-pad', 2], ['reps', 'cwReps', 'default', 12], ['restSec', 'cwRest', 'number-pad', 3]] as const).map(([k, label, kb, max]) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: palette.textMuted }]}>{t(label)}</Text>
                  <TextInput value={e[k]} onChangeText={v => setEx(i, { [k]: v.slice(0, max) } as any)} keyboardType={kb as any} maxLength={max}
                    accessibilityLabel={`${t(label)} ${i + 1}`} placeholderTextColor={palette.textMuted} style={input} />
                </View>
              ))}
            </View>
            {draft.exercises.length > 1 && (
              <Pressable onPress={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, k) => k !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t('cwRemove')} ${e.name || i + 1}`} style={styles.link}>
                <Text style={[styles.linkText, { color: palette.danger }]}>{t('cwRemove')}</Text>
              </Pressable>
            )}
          </Card>
        ))}
        {draft.exercises.length < MAX_EXERCISES && <Button label={t('cwAddExercise')} variant="secondary" onPress={() => setDraft({ ...draft, exercises: [...draft.exercises, blankExercise()] })} />}
        {!!message && <Text style={[styles.message, { color: palette.danger }]} accessibilityRole="alert">{message}</Text>}
        <Button label={t('cwSave')} onPress={save} disabled={saving} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppBar title={t('cwTitle')} onBack={() => navigation.goBack()} />
      <Button label={t('cwNew')} onPress={() => setDraft({ title: '', exercises: [blankExercise()] })} />
      <Card style={{ gap: spacing.sm }}>
        <TextInput value={importText} onChangeText={setImportText} placeholder={t('cwImportPlaceholder')} placeholderTextColor={palette.textMuted}
          accessibilityLabel={t('cwImportPlaceholder')} autoCapitalize="none" autoCorrect={false} maxLength={4200} style={input} />
        <Button label={t('cwImport')} variant="secondary" onPress={importCode} disabled={!importText.trim()} />
      </Card>
      {!!message && <Text style={[styles.message, { color: message === t('cwImported') ? palette.success : palette.danger }]} accessibilityRole="alert">{message}</Text>}
      {!loading && list.length === 0 && <Text style={[styles.empty, { color: palette.textSecondary }]}>{t('cwEmpty')}</Text>}
      {list.map(w => (
        <Card key={w.id} style={{ gap: spacing.sm }}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>{w.title}</Text>
          <Text style={[styles.sub, { color: palette.textMuted }]}>{fill(t('cwExercises'), { n: w.exercises.length })} · {w.exercises.map(e => e.name).join(', ').slice(0, 80)}</Text>
          <View style={styles.row}>
            <Button label={t('cwStart')} size="sm" onPress={() => navigation.navigate('Workout', { customId: w.id })} />
            <Button label={t('cwEdit')} size="sm" variant="secondary" onPress={() => setDraft({ id: w.id, title: w.title, exercises: w.exercises.map(e => ({ name: e.name, sets: String(e.sets), reps: e.reps, restSec: String(e.restSec) })) })} />
            <Button label={t('cwShare')} size="sm" variant="secondary" onPress={() => share(w)} />
            <Button label={confirmDelete === w.id ? `${t('cwDelete')}?` : t('cwDelete')} size="sm" variant="danger" onPress={() => remove(w.id)} />
          </View>
          {sharing === w.id && <Text selectable style={[styles.code, { color: palette.textSecondary, borderColor: palette.border }]}>{shareText(w)}</Text>}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  input: { minHeight: 44, borderRadius: radius.md, borderWidth: layout.hairline, paddingHorizontal: spacing.md, fontFamily: fontFamily.sansBold, fontSize: 15 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'flex-end' },
  label: { fontFamily: fontFamily.sansBold, fontSize: 11, marginBottom: 4 },
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  message: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  empty: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.lg },
  title: { fontFamily: fontFamily.sansBold, fontSize: 17 },
  sub: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17 },
  code: { fontFamily: fontFamily.sans, fontSize: 11, lineHeight: 16, borderWidth: layout.hairline, borderRadius: radius.md, padding: spacing.sm },
});
