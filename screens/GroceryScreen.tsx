// Grocery list: built from the meal plan you saved with the AI coach. Tick things off as you shop,
// add your own items, and share the list as text.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share } from 'react-native';
import { Screen, AppBar, Button, Card } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { buildGroceryList, groceryToText, type GrocerySection } from '../services/grocery';
import { loadSavedMealPlan, loadGroceryState, saveGroceryState, EMPTY_GROCERY, type GroceryState } from '../firebase/groceryList';
import haptics from '../services/haptics';

const keyOf = (aisle: string, item: string, unit: string) => `${aisle}|${item}|${unit}`.toLowerCase();
const MAX_EXTRA = 50;

export default function GroceryScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<GrocerySection[]>([]);
  const [state, setState] = useState<GroceryState>(EMPTY_GROCERY);
  const [stamp, setStamp] = useState(0);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const [plan, saved] = await Promise.all([loadSavedMealPlan(authUser.uid).catch(() => null), loadGroceryState(authUser.uid).catch(() => EMPTY_GROCERY)]);
        const secs = plan ? buildGroceryList(plan.days as any) : [];
        setSections(secs);
        // A newly saved plan starts a fresh shopping trip; ticks from the old plan don't carry over.
        const fresh = plan && plan.savedAt !== saved.planStamp;
        setStamp(plan?.savedAt ?? 0);
        setState(fresh ? { planStamp: plan!.savedAt, checked: [], extra: saved.extra } : saved);
      } finally { setLoading(false); }
    })();
  }, [authUser?.uid]);

  const persist = useCallback((next: GroceryState) => {
    setState(next);
    if (authUser) saveGroceryState(authUser.uid, { ...next, planStamp: stamp }).catch(() => {});
  }, [authUser?.uid, stamp]);

  const toggle = (k: string) => { haptics.selection(); persist({ ...state, checked: state.checked.includes(k) ? state.checked.filter(x => x !== k) : [...state.checked, k] }); };
  const addExtra = () => {
    const v = draft.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!v || state.extra.length >= MAX_EXTRA || state.extra.some(e => e.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    setDraft(''); haptics.selection();
    persist({ ...state, extra: [...state.extra, v] });
  };
  const clearTicked = () => persist({ ...state, checked: [], extra: state.extra.filter(e => !state.checked.includes(keyOf('extra', e, ''))) });

  const total = sections.reduce((n, s) => n + s.items.length, 0) + state.extra.length;
  const ticked = state.checked.length;
  const left = Math.max(0, total - ticked);

  const share = () => {
    const all: GrocerySection[] = [...sections, ...(state.extra.length ? [{ aisle: t('grYours'), items: state.extra.map(e => ({ item: e, qty: 1, unit: '' })) }] : [])];
    Share.share({ message: groceryToText(all, t('grTitle')) }).catch(() => {});
  };

  const Row = ({ k, label }: { k: string; label: string }) => {
    const on = state.checked.includes(k);
    return (
      <Pressable onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={label} style={styles.item}>
        <View style={[styles.box, { borderColor: on ? palette.accent : palette.borderStrong, backgroundColor: on ? palette.accent : 'transparent' }]}>
          <Text style={{ color: palette.textOnAccent, fontFamily: fontFamily.sansBold, fontSize: 13 }}>{on ? '✓' : ''}</Text>
        </View>
        <Text style={[styles.itemText, { color: on ? palette.textMuted : palette.textPrimary, textDecorationLine: on ? 'line-through' : 'none' }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppBar title={t('grTitle')} onBack={() => navigation.goBack()} />
      {!loading && sections.length === 0 && state.extra.length === 0 && <Text style={[styles.empty, { color: palette.textSecondary }]}>{t('grEmpty')}</Text>}
      {total > 0 && <Text style={[styles.count, { color: palette.textMuted }]} accessibilityLiveRegion="polite">{t('grLeft').replace('{n}', String(left))}</Text>}
      {sections.map(sec => (
        <Card key={sec.aisle} style={{ gap: 2 }}>
          <Text style={[styles.aisle, { color: palette.textMuted }]}>{sec.aisle.toUpperCase()}</Text>
          {sec.items.map(i => <Row key={keyOf(sec.aisle, i.item, i.unit)} k={keyOf(sec.aisle, i.item, i.unit)} label={`${i.item}${i.qty ? `: ${i.qty}${i.unit ? ' ' + i.unit : ''}` : ''}`} />)}
        </Card>
      ))}
      <Card style={{ gap: spacing.sm }}>
        {state.extra.length > 0 && <Text style={[styles.aisle, { color: palette.textMuted }]}>{t('grYours').toUpperCase()}</Text>}
        {state.extra.map(e => <Row key={e} k={keyOf('extra', e, '')} label={e} />)}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <TextInput value={draft} onChangeText={setDraft} placeholder={t('grAddPlaceholder')} placeholderTextColor={palette.textMuted} accessibilityLabel={t('grAddPlaceholder')} maxLength={60}
            onSubmitEditing={addExtra} returnKeyType="done"
            style={[styles.input, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }]} />
          <Button label={t('grAdd')} size="sm" variant="secondary" onPress={addExtra} disabled={!draft.trim()} />
        </View>
      </Card>
      {total > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Button label={t('grShare')} onPress={share} />
          {ticked > 0 && <Button label={t('grClearTicked')} variant="secondary" onPress={clearTicked} />}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  empty: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.xl },
  count: { fontFamily: fontFamily.sansBold, fontSize: 12 },
  aisle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontFamily: fontFamily.sans, fontSize: 15 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.md, borderWidth: layout.hairline, paddingHorizontal: spacing.md, fontFamily: fontFamily.sans, fontSize: 15 },
});
