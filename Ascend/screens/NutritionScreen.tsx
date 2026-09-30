// NutritionScreen — MacroFactor-inspired layout.
//
// Top block: a single ROW where the calorie ring sits on the LEFT (large,
// no card around it, "Calorie remaining" label under the number), and the
// macro breakdown sits on the RIGHT as a stack of three rows. This matches
// the "Activity + Heart Rate" reference layout you shared: the primary
// metric on the left, secondary metrics stacked on the right.
//
// Under that is the food log — one card of hairline-separated rows — and
// the add-food modal. The modal is now FOUR tabs (Manual / Barcode / Custom
// / Picture) instead of the old two — see the modal section below for how
// each tab logs a food, and utils/foodHealth.ts for the health-score + XP
// math every tab shares regardless of which one logged the food.
//
// Uses the new usePalette() so this screen responds to light/dark toggle.

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  useWindowDimensions,
  Alert,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { getDoc, setDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, Palette } from '../theme/themedColors';
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
import { dayDocRef, getTodayKey, awardXP, incrementStatsField } from '../firebase/progress';
import { checkAchievementsForUser } from '../firebase/achievements';
import { celebrateAchievements } from '../utils/achievementAlert';
import { FOOD_DATABASE, FoodDatabaseItem } from '../data/foods';
import { searchUSDAFoods } from '../data/usdaFoodApi';
import BarcodeScanner from '../components/BarcodeScanner';
import AnimatedTabBar from '../components/AnimatedTabBar';
import SwipeToDelete from '../components/SwipeToDelete';
import Animated, { LinearTransition, FadeOutLeft } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getFoodEmoji } from '../data/foodEmoji';
import { useLanguage } from '../i18n/LanguageContext';
import { customFoodsDocRef, CustomFood } from '../firebase/customFoods';
import { safeGoBack } from '../utils/nav';
import { computeHealthScore, xpMultiplierForHealthScore, healthScoreColor } from '../utils/foodHealth';
import {
  recognizeFoodFromImage,
  recognizeFoodFromDescription,
  FoodRecognitionCandidate,
  FoodRecognitionNotConfiguredError,
} from '../services/foodRecognition';

type LoggedVia = 'manual' | 'barcode' | 'picture' | 'custom';

type FoodEntry = {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // Optional — only a barcode scan (Open Food Facts) or a Gemini-recognized
  // photo/description guess reliably has these; a manual/custom entry
  // usually won't.
  // utils/foodHealth.ts treats an absent field as neutral rather than 0.
  sugar?: number;
  fiber?: number;
  sodium?: number;
  // 0–100, computed once at log time via utils/foodHealth.ts and stored on
  // the entry so the "recently logged" list doesn't need to recompute it
  // (and so it stays stable even if the scoring formula changes later).
  healthScore: number;
  // Which tab logged this — drives the small method icon in the log list.
  loggedVia: LoggedVia;
  // Only set when loggedVia === 'custom' — an Ionicons name the user picked
  // for this food (see the icon grid in the Custom tab).
  customIcon?: string;
};

const DEFAULT_CALORIE_GOAL = 2000;
const SEARCH_ROW_HEIGHT = 64;

// Base XP for logging ANY food, before the health-score multiplier is
// applied (see utils/foodHealth.ts). Deliberately modest next to a quest's
// 10–75 XP (firebase/quests.ts's TIER_XP) — logging food happens many times
// a day, where a quest happens once, so the reward per-log has to be small
// enough that a day of eating doesn't out-earn a day of quests. The
// health-score multiplier (up to 3.5x) is what makes logging something
// genuinely nutritious worth meaningfully more than the floor.
const FOOD_LOG_BASE_XP = 6;

// Sane per-entry caps for the Custom tab's free-typed macros — generous
// enough to cover a legitimate huge meal (a full day's worth logged as one
// combo, a bulking-phase feast) while catching the actual failure mode:
// a stray extra digit ("5000" meant as "500") or pasting the wrong number
// into the wrong field, either of which would otherwise silently wreck that
// day's totals, the calorie-goal quest, and the adaptive-calorie math that
// reads logged intake as ground truth.
const MAX_CUSTOM_CALORIES = 5000;
const MAX_CUSTOM_MACRO_GRAMS = 500;

const DEFAULT_CUSTOM_ICON = 'restaurant-outline';
const CUSTOM_ICON_OPTIONS: string[] = [
  'restaurant-outline',
  'fast-food-outline',
  'pizza-outline',
  'nutrition-outline',
  'ice-cream-outline',
  'cafe-outline',
  'wine-outline',
  'beer-outline',
  'leaf-outline',
  'egg-outline',
];

// After this many consecutive no-match/failed photo attempts in one visit
// to the Picture tab, the recovery screen adds a stronger nudge toward
// manual entry instead of just quietly offering "Try again" forever — a
// couple of misses in a row usually means this food/photo isn't one the
// recognizer is going to get, and the honest move is to say so rather than
// let someone retry the same bad lighting five more times.
const PICTURE_SAFETY_THRESHOLD = 2;

const FOOD_TIPS = [
  'Center the food in frame',
  'Use good, even lighting',
  'Avoid cluttered backgrounds',
  'One dish at a time works best',
];

// ---- Overconsumption reference values ----
// WHO/FDA-style, commonly-cited daily figures for a typical adult: WHO
// recommends added sugar stay under ~10% of daily calories, which works out
// to roughly 50g/day on a 2000kcal diet; the FDA's sodium Daily Value is
// 2300mg/day. These are population-level guidelines for a nudge, not a
// personalized medical target.
const SUGAR_DAILY_REF_G = 50;
const SODIUM_DAILY_REF_MG = 2300;
// 80% of the reference already counts as "getting close" — waiting until
// the limit is actually crossed to say anything would make the warning
// useless for someone trying to stay under it.
const APPROACHING_THRESHOLD = 0.8;

type OverconsumptionWarning = { id: string; level: 'warning' | 'danger'; message: string };

function computeOverconsumptionWarnings(foodLog: FoodEntry[]): OverconsumptionWarning[] {
  const warnings: OverconsumptionWarning[] = [];
  const totalCalories = foodLog.reduce((sum, f) => sum + f.calories, 0);
  const totalSugar = foodLog.reduce((sum, f) => sum + (f.sugar || 0), 0);
  const totalSodium = foodLog.reduce((sum, f) => sum + (f.sodium || 0), 0);

  if (totalSugar >= SUGAR_DAILY_REF_G) {
    warnings.push({
      id: 'sugar',
      level: 'danger',
      message: `You've passed today's recommended sugar limit (${Math.round(totalSugar)}g of ~${SUGAR_DAILY_REF_G}g).`,
    });
  } else if (totalSugar >= SUGAR_DAILY_REF_G * APPROACHING_THRESHOLD) {
    warnings.push({ id: 'sugar', level: 'warning', message: "You're close to today's recommended sugar limit." });
  }

  if (totalSodium >= SODIUM_DAILY_REF_MG) {
    warnings.push({
      id: 'sodium',
      level: 'danger',
      message: `You've passed today's recommended sodium limit (${Math.round(totalSodium)}mg of ~${SODIUM_DAILY_REF_MG}mg).`,
    });
  } else if (totalSodium >= SODIUM_DAILY_REF_MG * APPROACHING_THRESHOLD) {
    warnings.push({ id: 'sodium', level: 'warning', message: "You're close to today's recommended sodium limit." });
  }

  // One food (by name) eating up more than half of today's calories so far —
  // flagged by name so a snack logged three times shows up even though no
  // single entry looks extreme on its own. The 400kcal floor keeps this from
  // firing on an otherwise-light day where "half of today's calories" is
  // still a perfectly small number.
  if (totalCalories > 0) {
    const caloriesByName = new Map<string, number>();
    for (const f of foodLog) caloriesByName.set(f.name, (caloriesByName.get(f.name) || 0) + f.calories);
    for (const [name, cals] of caloriesByName) {
      if (cals >= 400 && cals / totalCalories >= 0.5) {
        warnings.push({ id: `dominant-${name}`, level: 'warning', message: `"${name}" makes up over half of today's calories so far.` });
      }
    }
  }

  return warnings;
}

// Red→yellow→green across the score's range. The band decision itself lives
// in utils/foodHealth.ts's healthScoreColor (one shared threshold definition
// for the whole app); this just resolves that band name to this screen's
// live palette tokens rather than inventing new hardcoded colors.
function healthScoreTokens(score: number, palette: Palette) {
  const band = healthScoreColor(score);
  if (band === 'success') return { color: palette.success, soft: palette.successSoft };
  if (band === 'warning') return { color: palette.warning, soft: palette.warningSoft };
  return { color: palette.danger, soft: palette.dangerSoft };
}

function methodIcon(entry: Pick<FoodEntry, 'loggedVia' | 'customIcon'>): any {
  switch (entry.loggedVia) {
    case 'barcode': return 'barcode-outline';
    case 'picture': return 'camera-outline';
    case 'custom': return entry.customIcon || DEFAULT_CUSTOM_ICON;
    case 'manual':
    default:
      return 'search-outline';
  }
}

// Resizes to at most 1280px on the long edge (skipped if already smaller)
// and re-encodes as JPEG at ~0.7 quality — moderate compression, not
// aggressive, so the photo still gives Gemini enough detail to recognize
// the food while not uploading a full-resolution camera photo over mobile
// data every time someone logs a meal.
async function compressFoodPhoto(uri: string, width?: number, height?: number): Promise<string> {
  const MAX_EDGE = 1280;
  const longEdge = Math.max(width || 0, height || 0);
  const actions =
    longEdge > MAX_EDGE
      ? [(width || 0) >= (height || 0) ? { resize: { width: MAX_EDGE } } : { resize: { height: MAX_EDGE } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export default function NutritionScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const CALORIE_GOAL = profile?.calorieGoal || DEFAULT_CALORIE_GOAL;

  // The ring is deliberately BIG — it's the primary metric, dominating the
  // top of the screen. But a size tuned as a fixed pixel constant (this used
  // to be a flat 180) was tuned against ONE screen width. On an iPhone SE's
  // 375px width, after 32px of screen padding and the hero row's gap, a
  // fixed 180px ring left barely 140px for the ENTIRE macro column —
  // three labels, their gram counts, and their bars — which is what read
  // as "compressed" and could squeeze the bars down to nothing. Sizing off
  // the real window width keeps the ring at the same proportion of the
  // screen on every device instead of eating a bigger share on a smaller one.
  const { width: windowWidth } = useWindowDimensions();
  const heroContentWidth = windowWidth - layout.screenPadding * 2;
  // Ring gets at most 40% of the row, and never wider than it needs to be:
  // capped at 180 (the original design size) so it doesn't balloon on a
  // tablet, and floored at 120 so it's never too small to read on any
  // phone this app supports.
  const RING_SIZE = Math.max(120, Math.min(180, heroContentWidth * 0.4));
  // This has been through three failed theories for why the ring overlaps
  // "Calories" on a real device (missing lineHeight, insufficient stroke-cap
  // clearance, accessibility text scaling — the last one disproven by
  // testing with Larger/Bold Text OFF). None of the modest, reasoned gap
  // values survived contact with the actual device. Rather than tune a
  // fourth precise-but-fragile number, this is deliberately oversized —
  // 40px, more than triple the largest gap already tried — so the fix no
  // longer depends on correctly guessing the exact mechanism.
  const RING_TOP_GAP = 40;
  const [loading, setLoading] = useState(true);

  const loadedDayKeyRef = useRef<string>(getTodayKey());
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'barcode' | 'custom' | 'picture'>('manual');
  const [scannerVisible, setScannerVisible] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<FoodDatabaseItem[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  // ---- Manual tab: "Describe your meal" (Gemini text recognition) ----
  // A second mode within the Manual tab, alongside the search-by-name list —
  // not a fifth top-level tab — since it's still "manually telling the app
  // what you ate", just via a sentence instead of a name lookup. Reuses the
  // same ranked-candidates + "Not this food?" flow the Picture tab already
  // has (FoodCandidateCard, below) rather than duplicating that UI.
  const [manualMode, setManualMode] = useState<'search' | 'describe'>('search');
  const [descriptionText, setDescriptionText] = useState('');
  const [descriptionStage, setDescriptionStage] = useState<'input' | 'result'>('input');
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionCandidates, setDescriptionCandidates] = useState<FoodRecognitionCandidate[]>([]);
  const [descriptionCandidateIndex, setDescriptionCandidateIndex] = useState(0);
  const [descriptionError, setDescriptionError] = useState<'not-configured' | 'failed' | 'no-match' | null>(null);

  const [customName, setCustomName] = useState('');
  const [customCal, setCustomCal] = useState('');
  const [customP, setCustomP] = useState('');
  const [customC, setCustomC] = useState('');
  const [customF, setCustomF] = useState('');
  const [customIcon, setCustomIcon] = useState(DEFAULT_CUSTOM_ICON);
  const [customErrors, setCustomErrors] = useState<{ name?: string; cal?: string; p?: string; c?: string; f?: string }>({});

  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);

  // ---- Picture tab state ----
  const [pictureStage, setPictureStage] = useState<'tips' | 'result'>('tips');
  const [pictureLoading, setPictureLoading] = useState(false);
  const [pictureCandidates, setPictureCandidates] = useState<FoodRecognitionCandidate[]>([]);
  const [pictureCandidateIndex, setPictureCandidateIndex] = useState(0);
  const [pictureError, setPictureError] = useState<'not-configured' | 'failed' | 'no-match' | null>(null);
  // Consecutive no-match/failed attempts within this modal visit — resets
  // the moment a photo actually recognizes something or the tab/modal
  // closes. Past PICTURE_SAFETY_THRESHOLD, the no-match/failed screens add a
  // stronger nudge toward manual entry rather than just quietly offering
  // "Try again" forever, since a few misses in a row usually means this
  // particular food/lighting isn't one the recognizer is going to get.
  const [pictureAttempts, setPictureAttempts] = useState(0);

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

  const overconsumptionWarnings = computeOverconsumptionWarnings(foodLog);

  // Macro goals in grams — the standard 30/40/30 split of the calorie goal.
  // (Protein calories: 4/g, carbs: 4/g, fat: 9/g.)
  const proteinGoal = Math.round((CALORIE_GOAL * 0.30) / 4);
  const carbsGoal   = Math.round((CALORIE_GOAL * 0.40) / 4);
  const fatGoal     = Math.round((CALORIE_GOAL * 0.30) / 9);

  // ---- Add food ----
  // Every tab funnels through here — this is the ONE place that computes the
  // health score, writes the Firestore day-doc, and awards XP, so all four
  // logging paths reward and record identically.
  async function addFood(item: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar?: number;
    fiber?: number;
    sodium?: number;
    loggedVia: LoggedVia;
    customIcon?: string;
  }) {
    if (!authUser) return;
    const healthScore = computeHealthScore({
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      sugar: item.sugar,
      fiber: item.fiber,
      sodium: item.sodium,
    });
    // Firestore rejects a field explicitly set to `undefined` (throws
    // invalid-argument on the whole write, not just that field) — and
    // `item.sugar`/`fiber`/`sodium`/`customIcon` really can be `undefined`
    // rather than simply absent, since they're carried through from
    // optional fields on the search/barcode/photo result. Spreading `item`
    // would keep those keys present with an `undefined` value, so each
    // optional field is only added when it actually has a value.
    const newEntry: FoodEntry = {
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      loggedVia: item.loggedVia,
      ...(item.sugar === undefined ? {} : { sugar: item.sugar }),
      ...(item.fiber === undefined ? {} : { fiber: item.fiber }),
      ...(item.sodium === undefined ? {} : { sodium: item.sodium }),
      ...(item.customIcon === undefined ? {} : { customIcon: item.customIcon }),
      id: Date.now(),
      healthScore,
    };
    const updated = [...foodLog, newEntry];
    setFoodLog(updated);
    haptics.setComplete();
    await setDoc(dayDocRef(authUser.uid), { foodLog: updated }, { merge: true });

    // XP: base amount scaled by how healthy the food was (see
    // utils/foodHealth.ts). awardXP is a stable, self-contained transaction —
    // this only ever calls it with a final number, never touches leveling
    // logic itself.
    const multiplier = xpMultiplierForHealthScore(healthScore);
    const gainedXP = Math.round(FOOD_LOG_BASE_XP * multiplier);
    try {
      await awardXP(authUser.uid, gainedXP);
    } catch {
      // The log itself already saved — an XP award failure here shouldn't
      // roll that back or interrupt the flow, same reasoning
      // DashboardScreen's completeQuests follows for its own awardXP call.
    }
    try {
      await incrementStatsField(authUser.uid, 'totalFoodLogged', 1);
      celebrateAchievements(await checkAchievementsForUser(authUser.uid));
    } catch {
      // Same reasoning as the XP award above — the food log itself already
      // saved, so a failure here is just a missed achievement check, not
      // lost data.
    }
  }

  async function deleteFood(id: number) {
    if (!authUser) return;
    const updated = foodLog.filter(f => f.id !== id);
    setFoodLog(updated);
    haptics.selection();
    await setDoc(dayDocRef(authUser.uid), { foodLog: updated }, { merge: true });
  }

  // ---- Search (Manual tab) ----
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
      // usdaFoodApi already folds each result's brand into its name (so
      // "ICE CREAM" ×23 becomes "Ice Cream (Blue Bunny)", "Ice Cream (Edy's)",
      // etc. — those are real, distinct products, not spam). But USDA quite
      // often ALSO lists the exact same brand+description more than once —
      // "Ketchup (First Street)" 5 times, "Ice Cream (Great Value)" twice —
      // as separate size/lot entries with no name USDA gives us to tell them
      // apart. Deduping on name+macros (an earlier version of this fix) let
      // those through, since their nutrition differs slightly: two rows that
      // read identically to the user but silently carry different numbers is
      // the same "which one do I pick" confusion as the original bug, just
      // one brand deep instead of the whole search. Since there is nothing
      // left to distinguish them BY, name alone is the right dedupe key here
      // — collapse to one representative (USDA's own relevance ranking
      // already put the best match first) rather than show two rows a user
      // cannot tell apart by reading them.
      const seen = new Set<string>();
      const deduped = results.filter(item => {
        const key = item.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setApiResults(deduped);
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

  function pickResult(item: FoodDatabaseItem, loggedVia: 'manual' | 'barcode') {
    addFood({
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      sugar: item.sugar,
      fiber: item.fiber,
      sodium: item.sodium,
      loggedVia,
    });
    setSearchQuery('');
    closeModal();
  }

  function submitCustom() {
    const cal = parseFloat(customCal);
    const p = customP.trim() === '' ? 0 : parseFloat(customP);
    const c = customC.trim() === '' ? 0 : parseFloat(customC);
    const f = customF.trim() === '' ? 0 : parseFloat(customF);

    const errors: typeof customErrors = {};
    if (!customName.trim()) errors.name = 'Give it a name.';
    if (!Number.isFinite(cal) || cal < 0) errors.cal = 'Enter a valid number.';
    else if (cal > MAX_CUSTOM_CALORIES) errors.cal = `Keep it under ${MAX_CUSTOM_CALORIES.toLocaleString()}.`;
    if (!Number.isFinite(p) || p < 0) errors.p = 'Invalid';
    else if (p > MAX_CUSTOM_MACRO_GRAMS) errors.p = `Max ${MAX_CUSTOM_MACRO_GRAMS}g`;
    if (!Number.isFinite(c) || c < 0) errors.c = 'Invalid';
    else if (c > MAX_CUSTOM_MACRO_GRAMS) errors.c = `Max ${MAX_CUSTOM_MACRO_GRAMS}g`;
    if (!Number.isFinite(f) || f < 0) errors.f = 'Invalid';
    else if (f > MAX_CUSTOM_MACRO_GRAMS) errors.f = `Max ${MAX_CUSTOM_MACRO_GRAMS}g`;

    setCustomErrors(errors);
    if (Object.keys(errors).length > 0) {
      haptics.selection();
      return;
    }

    addFood({
      name: customName.trim(),
      calories: Math.round(cal),
      protein: Math.round(p),
      carbs:   Math.round(c),
      fat:     Math.round(f),
      loggedVia: 'custom',
      customIcon,
    });
    saveRecentCustomFood({
      id: `${Date.now()}`,
      name: customName.trim(),
      servingLabel: '',
      calories: Math.round(cal),
      protein: Math.round(p),
      carbs: Math.round(c),
      fat: Math.round(f),
      ingredients: [],
    });
    setCustomName(''); setCustomCal(''); setCustomP(''); setCustomC(''); setCustomF('');
    setCustomIcon(DEFAULT_CUSTOM_ICON);
    setCustomErrors({});
    closeModal();
  }

  // Keeps the Custom tab's "Recent" shortcuts capped at the 3 most recently
  // logged custom foods, most-recent-first. Re-logging something already in
  // the list moves it back to the front instead of appending a duplicate —
  // logging "Protein shake" three days running should still show ONE row for
  // it, not fill the whole cap with the same name.
  function saveRecentCustomFood(entry: CustomFood) {
    if (!authUser) return;
    const deduped = customFoods.filter(f => f.name.toLowerCase() !== entry.name.toLowerCase());
    const updated = [entry, ...deduped].slice(0, 3);
    setCustomFoods(updated);
    setDoc(customFoodsDocRef(authUser.uid), { foods: updated }).catch(() => {
      // Best-effort — the shortcut list is a convenience, not data the rest
      // of the app depends on; a failed write just means next load shows the
      // pre-update list instead of retrying.
    });
  }

  function logRecentCustomFood(food: CustomFood) {
    addFood({
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      loggedVia: 'custom',
    });
    // Re-logging it is itself a "use" — bump it back to the front of Recent
    // rather than leaving it wherever it was (or letting it fall off the
    // 3-item cap while it's actually the thing being used right now).
    saveRecentCustomFood(food);
    closeModal();
  }

  // ---- Picture tab ----
  function resetPictureTab() {
    setPictureStage('tips');
    setPictureLoading(false);
    setPictureCandidates([]);
    setPictureCandidateIndex(0);
    setPictureError(null);
    setPictureAttempts(0);
  }

  async function openCameraForPicture() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // Same pattern EditProfileScreen/OnboardingScreen use for a denied
      // photo-library permission: a clear Alert rather than failing
      // silently, with a way to actually fix it when the OS won't ask again.
      if (!permission.canAskAgain) {
        Alert.alert(
          'Camera access needed',
          'UpShift needs your camera to recognize food from a photo. Enable camera access for UpShift in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('Camera access needed', 'UpShift needs your camera to recognize food from a photo.');
      }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    await processFoodPhoto(result.assets[0]);
  }

  async function processFoodPhoto(asset: ImagePicker.ImagePickerAsset) {
    setPictureLoading(true);
    setPictureError(null);
    try {
      const compressedUri = await compressFoodPhoto(asset.uri, asset.width, asset.height);
      const candidates = await recognizeFoodFromImage(compressedUri);
      if (candidates.length === 0) {
        setPictureError('no-match');
        setPictureAttempts(n => n + 1);
      } else {
        setPictureCandidates(candidates);
        setPictureCandidateIndex(0);
        setPictureStage('result');
        setPictureAttempts(0);
      }
    } catch (err) {
      if (err instanceof FoodRecognitionNotConfiguredError) {
        setPictureError('not-configured');
      } else {
        setPictureError('failed');
        setPictureAttempts(n => n + 1);
      }
    } finally {
      setPictureLoading(false);
    }
  }

  function nextPictureCandidate() {
    haptics.selection();
    if (pictureCandidateIndex + 1 < pictureCandidates.length) {
      setPictureCandidateIndex(i => i + 1);
    } else {
      // Out of guesses — fall back to Manual, same as a genuine no-match.
      setPictureError('no-match');
      setPictureAttempts(n => n + 1);
    }
  }

  function confirmPictureCandidate() {
    const candidate = pictureCandidates[pictureCandidateIndex];
    if (!candidate) return;
    addFood({
      name: candidate.name,
      calories: candidate.calories ?? 0,
      protein: candidate.protein ?? 0,
      carbs: candidate.carbs ?? 0,
      fat: candidate.fat ?? 0,
      sugar: candidate.sugar,
      fiber: candidate.fiber,
      sodium: candidate.sodium,
      loggedVia: 'picture',
    });
    closeModal();
  }

  function goToManualFromPicture() {
    resetPictureTab();
    setActiveTab('manual');
  }

  // ---- Manual tab: "Describe your meal" ----
  function resetDescriptionTab() {
    setManualMode('search');
    setDescriptionText('');
    setDescriptionStage('input');
    setDescriptionLoading(false);
    setDescriptionCandidates([]);
    setDescriptionCandidateIndex(0);
    setDescriptionError(null);
  }

  async function submitDescription() {
    const text = descriptionText.trim();
    if (!text) return;
    setDescriptionLoading(true);
    setDescriptionError(null);
    try {
      const candidates = await recognizeFoodFromDescription(text);
      if (candidates.length === 0) {
        setDescriptionError('no-match');
      } else {
        setDescriptionCandidates(candidates);
        setDescriptionCandidateIndex(0);
        setDescriptionStage('result');
      }
    } catch (err) {
      if (err instanceof FoodRecognitionNotConfiguredError) {
        setDescriptionError('not-configured');
      } else {
        setDescriptionError('failed');
      }
    } finally {
      setDescriptionLoading(false);
    }
  }

  function nextDescriptionCandidate() {
    haptics.selection();
    if (descriptionCandidateIndex + 1 < descriptionCandidates.length) {
      setDescriptionCandidateIndex(i => i + 1);
    } else {
      // Out of guesses — same "back to a plainer fallback" behavior the
      // Picture tab uses when its own guesses run out.
      setDescriptionError('no-match');
    }
  }

  function confirmDescriptionCandidate() {
    const candidate = descriptionCandidates[descriptionCandidateIndex];
    if (!candidate) return;
    addFood({
      name: candidate.name,
      calories: candidate.calories ?? 0,
      protein: candidate.protein ?? 0,
      carbs: candidate.carbs ?? 0,
      fat: candidate.fat ?? 0,
      sugar: candidate.sugar,
      fiber: candidate.fiber,
      sodium: candidate.sodium,
      loggedVia: 'manual',
    });
    closeModal();
  }

  function closeModal() {
    setModalVisible(false);
    resetPictureTab();
    resetDescriptionTab();
    setCustomErrors({});
  }

  // ---- Render ----
  // Unclamped on purpose — CalorieRing's own arc clamps visually at full,
  // but its NUMBER is designed to keep counting past goal (see the
  // component's own comment: "a ring can't draw past full... silently
  // clamping both would be the app lying about what you ate"). Flooring
  // this at 0 would hide a real over-budget day behind a cheerful "0
  // remaining" instead of the honest "-150".
  const caloriesRemaining = CALORIE_GOAL - totalCalories;

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Screen scroll contentStyle={styles.container}>
        <AppBar title={t('nutrition')} onBack={() => safeGoBack(navigation)} />

        {/* HERO ROW — big ring left, macro stack right. */}
        <Enter index={0}>
          <View style={styles.hero}>
            {/* LEFT: The ring itself. CalorieRing already draws its own
                centered number + "of {goal} kcal" caption internally — an
                earlier version of this screen ALSO layered custom text on
                top of it, which produced two overlapping numbers and a
                duplicated caption. Fixed by removing the overlay entirely
                and feeding the ring the REMAINING value (not consumed),
                so its own built-in number reads correctly as "calories
                remaining" without any extra markup. The one thing that
                genuinely lives outside the ring is the section header
                above it. */}
            <View style={[styles.ringWrap, { width: RING_SIZE }]}>
              <Text
                style={[styles.ringHeader, { color: palette.textPrimary }]}
                maxFontSizeMultiplier={1.3}>
                Calories
              </Text>
              {loading
                ? <Shimmer width={RING_SIZE} height={RING_SIZE} radius={RING_SIZE / 2} style={{ marginTop: RING_TOP_GAP }} />
                : (
                  <View style={{ marginTop: RING_TOP_GAP }}>
                    <CalorieRing
                      value={totalCalories}
                      goal={CALORIE_GOAL}
                      size={RING_SIZE}
                      caption={
                        caloriesRemaining >= 0
                          ? `${Math.round(caloriesRemaining).toLocaleString()} left`
                          : `${Math.round(Math.abs(caloriesRemaining)).toLocaleString()} over`
                      }
                    />
                  </View>
                )}
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

        {/* Overconsumption warnings — never blocks logging, just a heads up.
            See computeOverconsumptionWarnings above for the reference values
            and reasoning. */}
        {overconsumptionWarnings.length > 0 && (
          <Enter index={1}>
            <View style={styles.warningStack}>
              {overconsumptionWarnings.map(w => {
                const color = w.level === 'danger' ? palette.danger : palette.warning;
                const soft = w.level === 'danger' ? palette.dangerSoft : palette.warningSoft;
                return (
                  <View key={w.id} style={[styles.warningBanner, { backgroundColor: soft, borderColor: color }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={color} />
                    <Text style={[styles.warningText, { color }]}>{w.message}</Text>
                  </View>
                );
              })}
            </View>
          </Enter>
        )}

        {/* Food log — doubles as "recently logged": once at least one food
            is logged today, each row shows its health score and a small
            icon for how it was logged, instead of a separate duplicate
            list showing the same entries. */}
        <Enter index={2}>
          <View style={styles.logHeader}>
            <Text style={[styles.logTitle, { color: palette.textPrimary }]}>
              {foodLog.length === 0 ? "Today's food" : 'Recently logged'}
            </Text>
            <Text style={[styles.logCount, { color: palette.textMuted }]}>
              {foodLog.length} {foodLog.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </Enter>

        <Enter index={3}>
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
              foodLog.map((item, index) => {
                const tokens = healthScoreTokens(item.healthScore, palette);
                return (
                  <Animated.View key={item.id} layout={LinearTransition.duration(220)} exiting={FadeOutLeft.duration(200)}>
                    {index > 0 && <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />}
                    <SwipeToDelete
                      onDelete={() => deleteFood(item.id)}
                      palette={palette}
                      deleteLabel={`Delete ${item.name}`}
                      rowBackgroundColor={palette.surface}
                      rounded={false}>
                      <View style={styles.foodRow}>
                        <View style={styles.foodIconStack}>
                          <Text style={styles.foodEmoji}>{getFoodEmoji(item.name)}</Text>
                          <Ionicons name={methodIcon(item)} size={12} color={palette.textMuted} />
                        </View>
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
                          <View style={[styles.healthChip, { backgroundColor: tokens.soft, borderColor: tokens.color }]}>
                            <Text style={[styles.healthChipText, { color: tokens.color }]}>{item.healthScore}/100</Text>
                          </View>
                        </View>
                      </View>
                    </SwipeToDelete>
                  </Animated.View>
                );
              })
            )}
          </View>
        </Enter>
      </Screen>

      {/* Floating add-food button */}
      <View style={styles.fabWrap}>
        <Button label={t('add_food')} onPress={() => setModalVisible(true)} variant="primary" fullWidth />
      </View>

      {/* Add food modal — four tabs, all funneling into addFood(). */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        {/* This modal is full-screen, and three of its four tabs (Manual
            search, Custom, Describe) have a text field a user can focus —
            without this, the keyboard just overlays the bottom of the
            screen on top of whatever's there (often the field itself, or
            the Add/Log button right below it) instead of the content
            resizing to make room. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalOverlay, { backgroundColor: palette.scrim }]}>
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>Log Food</Text>
              <Pressable onPress={closeModal} hitSlop={12}>
                <Text style={[styles.modalClose, { color: palette.textSecondary }]}>Done</Text>
              </Pressable>
            </View>

            <AnimatedTabBar
              tabs={[
                { key: 'manual', label: 'Manual' },
                { key: 'barcode', label: 'Barcode' },
                { key: 'custom', label: 'Custom' },
                { key: 'picture', label: 'Picture' },
              ]}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as typeof activeTab)}
              palette={palette}
            />

            {activeTab === 'manual' && (
              manualMode === 'describe' ? (
                <View style={{ flex: 1 }}>
                  {descriptionError === 'not-configured' ? (
                    <View style={styles.tabMessageBox}>
                      <Ionicons name="sparkles-outline" size={36} color={palette.textMuted} />
                      <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>
                        Meal description isn't set up yet
                      </Text>
                      <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                        Search for it by name instead.
                      </Text>
                      <Button label="Back to search" onPress={resetDescriptionTab} variant="secondary" />
                    </View>
                  ) : descriptionError === 'no-match' ? (
                    <View style={styles.tabMessageBox}>
                      <Ionicons name="help-circle-outline" size={36} color={palette.textMuted} />
                      <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>Couldn't match that</Text>
                      <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                        Try describing it differently, or search by name instead.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button label="Try again" onPress={() => { setDescriptionError(null); setDescriptionStage('input'); }} variant="secondary" size="sm" />
                        <Button label="Search" onPress={resetDescriptionTab} variant="ghost" size="sm" />
                      </View>
                    </View>
                  ) : descriptionError === 'failed' ? (
                    <View style={styles.tabMessageBox}>
                      <Ionicons name="alert-circle-outline" size={36} color={palette.danger} />
                      <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>Couldn't estimate that</Text>
                      <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                        Try again, or search by name instead.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button label="Try again" onPress={() => { setDescriptionError(null); setDescriptionStage('input'); }} variant="secondary" size="sm" />
                        <Button label="Search" onPress={resetDescriptionTab} variant="ghost" size="sm" />
                      </View>
                    </View>
                  ) : descriptionLoading ? (
                    <View style={styles.tabMessageBox}>
                      <ActivityIndicator color={palette.accent} />
                      <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>Estimating nutrition…</Text>
                    </View>
                  ) : descriptionStage === 'result' && descriptionCandidates[descriptionCandidateIndex] ? (
                    <FoodCandidateCard
                      candidate={descriptionCandidates[descriptionCandidateIndex]}
                      hasMore={descriptionCandidateIndex + 1 < descriptionCandidates.length}
                      onConfirm={confirmDescriptionCandidate}
                      onNotThis={nextDescriptionCandidate}
                      palette={palette}
                    />
                  ) : (
                    // Scrollable, not a plain View — the multiline field
                    // below can grow to several lines, and on a shorter
                    // phone the keyboard shrinking this modal's available
                    // height could otherwise push "Estimate nutrition"
                    // (or, typing enough, the field itself) past the bottom
                    // of the screen with no way to reach it. Scrolling is
                    // what makes "everything below the fold" still reachable
                    // instead of the layout just hoping it fits.
                    <ScrollView
                      contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.md }}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}>
                      <Pressable
                        onPress={resetDescriptionTab}
                        hitSlop={8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Ionicons name="arrow-back" size={16} color={palette.textSecondary} />
                        <Text style={[styles.tabMessageBody, { color: palette.textSecondary }]}>Back to search</Text>
                      </Pressable>
                      <Text style={[styles.tipsTitle, { color: palette.textPrimary }]}>Describe your meal</Text>
                      <Text style={[styles.tabMessageBody, { color: palette.textMuted, textAlign: 'left' }]}>
                        e.g. "grilled chicken breast with rice and broccoli"
                      </Text>
                      <TextInput
                        style={[
                          styles.descriptionInput,
                          { backgroundColor: palette.surface, borderColor: palette.border, color: palette.textPrimary },
                        ]}
                        value={descriptionText}
                        onChangeText={setDescriptionText}
                        placeholder="What did you eat?"
                        placeholderTextColor={palette.textMuted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        // Without these two, the mobile keyboard's return key
                        // on a multiline field defaults to `blurOnSubmit`
                        // (true on some RN/keyboard combinations even though
                        // this field never sets onSubmitEditing) — the field
                        // loses focus and blur bubbling inside this modal's
                        // gesture handling is what closed the whole "Log
                        // Food" sheet instead of just dismissing the
                        // keyboard. returnKeyType="default" keeps the key
                        // itself labeled as a plain newline (not "Done"/"Go"),
                        // and blurOnSubmit={false} stops it from blurring at
                        // all — Enter now only ever inserts a line break,
                        // never submits or closes anything.
                        returnKeyType="default"
                        blurOnSubmit={false}
                      />
                      <Button label="Estimate nutrition" onPress={submitDescription} variant="primary" fullWidth />
                    </ScrollView>
                  )}
                </View>
              ) : (
                <>
                  <Field
                    label="Food"
                    placeholder="e.g. chicken breast"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item, i) => `${item.id}-${i}`}
                    keyboardShouldPersistTaps="handled"
                    style={{ flex: 1 }}
                    ListHeaderComponent={
                      <Pressable
                        onPress={() => { haptics.selection(); setManualMode('describe'); }}
                        style={({ pressed }) => [
                          styles.describeLink,
                          pressed && { opacity: 0.6 },
                        ]}>
                        <Ionicons name="sparkles-outline" size={14} color={palette.accent} />
                        <Text style={[styles.describeLinkText, { color: palette.accent }]}>
                          Can't find it? Describe your meal
                        </Text>
                      </Pressable>
                    }
                    ListEmptyComponent={
                      <Text style={[styles.emptyBody, { color: palette.textMuted, padding: spacing.lg }]}>
                        {apiLoading ? 'Searching…' : searchQuery.trim() ? 'No matches — try a broader term.' : 'Type to search foods.'}
                      </Text>
                    }
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => pickResult(item, 'manual')}
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
              )
            )}

            {activeTab === 'barcode' && (
              <View style={styles.tabMessageBox}>
                <Ionicons name="barcode-outline" size={40} color={palette.textMuted} />
                <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>Scan a packaged food</Text>
                <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                  Line up the barcode on the package and we'll look up its nutrition.
                </Text>
                <Button
                  label="Open scanner"
                  onPress={() => { haptics.selection(); setScannerVisible(true); }}
                  variant="primary"
                />
              </View>
            )}

            {activeTab === 'custom' && (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
                {/* Capped at 3 and only rendered when there's something to
                    show — no empty "Recent" header on a first-ever custom
                    log, and no growing list past the 3 most recent (see
                    saveRecentCustomFood). Tapping one logs it immediately
                    with its saved macros, skipping the form entirely. */}
                {customFoods.length > 0 && (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={[styles.iconGridLabel, { color: palette.textMuted }]}>RECENT</Text>
                    {customFoods.map(food => (
                      <Pressable
                        key={food.id}
                        onPress={() => { haptics.selection(); logRecentCustomFood(food); }}
                        style={({ pressed }) => [
                          styles.recentCustomRow,
                          { backgroundColor: palette.surfaceSunken, borderColor: palette.border },
                          pressed && { opacity: 0.7 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Log ${food.name} again, ${food.calories} calories`}>
                        <Text style={[styles.recentCustomName, { color: palette.textPrimary }]} numberOfLines={1}>
                          {food.name}
                        </Text>
                        <Text style={[styles.recentCustomMacros, { color: palette.textMuted }]}>
                          {food.calories} kcal
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Field
                  label="Name"
                  value={customName}
                  onChangeText={t => { setCustomName(t); if (customErrors.name) setCustomErrors(e => ({ ...e, name: undefined })); }}
                  placeholder="Homemade smoothie"
                  error={customErrors.name}
                />
                <Field
                  label="Calories"
                  value={customCal}
                  onChangeText={t => { setCustomCal(t); if (customErrors.cal) setCustomErrors(e => ({ ...e, cal: undefined })); }}
                  placeholder="350"
                  keyboardType="numeric"
                  error={customErrors.cal}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="P (g)"
                      value={customP}
                      onChangeText={t => { setCustomP(t); if (customErrors.p) setCustomErrors(e => ({ ...e, p: undefined })); }}
                      keyboardType="numeric"
                      error={customErrors.p}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="C (g)"
                      value={customC}
                      onChangeText={t => { setCustomC(t); if (customErrors.c) setCustomErrors(e => ({ ...e, c: undefined })); }}
                      keyboardType="numeric"
                      error={customErrors.c}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="F (g)"
                      value={customF}
                      onChangeText={t => { setCustomF(t); if (customErrors.f) setCustomErrors(e => ({ ...e, f: undefined })); }}
                      keyboardType="numeric"
                      error={customErrors.f}
                    />
                  </View>
                </View>

                <View>
                  <Text style={[styles.iconGridLabel, { color: palette.textMuted }]}>Icon</Text>
                  <View style={styles.iconGrid}>
                    {CUSTOM_ICON_OPTIONS.map(icon => {
                      const selected = customIcon === icon;
                      return (
                        <Pressable
                          key={icon}
                          onPress={() => { haptics.selection(); setCustomIcon(icon); }}
                          accessibilityRole="radio"
                          accessibilityLabel={icon.replace('-outline', '')}
                          accessibilityState={{ selected }}
                          style={[
                            styles.iconSwatch,
                            {
                              backgroundColor: selected ? palette.accentSoft : palette.surfaceSunken,
                              borderColor: selected ? palette.accent : palette.border,
                            },
                          ]}>
                          <Ionicons name={icon as any} size={20} color={selected ? palette.accent : palette.textSecondary} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Button label="Add" onPress={submitCustom} variant="primary" fullWidth />
              </ScrollView>
            )}

            {activeTab === 'picture' && (
              <View style={{ flex: 1 }}>
                {pictureError === 'not-configured' ? (
                  <View style={styles.tabMessageBox}>
                    <Ionicons name="camera-outline" size={36} color={palette.textMuted} />
                    <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>
                      Food photo recognition isn't set up yet
                    </Text>
                    <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                      Log this manually for now.
                    </Text>
                    <Button label="Go to Manual" onPress={goToManualFromPicture} variant="secondary" />
                  </View>
                ) : pictureError === 'no-match' ? (
                  <View style={styles.tabMessageBox}>
                    <Ionicons name="help-circle-outline" size={36} color={palette.textMuted} />
                    <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>Couldn't find a match</Text>
                    <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                      {pictureAttempts >= PICTURE_SAFETY_THRESHOLD
                        ? "A few tries in a row haven't found it — this one's probably faster to enter by hand."
                        : 'Rescan the photo, or search/enter it manually instead.'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      {pictureAttempts < PICTURE_SAFETY_THRESHOLD && (
                        <Button label="Rescan" onPress={() => { setPictureError(null); setPictureStage('tips'); }} variant="secondary" size="sm" />
                      )}
                      <Button
                        label="Enter manually"
                        onPress={goToManualFromPicture}
                        variant={pictureAttempts >= PICTURE_SAFETY_THRESHOLD ? 'primary' : 'ghost'}
                        size="sm"
                      />
                    </View>
                  </View>
                ) : pictureError === 'failed' ? (
                  <View style={styles.tabMessageBox}>
                    <Ionicons name="alert-circle-outline" size={36} color={palette.danger} />
                    <Text style={[styles.tabMessageTitle, { color: palette.textPrimary }]}>Couldn't analyze that photo</Text>
                    <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>
                      {pictureAttempts >= PICTURE_SAFETY_THRESHOLD
                        ? "Still not working after a few tries — let's log it manually instead."
                        : 'Rescan the photo, or log it manually.'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      {pictureAttempts < PICTURE_SAFETY_THRESHOLD && (
                        <Button label="Rescan" onPress={() => { setPictureError(null); setPictureStage('tips'); }} variant="secondary" size="sm" />
                      )}
                      <Button
                        label="Enter manually"
                        onPress={goToManualFromPicture}
                        variant={pictureAttempts >= PICTURE_SAFETY_THRESHOLD ? 'primary' : 'ghost'}
                        size="sm"
                      />
                    </View>
                  </View>
                ) : pictureLoading ? (
                  <View style={styles.tabMessageBox}>
                    <ActivityIndicator color={palette.accent} />
                    <Text style={[styles.tabMessageBody, { color: palette.textMuted }]}>Analyzing photo…</Text>
                  </View>
                ) : pictureStage === 'result' && pictureCandidates[pictureCandidateIndex] ? (
                  <FoodCandidateCard
                    candidate={pictureCandidates[pictureCandidateIndex]}
                    hasMore={pictureCandidateIndex + 1 < pictureCandidates.length}
                    onConfirm={confirmPictureCandidate}
                    onNotThis={nextPictureCandidate}
                    palette={palette}
                  />
                ) : (
                  <View style={styles.tipsCard}>
                    <Text style={[styles.tipsTitle, { color: palette.textPrimary }]}>Tips for best results</Text>
                    {FOOD_TIPS.map(tip => (
                      <View key={tip} style={styles.tipRow}>
                        <Ionicons name="checkmark-circle" size={16} color={palette.accent} />
                        <Text style={[styles.tipText, { color: palette.textSecondary }]}>{tip}</Text>
                      </View>
                    ))}
                    <Button label="Got it, open camera" onPress={openCameraForPicture} variant="primary" fullWidth />
                  </View>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Conditionally MOUNTED, not just visible-toggled — BarcodeScanner
          renders its own <Modal>, and react-native-web disables pointer
          events on a background Modal when a second one is mounted on top
          of it (even at visible={false}). Since the scanner can only ever
          open from inside the already-open add-food Modal above, both would
          otherwise be mounted at once and the scanner's camera/buttons
          would silently stop responding to taps — see DashboardScreen's
          WeightPromptModal/BedtimePromptModal for the same fix. */}
      {scannerVisible && (
        <BarcodeScanner
          visible
          onClose={() => setScannerVisible(false)}
          onFound={(item) => { setScannerVisible(false); pickResult(item, 'barcode'); }}
          palette={palette}
        />
      )}
    </View>
  );
}

// ---- One candidate guess + its nutrition + the health chip ----
// Shared between the Picture tab (photo recognition) and the Manual tab's
// "Describe your meal" mode (text recognition) — both produce the same
// ranked FoodRecognitionCandidate[] shape, so one card + "Not this food?"
// cycling UI serves both instead of two near-identical copies.
function FoodCandidateCard({
  candidate,
  hasMore,
  onConfirm,
  onNotThis,
  palette,
}: {
  candidate: FoodRecognitionCandidate;
  hasMore: boolean;
  onConfirm: () => void;
  onNotThis: () => void;
  palette: Palette;
}) {
  const calories = candidate.calories ?? 0;
  const protein = candidate.protein ?? 0;
  const carbs = candidate.carbs ?? 0;
  const fat = candidate.fat ?? 0;
  const healthScore = computeHealthScore({
    calories, protein, carbs, fat, sugar: candidate.sugar, fiber: candidate.fiber, sodium: candidate.sodium,
  });
  const tokens = healthScoreTokens(healthScore, palette);
  return (
    <View style={styles.resultCard}>
      <Text style={[styles.resultName, { color: palette.textPrimary }]}>{candidate.name}</Text>
      <Text style={[styles.resultConfidence, { color: palette.textMuted }]}>
        {Math.round(candidate.confidence * 100)}% match
      </Text>
      {/* AI-generated estimates can be wrong — this app has no way to verify
          against a real nutrition label for a described/photographed meal
          the way a barcode scan can, so every guess this card ever shows
          carries this note rather than presenting Gemini's number as fact. */}
      <Text style={[styles.aiDisclaimer, { color: palette.textMuted }]}>
        AI-generated estimate — may not be exact
      </Text>
      <View style={[styles.healthChip, { backgroundColor: tokens.soft, borderColor: tokens.color, alignSelf: 'flex-start' }]}>
        <Text style={[styles.healthChipText, { color: tokens.color }]}>{healthScore}/100</Text>
      </View>
      <Text style={[styles.resultMacros, { color: palette.textSecondary }]}>
        {calories} kcal · P {protein}g · C {carbs}g · F {fat}g
      </Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Button label="Log this food" onPress={onConfirm} variant="primary" fullWidth />
        <Button
          label={hasMore ? 'Not this food?' : "Not this food? (no more guesses)"}
          onPress={onNotThis}
          variant="ghost"
          fullWidth
        />
      </View>
    </View>
  );
}

// ---- Macro row: label + numeric + slim bar underneath ----
function MacroRow({ label, grams, goal, color, palette }: any) {
  const pct = goal > 0 ? Math.min(1, grams / goal) : 0;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroRowTop}>
        <Text style={[styles.macroLabel, { color: palette.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.macroValue, { color: palette.textSecondary }]} numberOfLines={1}>
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
    // flex-start, not center: with 'center', the ring column (shorter than
    // the 3-row macro column) was vertically centered as a whole block,
    // so "Calories" didn't actually sit at the top of the row — it floated
    // wherever centering put it, which shifted depending on content height.
    // flex-start pins both columns' tops to the same line, so the title
    // reads as flush with "MACROS" instead of floating.
    alignItems: 'flex-start',
    // Extra top padding on top of the existing xl, to shift the whole
    // ring+title block further down from the AppBar per request.
    paddingTop: spacing.xl + spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  ringWrap: {
    // width is set inline, per-render, from the live window size — see
    // RING_SIZE in the component body.
    alignItems: 'center',
  },
  ringHeader: {
    fontFamily: fontFamily.sansBold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  macroStack: {
    flex: 1,
    // Without this, RN's flex algorithm sizes a row's flex:1 child no
    // smaller than its own content's intrinsic width, so a long "45 / 150g"
    // string could force this column wider than the space actually left by
    // the ring — pushing content off the right edge — instead of letting the
    // text truncate/shrink inside the space it was actually given.
    minWidth: 0,
    // Bumped from spacing.md to spacing.lg (Task: macro row spacing) — the
    // three rows read as one cramped block at the tighter gap on a 375px
    // phone; the extra breathing room is what makes Protein/Carbs/Fat read
    // as three clearly separate values instead of one dense stack. A
    // spacing token, not a magic number, so this stays in step with the
    // rest of the app's scale if it's ever retuned.
    gap: spacing.lg,
  },
  macroStackTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  // A bit more internal gap too (4 -> 6 stayed, top row now has its own
  // horizontal gap so the label and the value never crowd each other on a
  // narrow phone — see macroRowTop below).
  macroRow: { gap: spacing.xs + 2 },
  macroRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
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

  warningStack: { gap: spacing.sm, marginTop: spacing.sm },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  warningText: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 13,
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
  foodIconStack: { alignItems: 'center', gap: 2 },
  foodEmoji: { fontSize: 22 },
  foodLeft:  { flex: 1 },
  foodName:  { fontFamily: fontFamily.sansBold, fontSize: 15 },
  foodMacros:{ fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
  foodRight: { alignItems: 'flex-end', gap: 4 },
  foodCalories: { fontFamily: fontFamily.sansBold, fontSize: 14 },

  healthChip: {
    borderWidth: layout.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  healthChipText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
  },

  fabWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg,
  },

  // Full-screen, centered modal — not a bottom sheet. modalContent spans
  // the entire screen (no rounded-top-only corners or bottom-sheet max
  // height), and modalOverlay centers it rather than pinning it to the
  // bottom edge.
  modalOverlay: { flex: 1, justifyContent: 'center' },
  modalContent: {
    width: '100%',
    height: '100%',
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: 22 },
  modalClose: { fontFamily: fontFamily.sansBold, fontSize: 15 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.hairline,
    minHeight: SEARCH_ROW_HEIGHT,
  },
  searchEmoji: { fontSize: 24 },
  searchName:  { fontFamily: fontFamily.sansBold, fontSize: 14 },
  searchMeta:  { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },

  describeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  describeLinkText: { fontFamily: fontFamily.sansBold, fontSize: 13 },

  descriptionInput: {
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    minHeight: 110,
  },

  tabMessageBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  tabMessageTitle: { fontFamily: fontFamily.sansBold, fontSize: 16, textAlign: 'center' },
  tabMessageBody: { fontFamily: fontFamily.sans, fontSize: 13, textAlign: 'center' },

  tipsCard: { gap: spacing.md, paddingTop: spacing.md },
  tipsTitle: { fontFamily: fontFamily.serif, fontSize: 18, marginBottom: spacing.xs },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tipText: { fontFamily: fontFamily.sans, fontSize: 14, flex: 1 },

  resultCard: { gap: spacing.xs, paddingTop: spacing.md },
  resultName: { fontFamily: fontFamily.serif, fontSize: 20 },
  resultConfidence: { fontFamily: fontFamily.sans, fontSize: 12 },
  aiDisclaimer: { fontFamily: fontFamily.sans, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  resultMacros: { fontFamily: fontFamily.sans, fontSize: 14, marginTop: spacing.xs },

  iconGridLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  recentCustomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  recentCustomName: { fontFamily: fontFamily.sansBold, fontSize: 14, flex: 1, marginRight: spacing.sm },
  recentCustomMacros: { fontFamily: fontFamily.sans, fontSize: 13 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconSwatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
