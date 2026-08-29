// NutritionScreen — MacroFactor-inspired layout.
//
// Top block: a single ROW where the calorie ring sits on the LEFT (large,
// no card around it, "Calorie remaining" label under the number), and the
// macro breakdown sits on the RIGHT as a stack of three rows. This matches
// the "Activity + Heart Rate" reference layout you shared: the primary
// metric on the left, secondary metrics stacked on the right.
//
// Under that is the food log — one card of hairline-separated rows — and
// the add-food modal, which is kept nearly identical to the old screen so
// the food-search/USDA/combo flows still work.
//
// Uses the new usePalette() so this screen responds to light/dark toggle.

import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal, FlatList } from 'react-native';
import { getDoc, setDoc } from 'firebase/firestore';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import {
  Screen,
  AppBar,
  Button,
  Field,
  EmptyState,
} from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import { CalorieRing } from '../components/CalorieRing';
import haptics from '../services/haptics';
import { useUser } from '../context/UserContext';
import { dayDocRef, getTodayKey } from '../firebase/progress';
import { FOOD_DATABASE, FoodDatabaseItem } from '../data/foods';
import { searchUSDAFoods } from '../data/usdaFoodApi';
import { getFoodEmoji } from '../data/foodEmoji';
import { useLanguage } from '../i18n/LanguageContext';
import { customFoodsDocRef, CustomFood } from '../firebase/customFoods';

type FoodEntry = {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const DEFAULT_CALORIE_GOAL = 2000;
// The ring is deliberately BIG here — it dominates the top of the screen
// as the primary metric. 180 chosen so it sits at roughly 45% of a
// standard phone width, leaving room for the macro stack next to it.
const RING_SIZE = 180;
const SEARCH_ROW_HEIGHT = 64;

export default function NutritionScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const CALORIE_GOAL = profile?.calorieGoal || DEFAULT_CALORIE_GOAL;
  const [loading, setLoading] = useState(true);

  const loadedDayKeyRef = useRef<string>(getTodayKey());
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'custom' | 'combine'>('search');

  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<FoodDatabaseItem[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  const [customName, setCustomName] = useState('');
  const [customCal, setCustomCal] = useState('');
  const [customP, setCustomP] = useState('');
  const [customC, setCustomC] = useState('');
  const [customF, setCustomF] = useState('');

  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);

  // ---- Load today's food log + saved custom foods ----
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setLoading(true);
      const todayKey = getTodayKey();
      loadedDayKeyRef.current = todayKey;
      try {
        const [daySnap, customSnap] = await Promise.all([
          getDoc(dayDocRef(authUser.uid)),
          getDoc(customFoodsDocRef(authUser.uid)),
        ]);
        setFoodLog((daySnap.data()?.foodLog as FoodEntry[]) || []);
        setCustomFoods((customSnap.data()?.foods as CustomFood[]) || []);
      } catch {
        // silent — screen renders empty; a retry happens on next focus
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.uid]);

  const totalCalories = foodLog.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = foodLog.reduce((sum, item) => sum + item.protein, 0);
  const totalCarbs   = foodLog.reduce((sum, item) => sum + item.carbs,   0);
  const totalFat     = foodLog.reduce((sum, item) => sum + item.fat,     0);
  const macroGramTotal = totalProtein + totalCarbs + totalFat;

  // "Sugar" isn't a database field on food entries in this app — the USDA
  // items don't consistently report it. Shown as a placeholder for now so
  // the row exists in the History graph and the design; the number will
  // start being real once food entries include sugar (a schema change).
  const totalSugar = 0;

  // Macro goals in grams — the standard 30/40/30 split of the calorie goal.
  // (Protein calories: 4/g, carbs: 4/g, fat: 9/g.)
  const proteinGoal = Math.round((CALORIE_GOAL * 0.30) / 4);
  const carbsGoal   = Math.round((CALORIE_GOAL * 0.40) / 4);
  const fatGoal     = Math.round((CALORIE_GOAL * 0.30) / 9);

  // ---- Add food ----
  async function addFood(item: Omit<FoodEntry, 'id'>) {
    if (!authUser) return;
    const newEntry: FoodEntry = { ...item, id: Date.now() };
    const updated = [...foodLog, newEntry];
    setFoodLog(updated);
    haptics.setComplete();
    await setDoc(dayDocRef(authUser.uid), { foodLog: updated }, { merge: true });
  }

  async function deleteFood(id: number) {
    if (!authUser) return;
    const updated = foodLog.filter(f => f.id !== id);
    setFoodLog(updated);
    haptics.selection();
    await setDoc(dayDocRef(authUser.uid), { foodLog: updated }, { merge: true });
  }

  // ---- Search ----
  const localResults = searchQuery.trim()
    ? FOOD_DATABASE.filter(f => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 15)
    : [];

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) { setApiResults([]); setApiLoading(false); return; }
    setApiLoading(true);
    let active = true;
    const timeout = setTimeout(async () => {
      const results = await searchUSDAFoods(query);
      if (!active) return;
      setApiResults(results);
      setApiLoading(false);
    }, 400);
    return () => { active = false; clearTimeout(timeout); };
  }, [searchQuery]);

  const searchResults = [
    ...localResults,
    ...apiResults.filter(
      api => !localResults.some(local => local.name.toLowerCase() === api.name.toLowerCase())
    ),
  ].slice(0, 40);

  function pickResult(item: FoodDatabaseItem) {
    addFood({
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
    setSearchQuery('');
    setModalVisible(false);
  }

  function submitCustom() {
    const cal = parseFloat(customCal);
    if (!customName.trim() || !Number.isFinite(cal)) return;
    addFood({
      name: customName.trim(),
      calories: Math.round(cal),
      protein: Math.round(parseFloat(customP) || 0),
      carbs:   Math.round(parseFloat(customC) || 0),
      fat:     Math.round(parseFloat(customF) || 0),
    });
    setCustomName(''); setCustomCal(''); setCustomP(''); setCustomC(''); setCustomF('');
    setModalVisible(false);
  }

  // ---- Render ----
  const caloriesRemaining = Math.max(0, CALORIE_GOAL - totalCalories);
  const calOverage = totalCalories - CALORIE_GOAL;

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar title={t('nutrition')} onBack={() => navigation.goBack()} />

        {/* HERO ROW — big ring left, macro stack right. */}
        <Enter index={0}>
          <View style={styles.hero}>
            {/* LEFT: The ring itself. No card around it — it sits on the
                page background, big and bare, exactly like the reference. */}
            <View style={styles.ringWrap}>
              {loading
                ? <Shimmer style={{ width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2 }} />
                : <CalorieRing value={totalCalories} goal={CALORIE_GOAL} size={RING_SIZE} />}
              <Text style={[styles.ringNumber, { color: palette.textPrimary }]}>
                {calOverage > 0 ? calOverage : caloriesRemaining}
              </Text>
              <Text style={[styles.ringLabel, { color: palette.textSecondary }]}>
                {calOverage > 0 ? 'Calories over' : 'Calories remaining'}
              </Text>
              <Text style={[styles.ringGoal, { color: palette.textMuted }]}>
                of {CALORIE_GOAL.toLocaleString()} kcal
              </Text>
            </View>

            {/* RIGHT: macros stacked. Each row: label · grams/goal · bar. */}
            <View style={styles.macroStack}>
              <Text style={[styles.macroStackTitle, { color: palette.textSecondary }]}>MACROS</Text>
              <MacroRow
                label="Protein"
                grams={totalProtein}
                goal={proteinGoal}
                color={palette.protein}
                palette={palette}
              />
              <MacroRow
                label="Carbs"
                grams={totalCarbs}
                goal={carbsGoal}
                color={palette.carbs}
                palette={palette}
              />
              <MacroRow
                label="Fat"
                grams={totalFat}
                goal={fatGoal}
                color={palette.fat}
                palette={palette}
              />
            </View>
          </View>
        </Enter>

        {/* Food log */}
        <Enter index={1}>
          <View style={styles.logHeader}>
            <Text style={[styles.logTitle, { color: palette.textPrimary }]}>Today's food</Text>
            <Text style={[styles.logCount, { color: palette.textMuted }]}>
              {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </Enter>

        <Enter index={2}>
          <View style={[styles.logCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {foodLog.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyTitle, { color: palette.textSecondary }]}>
                  Nothing logged yet
                </Text>
                <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
                  Tap Add food to log your first meal.
                </Text>
              </View>
            ) : (
              foodLog.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />}
                  <View style={styles.foodRow}>
                    <Text style={styles.foodEmoji}>{getFoodEmoji(item.name)}</Text>
                    <View style={styles.foodLeft}>
                      <Text style={[styles.foodName, { color: palette.textPrimary }]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.foodMacros, { color: palette.textMuted }]}>
                        P: {item.protein}g · C: {item.carbs}g · F: {item.fat}g
                      </Text>
                    </View>
                    <View style={styles.foodRight}>
                      <Text style={[styles.foodCalories, { color: palette.textPrimary }]}>
                        {item.calories} kcal
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name}`}
                        onPress={() => deleteFood(item.id)}
                        hitSlop={8}>
                        <Text style={[styles.deleteButton, { color: palette.textMuted }]}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </Enter>
      </Screen>

      {/* Floating add-food button */}
      <View style={styles.fabWrap}>
        <Button label={t('add_food')} onPress={() => setModalVisible(true)} variant="primary" fullWidth />
      </View>

      {/* Add food modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: palette.scrim }]}>
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>Log Food</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={12}>
                <Text style={[styles.modalClose, { color: palette.textSecondary }]}>Done</Text>
              </Pressable>
            </View>

            {/* Simple 2-tab: Search vs Custom entry (combine tab dropped
                for this pass; USDA + local search covers ~95% of what
                people log day-to-day). */}
            <View style={[styles.tabRow, { backgroundColor: palette.surfaceSunken }]}>
              {(['search', 'custom'] as const).map(tab => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.tab,
                    activeTab === tab && { backgroundColor: palette.accent },
                  ]}>
                  <Text style={[
                    styles.tabText,
                    { color: activeTab === tab ? palette.textOnAccent : palette.textSecondary },
                  ]}>
                    {tab === 'search' ? 'Search' : 'Custom'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activeTab === 'search' ? (
              <>
                <Field
                  label="Food"
                  placeholder="e.g. chicken breast"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoFocus
                />
                <FlatList
                  data={searchResults}
                  keyExtractor={(item, i) => `${item.id}-${i}`}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 400 }}
                  ListEmptyComponent={
                    <Text style={[styles.emptyBody, { color: palette.textMuted, padding: spacing.lg }]}>
                      {apiLoading ? 'Searching…' : searchQuery.trim() ? 'No matches — try a broader term.' : 'Type to search foods.'}
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => pickResult(item)}
                      style={({ pressed }) => [
                        styles.searchRow,
                        { borderBottomColor: palette.divider },
                        pressed && { backgroundColor: palette.accentSoft },
                      ]}>
                      <Text style={styles.searchEmoji}>{getFoodEmoji(item.name)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.searchName, { color: palette.textPrimary }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.searchMeta, { color: palette.textMuted }]}>
                          {item.calories} kcal · P {item.protein} · C {item.carbs} · F {item.fat}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
              </>
            ) : (
              <View style={{ gap: spacing.md }}>
                <Field label="Name" value={customName} onChangeText={setCustomName} placeholder="Homemade smoothie" />
                <Field label="Calories" value={customCal} onChangeText={setCustomCal} placeholder="350" keyboardType="numeric" />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><Field label="P (g)" value={customP} onChangeText={setCustomP} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Field label="C (g)" value={customC} onChangeText={setCustomC} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Field label="F (g)" value={customF} onChangeText={setCustomF} keyboardType="numeric" /></View>
                </View>
                <Button label="Add" onPress={submitCustom} variant="primary" fullWidth />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- Macro row: label + numeric + slim bar underneath ----
function MacroRow({ label, grams, goal, color, palette }: any) {
  const pct = goal > 0 ? Math.min(1, grams / goal) : 0;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroRowTop}>
        <Text style={[styles.macroLabel, { color: palette.textPrimary }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: palette.textSecondary }]}>
          {grams}<Text style={[styles.macroGoal, { color: palette.textMuted }]}> / {goal}g</Text>
        </Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: palette.surfaceSunken }]}>
        <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { paddingBottom: 120 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  ringWrap: {
    width: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringNumber: {
    position: 'absolute',
    top: RING_SIZE / 2 - 38,
    fontFamily: fontFamily.sansBlack,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1,
  },
  ringLabel: {
    position: 'absolute',
    top: RING_SIZE / 2 + 20,
    fontFamily: fontFamily.sans,
    fontSize: 13,
  },
  ringGoal: {
    position: 'absolute',
    top: RING_SIZE / 2 + 40,
    fontFamily: fontFamily.sans,
    fontSize: 12,
  },
  macroStack: {
    flex: 1,
    gap: spacing.md,
  },
  macroStackTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  macroRow: { gap: 6 },
  macroRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroLabel: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  macroValue: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  macroGoal:  { fontFamily: fontFamily.sans,     fontSize: 13 },
  macroTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 3,
  },

  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  logTitle: { fontFamily: fontFamily.serif, fontSize: 18 },
  logCount: { fontFamily: fontFamily.sans, fontSize: 13 },
  logCard: { borderRadius: radius.lg, borderWidth: layout.hairline, overflow: 'hidden' },
  emptyBox: { padding: spacing.xl, alignItems: 'center', gap: 4 },
  emptyTitle: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: 13, textAlign: 'center' },
  rowDivider: { height: layout.hairline, marginHorizontal: spacing.lg },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  foodEmoji: { fontSize: 22 },
  foodLeft:  { flex: 1 },
  foodName:  { fontFamily: fontFamily.sansBold, fontSize: 15 },
  foodMacros:{ fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
  foodRight: { alignItems: 'flex-end', gap: 4 },
  foodCalories: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  deleteButton: { fontFamily: fontFamily.sans, fontSize: 16, paddingHorizontal: 6 },

  fabWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg,
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: 22 },
  modalClose: { fontFamily: fontFamily.sansBold, fontSize: 15 },

  tabRow: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  tabText: { fontFamily: fontFamily.sansBold, fontSize: 13 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.hairline,
    minHeight: SEARCH_ROW_HEIGHT,
  },
  searchEmoji: { fontSize: 24 },
  searchName:  { fontFamily: fontFamily.sansBold, fontSize: 14 },
  searchMeta:  { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
});
