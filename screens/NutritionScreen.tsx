import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal, FlatList } from 'react-native';
import { getDoc, setDoc } from 'firebase/firestore';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import {
  Screen,
  AppBar,
  SectionTitle,
  Button,
  Field,
  EmptyState,
} from '../components/ui';
import { Shimmer, SlideInRow, AnimatedMeter } from '../components/anim';
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

// Component dimensions, not spacing: the ring's diameter (its skeleton has to
// match it exactly or the layout jumps when data lands) and the height of a
// search result row, reused by that list's skeleton.
const RING_SIZE = 168;
const SEARCH_ROW_HEIGHT = 64;

export default function NutritionScreen({ navigation }: any) {
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const CALORIE_GOAL = profile?.calorieGoal || DEFAULT_CALORIE_GOAL;
  const [loading, setLoading] = useState(true);

  // Which calendar day the food log currently in state was loaded for. The
  // day document is keyed by date, so this is what lets a write notice that
  // midnight has passed since the data it's about to save was read.
  const loadedDayKeyRef = useRef<string>(getTodayKey());
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  // "search" = pick from the built-in food database (default).
  // "custom" = the original manual-entry form, for anything not in the list.
  // "combine" = build a new food out of several other foods (e.g. chicken +
  // pasta = "Nana's Pasta"), which gets saved for reuse later.
  const [modalTab, setModalTab] = useState<'search' | 'custom' | 'combine'>('search');

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDbFood, setSelectedDbFood] = useState<FoodDatabaseItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [apiResults, setApiResults] = useState<FoodDatabaseItem[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  // Custom tab state
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Combine tab state — saved combos the user has already built (loaded
  // from Firestore) plus the in-progress combo they're currently assembling.
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [combineQuery, setCombineQuery] = useState('');
  const [combineApiResults, setCombineApiResults] = useState<FoodDatabaseItem[]>([]);
  const [combineApiLoading, setCombineApiLoading] = useState(false);
  const [combineIngredients, setCombineIngredients] = useState<(FoodDatabaseItem & { quantity: number })[]>([]);
  const [comboName, setComboName] = useState('');
  const [comboError, setComboError] = useState('');
  const [savingCombo, setSavingCombo] = useState(false);

  const totalCalories = foodLog.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = foodLog.reduce((sum, item) => sum + item.protein, 0);
  const totalCarbs = foodLog.reduce((sum, item) => sum + item.carbs, 0);
  const totalFat = foodLog.reduce((sum, item) => sum + item.fat, 0);
  const calorieProgress = Math.min((totalCalories / CALORIE_GOAL) * 100, 100);

  // Presentation only: the three macro bars, each carrying its own label and
  // gram value so colour is never the sole carrier of meaning. The bar length
  // is the macro's share of today's total grams, which is what makes the three
  // read as one breakdown rather than three unrelated meters.
  const macroGramTotal = totalProtein + totalCarbs + totalFat;
  const macroBars = [
    { label: 'Protein', grams: totalProtein, color: colors.protein },
    { label: 'Carbs', grams: totalCarbs, color: colors.carbs },
    { label: 'Fat', grams: totalFat, color: colors.fat },
  ].map(macro => ({
    ...macro,
    share: macroGramTotal > 0 ? macro.grams / macroGramTotal : 0,
  }));

  // Load today's food log from Firestore (shared day document with Dashboard).
  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Stamp the day this log belongs to before reading it, so saveFoodLog
      // below can tell whether the array it's about to write is still today's.
      loadedDayKeyRef.current = getTodayKey();
      try {
        const [daySnap, customFoodsSnap] = await Promise.all([
          getDoc(dayDocRef(authUser.uid)),
          getDoc(customFoodsDocRef(authUser.uid)),
        ]);
        if (cancelled) return;
        setFoodLog(daySnap.exists() ? daySnap.data().foodLog || [] : []);
        setCustomFoods(customFoodsSnap.exists() ? customFoodsSnap.data().foods || [] : []);
      } catch {
        // Without this catch a rejected read never reached setLoading(false),
        // so the screen sat on its spinner forever — and because the AppBar
        // only renders in the non-loading branch, there wasn't even a back
        // button. Killing the app was the only way out. Empty lists are the
        // honest fallback: nothing loaded, so show nothing.
        if (!cancelled) {
          setFoodLog([]);
          setCustomFoods([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // Writes the food log to whichever day document is current RIGHT NOW —
  // which is the whole problem this guard exists to solve.
  //
  // `dayDocRef()` resolves the date when it's called, but `log` came from
  // state that was loaded at some point in the past. Leave the app open past
  // midnight and adding a single coffee writes `[...yesterday's four meals,
  // coffee]` into today's brand-new document. The new day would open at 2150
  // kcal across 5 meals, and the Dashboard would auto-complete "Log 4 meals
  // today" and pay XP for food eaten the day before.
  //
  // Checking a focus listener isn't sufficient on its own: an app that simply
  // sits on screen never re-focuses, which is exactly the scenario that
  // breaks. So the check happens at the moment of the write.
  const saveFoodLog = async (log: FoodEntry[]) => {
    if (!authUser) return;

    if (getTodayKey() !== loadedDayKeyRef.current) {
      // The day rolled over underneath us. Discard the stale array rather
      // than writing it, re-read today's document, and let the user re-apply
      // their action against a log that actually belongs to today.
      await reloadToday();
      return;
    }

    setDoc(dayDocRef(authUser.uid), { foodLog: log }, { merge: true }).catch(() => {
      haptics.error();
    });
  };

  // Re-reads today's log and re-stamps the day key. Used by the rollover
  // guard above and by the focus listener below.
  const reloadToday = async () => {
    if (!authUser) return;
    loadedDayKeyRef.current = getTodayKey();
    try {
      const daySnap = await getDoc(dayDocRef(authUser.uid));
      setFoodLog(daySnap.exists() ? daySnap.data().foodLog || [] : []);
    } catch {
      // Leave the log as-is; the guard will try again on the next write.
    }
  };

  // Coming back to this screen re-reads the log, so food logged elsewhere (or
  // a day that turned over while the app was backgrounded) is reflected.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (getTodayKey() !== loadedDayKeyRef.current) reloadToday();
    });
    return unsubscribe;
  }, [navigation, authUser]);

  const resetModal = () => {
    setModalTab('search');
    setSearchQuery('');
    setSelectedDbFood(null);
    setQuantity('1');
    setFoodName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setCombineQuery('');
    setCombineIngredients([]);
    setComboName('');
    setComboError('');
  };

  const closeModal = () => {
    setModalVisible(false);
    resetModal();
  };

  const localResults = searchQuery.trim()
    ? FOOD_DATABASE.filter(f => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 15)
    : [];

  // Saved combos are converted to the same FoodDatabaseItem shape so they
  // slot into the same result list, "add food" flow, and quantity-scaling
  // logic as everything else — searching "nana" later finds "Nana's Pasta"
  // right alongside chicken and pasta.
  const customFoodResults: FoodDatabaseItem[] = searchQuery.trim()
    ? customFoods
        .filter(f => f.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .map(f => ({
          id: f.id,
          name: f.name,
          category: 'Combo',
          servingLabel: f.servingLabel,
          calories: f.calories,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
        }))
    : [];

  // Live search against the USDA food database, so exotic/uncommon foods
  // not in the local list still show up. Debounced 400ms so it doesn't
  // fire a network request on every keystroke.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setApiResults([]);
      setApiLoading(false);
      return;
    }
    setApiLoading(true);
    // `active` is what stops a slow response for an old query from landing on
    // a newer one. Clearing the timeout only cancels a request that hasn't
    // started; once it's in flight nothing recalls it. Type "chicken", pause,
    // then type "rice" — rice comes back fast and renders, then chicken
    // resolves a second later and replaces the list with chicken while the
    // search box still says "rice". The stale setApiLoading(false) also hid
    // the spinner for a request that was genuinely still pending.
    let active = true;
    const timeout = setTimeout(async () => {
      const results = await searchUSDAFoods(query);
      if (!active) return;
      setApiResults(results);
      setApiLoading(false);
    }, 400);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  // Your own combos first (most relevant — you made them), then the local
  // database (instant, no network), then USDA results that aren't already
  // showing as a match from one of the other two sources.
  const searchResults = [
    ...customFoodResults,
    ...localResults,
    ...apiResults.filter(
      (api) =>
        !localResults.some((local) => local.name.toLowerCase() === api.name.toLowerCase()) &&
        !customFoodResults.some((c) => c.name.toLowerCase() === api.name.toLowerCase())
    ),
  ].slice(0, 40);

  // --- Combine tab: same local + USDA search pattern as above, but kept
  // completely separate so building a combo doesn't interfere with the
  // regular Search tab's state (they can even be mid-search on both).
  const combineLocalResults = combineQuery.trim()
    ? FOOD_DATABASE.filter(f => f.name.toLowerCase().includes(combineQuery.trim().toLowerCase())).slice(0, 15)
    : [];

  useEffect(() => {
    const query = combineQuery.trim();
    if (!query) {
      setCombineApiResults([]);
      setCombineApiLoading(false);
      return;
    }
    setCombineApiLoading(true);
    // Same stale-response guard as the Search tab above.
    let active = true;
    const timeout = setTimeout(async () => {
      const results = await searchUSDAFoods(query);
      if (!active) return;
      setCombineApiResults(results);
      setCombineApiLoading(false);
    }, 400);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [combineQuery]);

  const combineSearchResults = [
    ...combineLocalResults,
    ...combineApiResults.filter(
      (api) => !combineLocalResults.some((local) => local.name.toLowerCase() === api.name.toLowerCase())
    ),
  ].slice(0, 40);

  // Adding the same ingredient twice just bumps its quantity instead of
  // creating a duplicate row — so tapping "chicken" twice means "2 servings
  // of chicken" in the combo, not two separate chicken entries.
  const addIngredient = (item: FoodDatabaseItem) => {
    setCombineIngredients(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateIngredientQty = (id: string, qty: number) => {
    setCombineIngredients(prev => prev.map(i => (i.id === id ? { ...i, quantity: qty } : i)));
  };

  const removeIngredient = (id: string) => {
    setCombineIngredients(prev => prev.filter(i => i.id !== id));
  };

  const comboTotals = combineIngredients.reduce(
    (acc, i) => ({
      calories: acc.calories + Math.round(i.calories * i.quantity),
      protein: acc.protein + Math.round(i.protein * i.quantity),
      carbs: acc.carbs + Math.round(i.carbs * i.quantity),
      fat: acc.fat + Math.round(i.fat * i.quantity),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Saves the combo definition to Firestore (so it's searchable later, same
  // as any other food) AND immediately logs one serving of it to today's
  // food log — you just built it because you're about to eat it, so there's
  // no reason to make that a separate step.
  const saveCombo = async () => {
    if (!authUser) return;
    if (!comboName.trim()) {
      setComboError('Give your combo a name.');
      return;
    }
    if (combineIngredients.length === 0) {
      setComboError('Add at least one ingredient.');
      return;
    }
    setComboError('');
    setSavingCombo(true);
    const newCombo: CustomFood = {
      id: `combo-${Date.now()}`,
      name: comboName.trim(),
      servingLabel: '1 combo',
      calories: comboTotals.calories,
      protein: comboTotals.protein,
      carbs: comboTotals.carbs,
      fat: comboTotals.fat,
      ingredients: combineIngredients.map(i => ({ name: i.name, quantity: i.quantity })),
    };
    const updatedCustomFoods = [...customFoods, newCombo];
    try {
      await setDoc(customFoodsDocRef(authUser.uid), { foods: updatedCustomFoods });
      setCustomFoods(updatedCustomFoods);
      const newEntry: FoodEntry = {
        id: Date.now(),
        name: newCombo.name,
        calories: newCombo.calories,
        protein: newCombo.protein,
        carbs: newCombo.carbs,
        fat: newCombo.fat,
      };
      const updatedLog = [...foodLog, newEntry];
      setFoodLog(updatedLog);
      saveFoodLog(updatedLog);
      haptics.setComplete();
      closeModal();
    } catch {
      haptics.error();
      setComboError("Couldn't save — check your connection and try again.");
    } finally {
      setSavingCombo(false);
    }
  };

  const quantityNum = parseFloat(quantity) || 0;
  const scaledPreview = selectedDbFood
    ? {
        calories: Math.round(selectedDbFood.calories * quantityNum),
        protein: Math.round(selectedDbFood.protein * quantityNum),
        carbs: Math.round(selectedDbFood.carbs * quantityNum),
        fat: Math.round(selectedDbFood.fat * quantityNum),
      }
    : null;

  const addFromDatabase = () => {
    if (!selectedDbFood || quantityNum <= 0) return;
    const newEntry: FoodEntry = {
      id: Date.now(),
      name: quantityNum !== 1 ? `${selectedDbFood.name} (${quantityNum}x)` : selectedDbFood.name,
      calories: Math.round(selectedDbFood.calories * quantityNum),
      protein: Math.round(selectedDbFood.protein * quantityNum),
      carbs: Math.round(selectedDbFood.carbs * quantityNum),
      fat: Math.round(selectedDbFood.fat * quantityNum),
    };
    const updatedLog = [...foodLog, newEntry];
    setFoodLog(updatedLog);
    saveFoodLog(updatedLog);
    haptics.setComplete();
    closeModal();
  };

  const addCustomFood = () => {
    if (!foodName || !calories) return;
    const newEntry: FoodEntry = {
      id: Date.now(),
      name: foodName,
      calories: parseInt(calories) || 0,
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
    };
    const updatedLog = [...foodLog, newEntry];
    setFoodLog(updatedLog);
    saveFoodLog(updatedLog);
    haptics.setComplete();
    closeModal();
  };

  const deleteFood = (id: number) => {
    const updatedLog = foodLog.filter(item => item.id !== id);
    setFoodLog(updatedLog);
    saveFoodLog(updatedLog);
  };

  // One renderer for both the Search and Combine result lists so a row looks
  // identical whichever tab you're on.
  const renderResultRow = (item: FoodDatabaseItem, onPress: () => void, index: number) => (
    // SlideInRow reads its stagger from animation/motion.ts, which is also
    // where the cap lives — a 40-result list finishes arriving in the same
    // beat as every other list in the app.
    <SlideInRow index={index}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.servingLabel}, ${item.calories} kcal`}
        onPress={onPress}
        style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}>
        <Text style={styles.resultEmoji}>{getFoodEmoji(item.name, item.category)}</Text>
        <View style={styles.flexOne}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultServing}>{item.servingLabel}</Text>
        </View>
        <Text style={styles.resultCalories}>{item.calories} kcal</Text>
      </Pressable>
    </SlideInRow>
  );

  // Skeletons in the shape of what's coming, not a spinner in the middle of an
  // empty screen: the layout doesn't jump when the day document lands, and the
  // AppBar renders here too so there is always a way back out.
  if (loading) {
    return (
      <View style={styles.wrapper}>
        <Screen scroll contentStyle={styles.container}>
          <AppBar title={t('nutrition')} onBack={() => navigation.goBack()} />
          <View style={styles.ringCard}>
            <Shimmer width={RING_SIZE} height={RING_SIZE} style={styles.ringSkeleton} />
            <Shimmer width="45%" height={16} />
          </View>
          <Shimmer width="100%" height={168} style={styles.skeletonCard} />
          <Shimmer width="40%" height={20} />
          <Shimmer width="100%" height={220} style={styles.skeletonCard} />
        </Screen>
      </View>
    );
  }

  return (
    // The screen's own View so the primary action can float above the scroll.
    <View style={styles.wrapper}>
      <Screen scroll contentStyle={styles.container}>

        {/* Header */}
        <AppBar title={t('nutrition')} onBack={() => navigation.goBack()} />

        {/* The headline. The ring is the number the user opened this screen to
            see, so it gets the top of the page and the slowest animation in the
            app; the line under it says what to do about it. */}
        <Enter index={0}>
          <View style={styles.ringCard}>
            <CalorieRing value={totalCalories} goal={CALORIE_GOAL} size={RING_SIZE} />
            <Text style={styles.ringCaption}>
              {totalCalories > CALORIE_GOAL
                ? `${totalCalories - CALORIE_GOAL} ${t('kcalOverGoal')}`
                : `${CALORIE_GOAL - totalCalories} ${t('kcalRemaining')}`}
            </Text>
          </View>
        </Enter>

        {/* Macros. One card of labelled bars rather than three floating tiles —
            the three numbers are a breakdown of one thing, and every bar prints
            its name and grams so the colour is reinforcement, not the message. */}
        <Enter index={1}>
          <View style={styles.macroCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Macros</Text>
              <Text style={styles.sectionCount}>{macroGramTotal}g total</Text>
            </View>
            {macroBars.map(macro => (
              <View key={macro.label} style={styles.macroBar}>
                <View style={styles.macroBarHeader}>
                  <Text style={styles.macroBarLabel}>{macro.label}</Text>
                  <Text style={styles.macroBarValue}>
                    {macro.grams}g · {Math.round(macro.share * 100)}%
                  </Text>
                </View>
                <AnimatedMeter
                  progress={macro.share}
                  color={macro.color}
                  height={6}
                  celebrateAtFull={false}
                />
              </View>
            ))}
          </View>
        </Enter>

        {/* Food log */}
        <Enter index={2}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('todaysFood')}</Text>
            <Text style={styles.sectionCount}>
              {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </Enter>

        {/* One card of rows separated by hairlines, not a stack of cards: the
            day's food is one list you can read down, not a set of offers. */}
        <Enter index={3}>
          <View style={styles.logCard}>
            {foodLog.length === 0 ? (
              <EmptyState
                icon="🍽️"
                title={t('noFoodLogged')}
                message="Tap Add Food below to log your first meal."
              />
            ) : (
              foodLog.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.foodRow}>
                    <Text style={styles.foodEmoji}>{getFoodEmoji(item.name)}</Text>
                    <View style={styles.foodLeft}>
                      <Text style={styles.foodName}>{item.name}</Text>
                      <Text style={styles.foodMacros}>
                        P: {item.protein}g · C: {item.carbs}g · F: {item.fat}g
                      </Text>
                    </View>
                    <View style={styles.foodRight}>
                      <Text style={styles.foodCalories}>{item.calories} kcal</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name}`}
                        onPress={() => deleteFood(item.id)}
                        hitSlop={8}>
                        <Text style={styles.deleteButton}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </Enter>

      </Screen>

      {/* Add food button */}
      <View style={styles.fabWrap}>
        <Button label={t('add_food')} onPress={() => setModalVisible(true)} variant="primary" fullWidth />
      </View>

      {/* Add food modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Food</Text>

            {/* Tabs — a segmented control: one rounded container, the active
                segment filled with the accent. */}
            <View style={styles.tabRow}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: modalTab === 'search' }}
                accessibilityLabel={t('searchTab')}
                style={[styles.tab, modalTab === 'search' && styles.tabActive]}
                onPress={() => { setModalTab('search'); setSelectedDbFood(null); }}>
                <Text style={[styles.tabText, modalTab === 'search' && styles.tabTextActive]}>{t('searchTab')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: modalTab === 'custom' }}
                accessibilityLabel={t('customTab')}
                style={[styles.tab, modalTab === 'custom' && styles.tabActive]}
                onPress={() => { setModalTab('custom'); setSelectedDbFood(null); }}>
                <Text style={[styles.tabText, modalTab === 'custom' && styles.tabTextActive]}>{t('customTab')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: modalTab === 'combine' }}
                accessibilityLabel={t('combineTab')}
                style={[styles.tab, modalTab === 'combine' && styles.tabActive]}
                onPress={() => { setModalTab('combine'); setSelectedDbFood(null); }}>
                <Text style={[styles.tabText, modalTab === 'combine' && styles.tabTextActive]}>{t('combineTab')}</Text>
              </Pressable>
            </View>

            {modalTab === 'search' && !selectedDbFood && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.trim() === '' && (
                  <Text style={styles.hintText}>Start typing to search — includes a huge food database, so even exotic or uncommon items should show up.</Text>
                )}
                {searchQuery.trim() !== '' && apiLoading && (
                  <View style={styles.searchingBlock}>
                    <Text style={styles.hintText}>Searching more foods...</Text>
                    <Shimmer width="100%" height={SEARCH_ROW_HEIGHT} style={styles.skeletonRow} />
                    <Shimmer width="100%" height={SEARCH_ROW_HEIGHT} style={styles.skeletonRow} />
                  </View>
                )}
                {searchQuery.trim() !== '' && !apiLoading && searchResults.length === 0 && (
                  <EmptyState
                    icon="🔍"
                    title="No matches"
                    message="Try the Custom tab to add it manually."
                  />
                )}
                <FlatList
                  data={searchResults}
                  keyExtractor={item => item.id}
                  style={styles.resultsList}
                  contentContainerStyle={styles.resultsListContent}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) =>
                    renderResultRow(item, () => { setSelectedDbFood(item); setQuantity('1'); }, index)
                  }
                />
              </>
            )}

            {modalTab === 'search' && selectedDbFood && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to results"
                  onPress={() => setSelectedDbFood(null)}
                  hitSlop={8}>
                  <Text style={styles.backToResults}>← Back to results</Text>
                </Pressable>
                <View style={styles.selectedFoodHeader}>
                  <Text style={styles.selectedFoodEmoji}>{getFoodEmoji(selectedDbFood.name, selectedDbFood.category)}</Text>
                  <Text style={styles.selectedFoodName}>{selectedDbFood.name}</Text>
                </View>
                <Text style={styles.resultServing}>1 serving = {selectedDbFood.servingLabel}</Text>
                <Field
                  label={t('quantityServings')}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="1"
                  keyboardType="numeric"
                />
                {scaledPreview && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewText}>{scaledPreview.calories} kcal</Text>
                    <Text style={styles.previewText}>P: {scaledPreview.protein}g</Text>
                    <Text style={styles.previewText}>C: {scaledPreview.carbs}g</Text>
                    <Text style={styles.previewText}>F: {scaledPreview.fat}g</Text>
                  </View>
                )}
                <View style={styles.modalButtons}>
                  <Button label={t('cancel')} onPress={closeModal} variant="secondary" style={styles.buttonFlex1} />
                  {/* addFromDatabase already no-ops on a non-positive quantity,
                      so disabling here only mirrors that guard visually. */}
                  <Button
                    label={t('addFood')}
                    onPress={addFromDatabase}
                    variant="primary"
                    disabled={quantityNum <= 0}
                    style={styles.buttonFlex2}
                  />
                </View>
              </>
            )}

            {modalTab === 'custom' && (
              <>
                {/* These inputs are placeholder-labelled by design, so they use
                    the Field input styling rather than the Field component. */}
                <TextInput
                  style={styles.input}
                  placeholder={t('foodNamePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={foodName}
                  onChangeText={setFoodName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Calories"
                  placeholderTextColor={colors.textMuted}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                />
                <View style={styles.macroInputRow}>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    placeholder="Protein (g)"
                    placeholderTextColor={colors.textMuted}
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    placeholder="Carbs (g)"
                    placeholderTextColor={colors.textMuted}
                    value={carbs}
                    onChangeText={setCarbs}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    placeholder="Fat (g)"
                    placeholderTextColor={colors.textMuted}
                    value={fat}
                    onChangeText={setFat}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.modalButtons}>
                  <Button label={t('cancel')} onPress={closeModal} variant="secondary" style={styles.buttonFlex1} />
                  {/* addCustomFood already returns early without a name or
                      calories — disabling just makes that visible. */}
                  <Button
                    label={t('addFood')}
                    onPress={addCustomFood}
                    variant="primary"
                    disabled={!foodName || !calories}
                    style={styles.buttonFlex2}
                  />
                </View>
              </>
            )}

            {modalTab === 'combine' && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.hintText}>
                  Search for foods to combine — e.g. add "chicken" and "pasta," then name the result.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Search ingredients to add"
                  placeholderTextColor={colors.textMuted}
                  value={combineQuery}
                  onChangeText={setCombineQuery}
                />
                {combineQuery.trim() !== '' && combineApiLoading && (
                  <View style={styles.searchingBlock}>
                    <Text style={styles.hintText}>Searching more foods...</Text>
                    <Shimmer width="100%" height={SEARCH_ROW_HEIGHT} style={styles.skeletonRow} />
                    <Shimmer width="100%" height={SEARCH_ROW_HEIGHT} style={styles.skeletonRow} />
                  </View>
                )}
                {combineQuery.trim() !== '' && (
                  <View style={styles.resultsListContent}>
                    {combineSearchResults.map((item, index) => (
                      <View key={item.id}>
                        {renderResultRow(item, () => { addIngredient(item); setCombineQuery(''); }, index)}
                      </View>
                    ))}
                  </View>
                )}

                <SectionTitle>Ingredients ({combineIngredients.length})</SectionTitle>
                {combineIngredients.length === 0 && (
                  <EmptyState
                    icon="🧺"
                    title="Nothing added yet"
                    message="Search above and tap a result."
                  />
                )}
                {combineIngredients.map(item => (
                  <View key={item.id} style={styles.ingredientRow}>
                    <Text style={styles.resultEmoji}>{getFoodEmoji(item.name, item.category)}</Text>
                    <Text style={styles.ingredientName}>{item.name}</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(item.quantity)}
                      onChangeText={(val) => updateIngredientQty(item.id, parseFloat(val) || 0)}
                      keyboardType="numeric"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name}`}
                      onPress={() => removeIngredient(item.id)}
                      hitSlop={8}>
                      <Text style={styles.deleteButton}>✕</Text>
                    </Pressable>
                  </View>
                ))}

                {combineIngredients.length > 0 && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewText}>{comboTotals.calories} kcal</Text>
                    <Text style={styles.previewText}>P: {comboTotals.protein}g</Text>
                    <Text style={styles.previewText}>C: {comboTotals.carbs}g</Text>
                    <Text style={styles.previewText}>F: {comboTotals.fat}g</Text>
                  </View>
                )}

                <View style={styles.comboNameField}>
                  <Field
                    label="Name this combo"
                    value={comboName}
                    onChangeText={setComboName}
                    placeholder={'e.g. "Nana\'s Pasta"'}
                  />
                </View>
                {/* Kept as its own line rather than Field's error slot: the
                    message can be about the ingredients, not the name. */}
                {comboError !== '' && <Text style={styles.error}>{comboError}</Text>}

                <View style={styles.modalButtons}>
                  <Button label={t('cancel')} onPress={closeModal} variant="secondary" style={styles.buttonFlex1} />
                  <Button
                    label={savingCombo ? 'Saving...' : 'Save & Log It'}
                    onPress={saveCombo}
                    variant="primary"
                    disabled={savingCombo || combineIngredients.length === 0 || !comboName.trim()}
                    style={styles.buttonFlex2}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    gap: layout.gap,
    paddingBottom: layout.bottomInset,
  },
  flexOne: {
    flex: 1,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  skeletonRow: {
    borderRadius: radius.md,
  },
  ringSkeleton: {
    borderRadius: RING_SIZE / 2,
  },
  ringCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  ringCaption: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...type.heading,
    color: colors.textPrimary,
  },
  sectionCount: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  macroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  macroBar: {
    gap: spacing.sm,
  },
  macroBarHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  macroBarLabel: {
    ...type.body,
    color: colors.textPrimary,
  },
  macroBarValue: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  // One card, N rows. Horizontal padding only — each row owns its vertical
  // padding so the hairlines run the height of the row.
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: {
    height: layout.hairline,
    backgroundColor: colors.divider,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  foodEmoji: {
    fontSize: 26,
  },
  foodLeft: {
    flex: 1,
  },
  foodName: {
    ...type.body,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  foodMacros: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  foodRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  foodCalories: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
  },
  deleteButton: {
    ...type.body,
    color: colors.danger,
    fontFamily: fontFamily.sansBold,
  },
  // The primary action floats over the scroll view, inset by the standard
  // screen gutter so it lines up with the cards behind it.
  fabWrap: {
    position: 'absolute',
    bottom: spacing.xxxl,
    left: layout.screenPadding,
    right: layout.screenPadding,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    // A bottom sheet only rounds its top corners; radius.xl on those two.
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: '85%',
  },
  modalTitle: {
    ...type.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    ...type.bodySm,
    color: colors.textSecondary,
    fontFamily: fontFamily.sansBold,
  },
  tabTextActive: {
    color: colors.textOnAccent,
  },
  hintText: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  searchingBlock: {
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  resultsList: {
    maxHeight: 260,
  },
  resultsListContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  resultRowPressed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  resultEmoji: {
    fontSize: 22,
  },
  resultName: {
    ...type.body,
    color: colors.textPrimary,
  },
  resultServing: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  resultCalories: {
    ...type.bodySm,
    color: colors.textSecondary,
    fontFamily: fontFamily.sansBold,
  },
  backToResults: {
    ...type.bodySm,
    color: colors.accent,
    fontFamily: fontFamily.sansBold,
    marginBottom: spacing.xs,
  },
  selectedFoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectedFoodEmoji: {
    fontSize: 28,
  },
  selectedFoodName: {
    ...type.heading,
    color: colors.textPrimary,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  previewText: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
  },
  // Mirrors the Field component's input exactly, for the placeholder-only
  // inputs that don't warrant a label.
  input: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.textPrimary,
    fontSize: 15,
  },
  macroInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  buttonFlex1: {
    flex: 1,
  },
  buttonFlex2: {
    flex: 2,
  },
  comboNameField: {
    marginTop: spacing.lg,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.divider,
  },
  ingredientName: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
    flex: 1,
  },
  qtyInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...type.bodySm,
    color: colors.textPrimary,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    width: 56,
    textAlign: 'center',
  },
  error: {
    ...type.bodySm,
    color: colors.danger,
    textAlign: 'center',
  },
});
