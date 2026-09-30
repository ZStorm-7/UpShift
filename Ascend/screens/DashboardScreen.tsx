import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, AccessibilityInfo, Platform } from 'react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
// Dashboard redesign proof of concept — reads its own light/editorial theme
// (theme/minimal.ts) rather than the app's shipped dark theme. See that
// file's header comment: no other screen is affected by this.
import { minimalColors as colors, minimalType as type, minimalSpacing as spacing, minimalRadius as radius } from '../theme/minimal';
import { layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, useTheme } from '../theme/themedColors';
import {
  Button,
  Field,
  Shimmer,
  LevelCard,
  QuestRow,
  StatCard,
} from '../components/dashboardMinimal';
import AuthTransition from '../components/AuthTransition';
import Avatar from '../components/Avatar';
import CircularRankBadge from '../components/CircularRankBadge';
import WeightPromptModal from '../components/WeightPromptModal';
import BedtimePromptModal from '../components/BedtimePromptModal';
import { withMinDuration, withTimeout, AUTH_TRANSITION_MS } from '../utils/timing';
import { isBirthdayToday, xpMultiplier, BIRTHDAY_XP_MULTIPLIER } from '../utils/birthday';
import { displayNameFor } from '../utils/profileDisplay';
import { confirmAsync } from '../utils/confirm';
import { Enter } from '../components/dashboard';
import SidePanel from '../components/SidePanel';
import PulsingIcon from '../components/PulsingIcon';
import BottomSheet from '../components/BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import haptics from '../services/haptics';
import { useUser, ageGroupFor, calculateAge } from '../context/UserContext';
import { maybeRecalculateCalorieGoal } from '../firebase/adaptiveCalories';
import { checkAchievementsForUser } from '../firebase/achievements';
import { celebrateAchievements } from '../utils/achievementAlert';
import { useLanguage } from '../i18n/LanguageContext';
import {
  dayDocRef,
  statsDocRef,
  xpRequiredForLevel,
  countLoggedHistoryDays,
  getTodayKey,
  awardXP,
  setTodayField,
} from '../firebase/progress';
import {
  Quest,
  QUEST_POOL,
  questDocRef,
  getQuestCycleKey,
  pickDailyQuests,
  getMsUntilNextNoon,
  formatCountdown,
} from '../firebase/quests';
import {
  StreakState,
  EMPTY_STREAK,
  streakDocRef,
  advanceStreak,
  liveStreak,
  reconcileStreakWithFreeze,
} from '../firebase/streaks';
import {
  WeightEntry,
  weightLogDocRef,
  upsertTodayWeight,
  latestWeight,
  weightChange,
} from '../firebase/weight';
import {
  QuestContext,
  findNewlyEarnedQuests,
  isAutoVerifiable,
  verifyQuest,
} from '../firebase/questVerify';
import { publishToLeaderboard, computeTotalXP } from '../firebase/leaderboard';
import {
  requestNotificationPermission,
  scheduleStreakRiskReminder,
  cancelStreakRiskReminder,
  scheduleWaterReminders,
  cancelWaterReminders,
  scheduleBedtimeReminder,
  cancelBedtimeReminder,
  scheduleWorkoutReminder,
  cancelWorkoutReminder,
} from '../services/notifications';
import { getRankInfo } from '../data/ranks';
import { fetchTodaySteps, fetchRecentWeight } from '../services/health';

// Header avatar diameter. Named because Avatar derives its font size and
// AuthTransition-style pressable frame from it — a bare `36` scattered across
// three places is how a resize turns into three separate edits.
const AVATAR_SIZE = 36;

// The entrance stagger used to be defined here. It now lives in <Enter/>
// (components/dashboard.tsx) reading its timing from animation/motion.ts, so
// the dashboard and every other screen stagger by the same 60ms.

export default function DashboardScreen({ navigation }: any) {
  const palette = usePalette();
  const { mode } = useTheme();
  // `makeStyles` is a function declaration (hoisted), defined at the
  // bottom of this file where the old static StyleSheet.create used to
  // be. Called once per render so every `styles.X` reference below
  // reflects the CURRENT theme, not whatever it was at module load.
  const styles = makeStyles(palette);
  const { authUser, profile, setProfile, logOut } = useUser();
  const { t } = useLanguage();

  // The reverse of AuthScreen's sign-in transition: the same 500ms-floor
  // overlay, going the other way — signed-in back to signed-out. Same
  // reasoning as AUTH_TRANSITION_MS in AuthScreen: signOut can resolve
  // fast enough that skipping the floor would read as a flicker rather
  // than a deliberate beat.
  //
  // Wrapped in an "Are you sure?" prompt because logging out is a genuine
  // context switch — the user goes back to Welcome and has to sign in
  // again — and confusingly-labelled buttons or a mis-tap on a fitness app
  // header shouldn't be able to do that silently.
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogOut = async () => {
    const confirmed = await confirmAsync({
      title: 'Log out?',
      message: 'Are you sure? Your data stays saved and will be here when you sign back in.',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (!confirmed) return;
    setLoggingOut(true);
    try {
      await withMinDuration(withTimeout(logOut()), AUTH_TRANSITION_MS);
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch {
      // A stalled/failed sign-out is rare, but leaving the spinner up
      // forever with no way out is worse than dropping back to the
      // dashboard so the user can try again.
      showError(t('errorSaveFailed'));
    } finally {
      setLoggingOut(false);
    }
  };

  // Settings screen is the new home for logout, theme toggle, and
  // subscription management. It's reachable from the side panel now, not
  // the daily nav row — see sidePanelVisible below.
  const handleSettings = () => navigation.navigate('Settings');

  // Friends/Leaderboard/History/Settings moved off the always-visible nav
  // row and behind this hamburger-triggered panel, freeing that row for the
  // two things opened every day (Nutrition/Workout) instead of splitting
  // attention across many destinations in one row.
  const [sidePanelVisible, setSidePanelVisible] = useState(false);

  const [loading, setLoading] = useState(true);

  // Quests now live in their own Firestore doc (users/{uid}/meta/quests)
  // instead of a hardcoded array, because they need to (a) refresh with a
  // new random pick each noon-to-noon cycle and (b) remember which ones are
  // done independently from the midnight-based day doc used for
  // food/water/sleep. See firebase/quests.ts for the cycle-key logic.
  const [quests, setQuests] = useState<Quest[]>([]);
  const [completedQuestIds, setCompletedQuestIds] = useState<number[]>([]);
  // IDs of today's quests that were ALREADY true the instant the current
  // noon-to-noon cycle drew them — e.g. "Log breakfast" gets redrawn at
  // 12:01pm and you logged breakfast at 8am, under the previous cycle. Those
  // ids are frozen at draw time (see loadQuests) and excluded from the
  // auto-verify effect below, so already-paid-for work can't pay out twice.
  // Manually tapping the quest still works — this only blocks the automatic
  // path, matching how every other quest's honor-system tap already behaves.
  const [preSatisfiedIds, setPreSatisfiedIds] = useState<number[]>([]);
  const [currentXP, setCurrentXP] = useState(0);
  const [level, setLevel] = useState(1);

  // Water is no longer surfaced as its own logging UI on this screen (see
  // the removed WaterBlock/modal below) — nudging toward the hydration goal
  // is now entirely the job of scheduleWaterReminders' push notifications.
  // waterTotal/waterGoal are kept: quest verification (buildQuestContext)
  // and the Activity tab of the History screen both still read them.
  const [waterTotal, setWaterTotal] = useState(0);
  const waterGoal = profile?.waterGoalMl || 2500;

  // Sleep now has its own screen (SleepScreen.tsx) rather than a modal here
  // — this only needs to know the CURRENT hours (for the stat card and
  // quest verification), not the logging UI itself.
  const [sleepHours, setSleepHours] = useState(0);

  const [totalCalories, setTotalCalories] = useState(0);
  const [workoutsCompleted, setWorkoutsCompleted] = useState(0);

  // Today's step count, synced from Health Connect (Android only) once the
  // user has connected it in Settings (Customize tab). null until a sync has
  // actually run, so the UI can tell "not connected" apart from "connected,
  // 0 steps so far" — see the effect below and the small stats-row line it
  // feeds.
  const [healthSteps, setHealthSteps] = useState<number | null>(null);
  // A same-day weight sample read from Health, offered as a PRE-FILL for the
  // daily weight prompt below rather than written on the user's behalf — see
  // the effect near dailyPromptOpen and WeightPromptModal's healthSuggestion
  // prop.
  const [healthWeightSuggestion, setHealthWeightSuggestion] = useState<{ value: number; source: string } | null>(null);

  // Extra facts about today's food log, needed so quests like "Log 4 meals
  // today" and "Log a snack under 200 kcal" can be checked automatically
  // rather than taken on trust.
  const [mealCount, setMealCount] = useState(0);
  const [smallestMealCalories, setSmallestMealCalories] = useState<number | null>(null);
  const [sleepLoggedFromTimes, setSleepLoggedFromTimes] = useState(false);

  const [streak, setStreak] = useState<StreakState>(EMPTY_STREAK);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);

  // Daily weight prompt. Pops on the first Dashboard visit each day IF the
  // user hasn't already logged today's weight and hasn't tapped "Skip
  // today" for today. The skip flag lives in Firestore keyed by today's
  // date so it survives an app reopen.
  const [dailyPromptOpen, setDailyPromptOpen] = useState(false);
  const [dailyPromptChecked, setDailyPromptChecked] = useState(false);
  // True only once the weight prompt is FULLY done — either it turned out
  // not to be needed, or it was shown and then closed (submitted/skipped).
  // Separate from dailyPromptChecked, which flips true the instant the
  // check STARTS (synchronously, before the async skip-lookup or the modal
  // itself even resolves). The sleep effect below used to gate on
  // dailyPromptChecked directly, which let it start its own async check
  // while the weight prompt's decision was still in flight — the two could
  // both end up open at once, which is the popup-ordering bug this fixes.
  const [weightPromptSettled, setWeightPromptSettled] = useState(false);

  // Birthday screen — opened once per app session on the user's birthday,
  // and only after the weight prompt has resolved so it can't stack on top
  // of it (same ordering concern as the sleep prompt below).
  //
  // `birthdaySettled` is what the sleep prompt waits on, and it's a
  // separate flag from "did we show it" for the same reason
  // weightPromptSettled is: it must only become true once this step is
  // FULLY done. Gating sleep on weightPromptSettled alone meant both this
  // and the sleep navigate fired on the same state change, pushing Sleep
  // on top of Birthday so the birthday screen was never actually seen.
  const birthdayShownRef = useRef(false);
  const [birthdaySettled, setBirthdaySettled] = useState(false);
  const isBirthday = isBirthdayToday(profile?.birthdayMonth, profile?.birthdayDay);
  useEffect(() => {
    if (loading || !profile || !weightPromptSettled) return;
    if (birthdayShownRef.current) return;
    birthdayShownRef.current = true;
    if (!isBirthday) { setBirthdaySettled(true); return; }
    navigation.navigate('Birthday');
  }, [loading, profile, weightPromptSettled, isBirthday]);

  // Marks the birthday step done once the user comes BACK from the
  // birthday screen, which is what releases the bedtime prompt below.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (birthdayShownRef.current) setBirthdaySettled(true);
    });
    return unsubscribe;
  }, [navigation]);

  // One-time, first-login bedtime-reminder prompt. Replaces the old daily
  // forced-navigation sleep popup: instead of nagging every day, this asks
  // ONCE — the first time this user reaches the Dashboard — whether to turn
  // on the nightly bedtime reminder, then never shows again. The
  // "shown" flag lives at users/{uid}/meta/onboarding.bedtimePromptShown,
  // mirroring the skip-flag pattern used by the weight/sleep prompts above.
  // Waits on weightPromptSettled + birthdaySettled so it can't stack on top
  // of either of those (same ordering concern documented above).
  const bedtimePromptCheckedRef = useRef(false);
  const [bedtimePromptOpen, setBedtimePromptOpen] = useState(false);
  useEffect(() => {
    if (loading || !authUser || !weightPromptSettled || !birthdaySettled) return;
    if (bedtimePromptCheckedRef.current) return;
    bedtimePromptCheckedRef.current = true;

    (async () => {
      try {
        const metaRef = doc(db, 'users', authUser.uid, 'meta', 'onboarding');
        const snap = await getDoc(metaRef);
        const shown = snap.exists() ? (snap.data() as any).bedtimePromptShown : false;
        if (shown) return;
        setBedtimePromptOpen(true);
      } catch {
        // If the check fails, don't show — better to skip a one-time nudge
        // than risk showing it repeatedly because reads keep failing.
      }
    })();
  }, [loading, authUser, weightPromptSettled, birthdaySettled]);

  const markBedtimePromptShown = async () => {
    if (!authUser) return;
    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'meta', 'onboarding'),
        { bedtimePromptShown: true },
        { merge: true },
      );
    } catch {
      // silent — worst case the prompt reappears on a future login, which
      // is a harmless repeat rather than data loss.
    }
  };

  const confirmBedtimePrompt = async (hour: number, minute: number) => {
    setBedtimePromptOpen(false);
    if (authUser && profile) {
      setProfile({ ...profile, bedtimeHour: hour, bedtimeMinute: minute, bedtimeReminderEnabled: true });
      try {
        await setDoc(
          doc(db, 'users', authUser.uid),
          { bedtimeHour: hour, bedtimeMinute: minute, bedtimeReminderEnabled: true },
          { merge: true },
        );
      } catch {
        showError(t('errorSaveFailed'));
      }
      await scheduleBedtimeReminder(true, hour, minute);
    }
    await markBedtimePromptShown();
  };

  const skipBedtimePrompt = async () => {
    setBedtimePromptOpen(false);
    await markBedtimePromptShown();
  };

  // Shown as a dismissible banner whenever a Firestore save/load fails,
  // instead of the old behavior of silently swallowing the error.
  const [errorMsg, setErrorMsg] = useState('');
  const errorTimeoutRef = useRef<any>(null);
  const showError = (message: string) => {
    setErrorMsg(message);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setErrorMsg(''), 6000);
  };

  // A brief, self-dismissing toast at the top of the screen — used for
  // tapping an auto-tracked quest that isn't actually done yet, so the tap
  // gets a visible answer instead of only a screen-reader announcement
  // (AccessibilityInfo.announceForAccessibility says nothing to a sighted
  // user who isn't running a screen reader).
  const [toastMsg, setToastMsg] = useState('');
  const toastTimeoutRef = useRef<any>(null);
  const showToast = (message: string, durationMs = 3000) => {
    setToastMsg(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(''), durationMs);
  };

  // Weekly adaptive calorie recalculation (MacroFactor's whole pitch: don't
  // just set a target once at onboarding and never touch it again — watch
  // what logged intake vs. logged weight actually did, and adjust). Checked
  // once per app session rather than on every focus like loadProgress above
  // — maybeRecalculateCalorieGoal reads up to 14 days of day-docs, which is
  // too expensive to repeat every time this screen regains focus, and its
  // own lastRecalcDate guard already makes repeat checks within the same
  // week a no-op anyway. The ref just avoids paying for that no-op query
  // more than once per session.
  const adaptiveCheckedRef = useRef(false);
  useEffect(() => {
    if (!authUser || !profile || adaptiveCheckedRef.current) return;
    adaptiveCheckedRef.current = true;
    (async () => {
      try {
        // Read fresh rather than closing over this component's own
        // `weightEntries` state — that state is filled in by loadProgress's
        // OWN async Firestore read above, on no particular schedule relative
        // to this effect, so closing over it here would almost always see
        // the pre-load empty array instead of what's actually saved.
        const weightSnap = await getDoc(weightLogDocRef(authUser.uid));
        const entries: WeightEntry[] = weightSnap.exists() ? weightSnap.data().entries || [] : [];
        const isMinor = ageGroupFor(calculateAge(profile.dateOfBirth || '')) === 'teen';
        const result = await maybeRecalculateCalorieGoal(authUser.uid, profile, entries, isMinor);
        if (result) {
          setProfile({ ...profile, calorieGoal: result.newGoal });
          showToast(
            `Calorie goal updated: ${result.oldGoal} → ${result.newGoal} kcal, based on your recent progress`,
            6000
          );
        }
      } catch {
        // Best-effort — a failed recalculation just means the goal stays
        // what it was, same as not having enough data yet.
      }
    })();
  }, [authUser, profile]);

  // Noon countdown, driven off the device's own local time/timezone — no
  // per-user timezone selection needed, "now" is always whatever time it
  // actually is where the phone is.
  //
  // There used to be a second `now` state ticking alongside this one at 1Hz,
  // left over from when the header showed a clock. The redesigned header
  // doesn't, so it was re-rendering the whole dashboard every second — and
  // because it ticked on a separate interval from this one, React couldn't
  // batch the two. Every Animated.View below rebuilt its style closure twice a
  // second to display nothing.
  const [msUntilNoon, setMsUntilNoon] = useState(getMsUntilNextNoon());

  // Which calendar day and which quest cycle the currently-displayed numbers
  // were loaded for. Compared against the live values once a minute so the
  // screen notices midnight and noon passing while it stays mounted.
  const loadedDayKeyRef = useRef<string>(getTodayKey());
  const loadedCycleKeyRef = useRef<string>('');
  const reloadRef = useRef<(() => void) | null>(null);
  // The noon rollover needs to redraw quests against TODAY'S numbers. It runs
  // from a setInterval whose effect only depends on [authUser], so anything it
  // closes over is frozen at the render where authUser first arrived — which
  // is while loading is still true and every number is still a placeholder.
  // Keeping the context builder in a ref, refreshed on every render, is what
  // lets that interval see real values. Without it, a level-12 user whose
  // phone sits on the dashboard through midday gets the new cycle's
  // "Reach Level 5" evaluated against level 1, marked not-pre-satisfied, and
  // then instantly auto-completed for XP they earned weeks ago.
  const questContextRef = useRef<() => QuestContext>(() => buildQuestContext());

  // Level-up celebration is no longer detected here — LevelUpContext itself
  // watches the stats document live (onSnapshot, not a one-time load) and
  // fires the takeover the instant Firestore reflects a level increase,
  // regardless of which screen actually earned the XP. Detecting it locally
  // in this effect only ever caught level-ups that happened while Dashboard
  // itself was mounted and loaded; one earned by finishing a workout on
  // WorkoutScreen, say, awarded XP through a completely different code path
  // and never touched this screen's `level` state at all — so nothing here
  // ever ran to notice it. See context/LevelUpContext.tsx for the fix.

  const quests_ = quests.map(q => ({ ...q, completed: completedQuestIds.includes(q.id) }));

  // XP needed to clear the CURRENT level — not the cumulative total (that's
  // computeTotalXP in firebase/leaderboard.ts, a different concept). Grows
  // per level now — see xpRequiredForLevel's comment in firebase/progress.ts.
  const totalXP = xpRequiredForLevel(level);

  // Builds a QuestContext from whatever this screen currently has in React
  // state. Used by the auto-verify effect (state is trustworthy there — it's
  // only reachable once `loading` is false) and as a fallback inside
  // loadQuests for the noon-only reload path, where state still reflects
  // today's real numbers because midnight hasn't passed. It must NOT be used
  // for the very first load of the day — see the freshContext parameter on
  // loadQuests for why.
  const buildQuestContext = (): QuestContext => ({
    totalCalories,
    calorieGoal: profile?.calorieGoal || 0,
    waterTotal,
    waterGoal,
    sleepHours,
    sleepLoggedFromTimes,
    workoutsCompleted,
    mealCount,
    smallestMealCalories,
    level,
  });

  // Refreshed every render so the interval-driven noon reload above always
  // reads current numbers rather than the render it was created in.
  questContextRef.current = buildQuestContext;

  // `freshContext`, when provided, comes from data the caller just read from
  // Firestore rather than from this component's React state. That matters
  // only for a first-of-the-day load: state can still be holding yesterday's
  // numbers (or the placeholder zeros from before the very first read
  // finishes), and drawing a fresh quest set against stale/zeroed state would
  // wrongly conclude nothing is pre-satisfied — silently reopening the exact
  // exploit this is meant to close. The noon-only boundary reload doesn't
  // pass one, because at that point state IS today's real data (midnight
  // hasn't crossed, so nothing has gone stale).
  const loadQuests = async (uid: string, freshContext?: QuestContext) => {
    const cycleKey = getQuestCycleKey();
    try {
      // How many prior days this user has actually logged data for. Quests
      // that need more history than this can't possibly be completed, so they
      // must not be handed out — see pickDailyQuests.
      const historyDays = await countLoggedHistoryDays(uid);
      const snap = await getDoc(questDocRef(uid));

      // Stamped only once the reads have actually succeeded. It used to be set
      // on the first line of this function, which meant a transient failure
      // (offline, quota) still marked the cycle as loaded — so the once-a-
      // minute boundary watcher never retried, and the quest card sat empty
      // until the user navigated away and back.
      loadedCycleKeyRef.current = cycleKey;

      const storedIsCurrent = snap.exists() && snap.data().cycleKey === cycleKey;
      if (storedIsCurrent) {
        const data = snap.data();
        const ids: number[] = data.questIds || [];
        const resolved = ids
          .map(id => QUEST_POOL.find(q => q.id === id))
          .filter((q): q is Quest => Boolean(q));

        // A stored set can contain a quest that's no longer legitimate —
        // either it was assigned before this gating existed, or the account
        // simply doesn't have the history it needs. Rather than leave an
        // uncompletable quest sitting there, throw the whole set out and
        // redraw from the eligible pool. The evicted quest isn't deleted;
        // it's still in QUEST_POOL and becomes drawable again once the
        // account has enough history.
        const allAchievable = resolved.every(q => q.requiresHistoryDays <= historyDays);
        if (allAchievable && resolved.length > 0) {
          setQuests(resolved);
          setCompletedQuestIds(data.completedQuestIds || []);
          // Older quest documents were written before preSatisfiedIds
          // existed. Defaulting to [] reproduces the old (exploitable, but
          // at-least-not-crashing) behavior for them rather than throwing on
          // an undefined field — the exclusion set is simply empty until the
          // next fresh draw writes a real one.
          setPreSatisfiedIds(data.preSatisfiedIds || []);
          return;
        }
      }

      // Either the first time this user has loaded quests, noon has passed
      // since the stored cycleKey was saved, or the stored set contained
      // something unachievable — in all three cases, draw a fresh set.
      const fresh = pickDailyQuests(cycleKey, 3, historyDays);
      setQuests(fresh);
      setCompletedQuestIds([]);

      // Freeze which of the freshly-drawn quests are ALREADY true right now,
      // using real data (freshContext) rather than possibly-stale state — see
      // the comment above this function. Reusing findNewlyEarnedQuests with
      // an empty completedIds list is exactly "which drawn quests currently
      // pass their verifier", which is exactly what needs to be excluded from
      // ever auto-completing this cycle.
      const preSatisfied = findNewlyEarnedQuests(
        fresh.map(q => q.id),
        [],
        // Through the ref, not buildQuestContext directly: the noon reload
        // calls this from a setInterval that captured its closure back when
        // every number was still a placeholder.
        freshContext ?? questContextRef.current()
      );
      setPreSatisfiedIds(preSatisfied);

      await setDoc(questDocRef(uid), {
        cycleKey,
        questIds: fresh.map(q => q.id),
        completedQuestIds: [],
        preSatisfiedIds: preSatisfied,
      });
    } catch {
      showError(t('errorLoadFailed'));
    }
  };

  // Load today's progress (and lifetime XP/level) from Firestore. Reloads
  // whenever this screen comes back into focus (e.g. returning from
  // Nutrition after logging food) so the numbers stay in sync.
  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }

    const loadProgress = async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      // Stamp which calendar day the state we're about to set belongs to, so
      // the rollover watcher can notice when it stops being today.
      loadedDayKeyRef.current = getTodayKey();
      try {
        const [daySnap, statsSnap, streakSnap, weightSnap] = await Promise.all([
          getDoc(dayDocRef(authUser.uid)),
          getDoc(statsDocRef(authUser.uid)),
          getDoc(streakDocRef(authUser.uid)),
          getDoc(weightLogDocRef(authUser.uid)),
        ]);
        // Captured into local consts (not just pushed through setState) so
        // the freshContext passed to loadQuests below reflects what was
        // actually just read from Firestore. setState is async — reading
        // waterTotal/level/etc. back out of state immediately after calling
        // their setters would still see the PREVIOUS render's values (zeros,
        // on a cold load), which is exactly the staleness that let a
        // redrawn quest look unearned when it had actually already been
        // done. See the comment on loadQuests' freshContext parameter.
        let dayContext: {
          waterTotal: number;
          sleepHours: number;
          sleepLoggedFromTimes: boolean;
          workoutsCompleted: number;
          totalCalories: number;
          mealCount: number;
          smallestMealCalories: number | null;
        };
        if (daySnap.exists()) {
          const data = daySnap.data();
          const foodLog = data.foodLog || [];
          dayContext = {
            waterTotal: data.waterTotal || 0,
            sleepHours: data.sleepHours || 0,
            sleepLoggedFromTimes: Boolean(data.sleepLoggedFromTimes),
            workoutsCompleted: data.workoutsCompleted || 0,
            totalCalories: foodLog.reduce((sum: number, item: any) => sum + (item.calories || 0), 0),
            mealCount: foodLog.length,
            smallestMealCalories:
              foodLog.length > 0
                ? Math.min(...foodLog.map((item: any) => item.calories || 0))
                : null,
          };
        } else {
          dayContext = {
            waterTotal: 0,
            sleepHours: 0,
            sleepLoggedFromTimes: false,
            workoutsCompleted: 0,
            totalCalories: 0,
            mealCount: 0,
            smallestMealCalories: null,
          };
        }
        setWaterTotal(dayContext.waterTotal);
        setSleepHours(dayContext.sleepHours);
        setSleepLoggedFromTimes(dayContext.sleepLoggedFromTimes);
        setWorkoutsCompleted(dayContext.workoutsCompleted);
        setTotalCalories(dayContext.totalCalories);
        setMealCount(dayContext.mealCount);
        setSmallestMealCalories(dayContext.smallestMealCalories);

        // Reconcile BEFORE this ever reaches setStreak/display — a freeze
        // that saved yesterday should mean the streak just looks alive, not
        // "alive, but only after you notice a toast." See
        // reconcileStreakWithFreeze for why this only ever bridges a gap of
        // exactly one skipped day.
        const loadedStreak = streakSnap.exists() ? (streakSnap.data() as StreakState) : EMPTY_STREAK;
        const reconciledStreak = reconcileStreakWithFreeze(loadedStreak, getQuestCycleKey());
        if (reconciledStreak !== loadedStreak) {
          setDoc(streakDocRef(authUser.uid), reconciledStreak).catch(() => {});
          showToast(
            `Streak freeze used — your ${reconciledStreak.currentStreak}-day streak is safe. ${reconciledStreak.freezesAvailable} left.`
          );
        }
        setStreak(reconciledStreak);
        setWeightEntries(weightSnap.exists() ? (weightSnap.data().entries || []) : []);
        // currentXP/level always come straight from Firestore here, not from
        // any local-only state — so logging out and back in (or closing and
        // reopening the app) always shows whatever was last saved, never a
        // stale in-memory value.
        const levelVal = statsSnap.exists() ? (statsSnap.data().level || 1) : 1;
        if (statsSnap.exists()) {
          setCurrentXP(statsSnap.data().currentXP || 0);
        } else {
          setCurrentXP(0);
        }
        setLevel(levelVal);

        await loadQuests(authUser.uid, {
          totalCalories: dayContext.totalCalories,
          calorieGoal: profile?.calorieGoal || 0,
          waterTotal: dayContext.waterTotal,
          waterGoal,
          sleepHours: dayContext.sleepHours,
          sleepLoggedFromTimes: dayContext.sleepLoggedFromTimes,
          workoutsCompleted: dayContext.workoutsCompleted,
          mealCount: dayContext.mealCount,
          smallestMealCalories: dayContext.smallestMealCalories,
          level: levelVal,
        });
      } catch {
        showError(t('errorLoadFailed'));
      }
      if (showSpinner) setLoading(false);
    };

    // Held in a ref so the rollover watcher below can call the same loader
    // without this effect having to re-run (and re-show the spinner).
    reloadRef.current = () => loadProgress(false);

    loadProgress(true);
    const unsubscribe = navigation.addListener('focus', () => loadProgress(false));
    return unsubscribe;
  }, [authUser, navigation]);

  // Ticks the clock every second, and once a minute checks two boundaries
  // that the app can cross while sitting open on screen.
  //
  // MIDNIGHT — the day document is keyed by calendar date, so at 00:00 the
  // app is silently pointing at a different document than the numbers on
  // screen came from. Without this, a phone left on the charger overnight
  // would show yesterday's totals all morning, and every log written against
  // them landed in today's document carrying yesterday's numbers along. The
  // additive writes are now relative (see incrementTodayField), which stops
  // the corruption; this reload is what makes the DISPLAY reset too.
  //
  // NOON — the quest cycle boundary. Only redraws when the key has actually
  // changed: the old code called loadQuests unconditionally every 60 seconds,
  // and loadQuests reads the user's entire `days` collection to count history.
  // For an account with 300 logged days that was 18,000 document reads an
  // hour, which exhausts the free Firestore quota in about three hours and
  // then breaks every read in the app.
  useEffect(() => {
    const boundaryInterval = setInterval(() => {
      if (!authUser) return;

      if (getTodayKey() !== loadedDayKeyRef.current) {
        reloadRef.current?.();
        return; // the reload runs loadQuests itself; don't do it twice
      }

      const cycleKey = getQuestCycleKey();
      if (cycleKey !== loadedCycleKeyRef.current) {
        // Deliberately NOT stamping loadedCycleKeyRef here. loadQuests stamps
        // it itself, and only after its reads succeed — the whole point of
        // that guard (see the comment there) is that a failed noon redraw gets
        // retried on the next tick. Stamping it up front here marked the cycle
        // loaded before we knew whether it had loaded, which re-broke exactly
        // the bug that guard was added to fix.
        loadQuests(authUser.uid);
      }
    }, 60000);

    return () => clearInterval(boundaryInterval);
  }, [authUser]);

  // The error banner's dismiss timer outlives the screen otherwise: fail a
  // save, immediately log out, and the pending setState lands on an unmounted
  // component.
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Recompute the countdown every second too, cheaply, without a network call.
  useEffect(() => {
    const interval = setInterval(() => setMsUntilNoon(getMsUntilNextNoon()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-completes any quest the logged data proves you've earned. Runs
  // whenever the underlying numbers change (including right after a focus
  // reload, so logging food in the Nutrition screen credits the relevant
  // quest the moment you come back here).
  //
  // `loading` is in the guard because the very first render has all these
  // values at 0 — checking then would see "0 meals, 0 calories" and be
  // correct but pointless, and worse, a quest like "level >= 5" would
  // evaluate against the placeholder level of 1.
  useEffect(() => {
    if (loading || !authUser || quests.length === 0) return;
    const context = buildQuestContext();
    // preSatisfiedIds is merged into the exclusion list alongside
    // completedQuestIds — not passed as some separate flag — so the
    // exclusion is a plain "already accounted for" set. A quest that was
    // already true when this cycle began stays excluded from AUTO-completion
    // for the whole cycle; it does not block a manual tap (completeQuest),
    // which is the same honor-system path every other quest already has.
    const earned = findNewlyEarnedQuests(
      quests.map(q => q.id),
      [...completedQuestIds, ...preSatisfiedIds],
      context
    );
    if (earned.length > 0) completeQuests(earned);
  }, [
    loading, authUser, quests, completedQuestIds, preSatisfiedIds,
    totalCalories, waterTotal, sleepHours, sleepLoggedFromTimes,
    workoutsCompleted, mealCount, smallestMealCalories, level,
  ]);

  // Advances the streak the moment every quest in the current cycle is done.
  // advanceStreak() is idempotent per cycle key, so this can safely re-run
  // on every render without inflating the count.
  useEffect(() => {
    if (loading || !authUser || quests.length === 0) return;
    const allDone = quests.every(q => completedQuestIds.includes(q.id));
    if (!allDone) return;

    const cycleKey = getQuestCycleKey();
    if (streak.lastCompletedCycleKey === cycleKey) return;

    const next = advanceStreak(streak, cycleKey);
    setStreak(next);
    setDoc(streakDocRef(authUser.uid), next).catch(() => {
      showError(t('errorSaveFailed'));
    });
    checkAchievementsForUser(authUser.uid).then(celebrateAchievements).catch(() => {});
  }, [loading, authUser, quests, completedQuestIds, streak]);

  // Mirrors this user's public stats into the leaderboard collection whenever
  // their XP, level, streak, name or avatar changes. Only these few fields
  // leave the private user document — no email, weight, age or food data.
  //
  // Failures are swallowed on purpose: the leaderboard is cosmetic, and a
  // user whose rules aren't set up yet (or who is offline) should still have a
  // fully working app rather than an error banner about a scoreboard.
  useEffect(() => {
    if (loading || !authUser || !profile) return;
    publishToLeaderboard({
      uid: authUser.uid,
      // Honours the user's chosen display name when they've set one, and
      // falls back to "First L." otherwise — see utils/profileDisplay.ts.
      displayName: displayNameFor(profile),
      ...(profile.bio?.trim() ? { bio: profile.bio.trim() } : {}),
      avatar: profile.avatar || '',
      // Firestore rejects `undefined` fields outright, so an unchosen color
      // has to be OMITTED, not set to undefined — hence the spread rather
      // than `avatarColor: profile.avatarColor`.
      ...(profile.avatarColor ? { avatarColor: profile.avatarColor } : {}),
      level,
      totalXP: computeTotalXP(level, currentXP),
      rank: getRankInfo(level).rank,
      streak: liveStreak(streak, getQuestCycleKey()),
    }).catch(() => {});
  }, [loading, authUser, profile, level, currentXP, streak]);

  // Daily weight prompt trigger. Runs once after data has loaded. Opens
  // the modal if:
  //   * data finished loading, AND
  //   * we haven't already checked this session, AND
  //   * there's no weight entry with today's date already, AND
  //   * the user hasn't tapped "Skip today" for today (stored in
  //     users/{uid}/meta/weightPromptSkips → { skippedDate: 'YYYY-MM-DD' }).
  useEffect(() => {
    if (loading || !authUser || dailyPromptChecked) return;
    setDailyPromptChecked(true);
    const todayKey = getTodayKey();
    const hasTodayWeight = weightEntries.some(e => e.date === todayKey);
    if (hasTodayWeight) { setWeightPromptSettled(true); return; }

    (async () => {
      try {
        const skipRef = doc(db, 'users', authUser.uid, 'meta', 'weightPromptSkips');
        const snap = await getDoc(skipRef);
        const skipped = snap.exists() ? (snap.data() as any).skippedDate : null;
        if (skipped === todayKey) { setWeightPromptSettled(true); return; }

        // If Health is connected, offer today's Health weight (if there is
        // one) as a pre-fill rather than making the user type it in — see
        // WeightPromptModal's healthSuggestion prop. Best-effort: any
        // failure here just means the prompt opens with an empty field,
        // exactly as it always has.
        if (profile?.healthSyncEnabled) {
          try {
            const healthWeight = await fetchRecentWeight();
            if (healthWeight && healthWeight.date === todayKey) {
              setHealthWeightSuggestion({ value: healthWeight.value, source: 'Health Connect' });
            }
          } catch {
            // fetchRecentWeight already fails soft, but this belt-and-
            // suspenders catch keeps a Health hiccup from ever blocking the
            // prompt itself from opening.
          }
        }

        // Settled is NOT set here — the prompt is about to actually show,
        // so it isn't "done" until submitDailyWeight/skipDailyWeight below
        // closes it.
        setDailyPromptOpen(true);
      } catch {
        // If the check fails, open the modal — better to nudge than to
        // silently drop the daily entry.
        setDailyPromptOpen(true);
      }
    })();
  }, [loading, authUser, dailyPromptChecked, weightEntries, profile?.healthSyncEnabled]);

  const submitDailyWeight = async (weightLbs: number) => {
    if (!authUser) return;
    const updated = upsertTodayWeight(weightEntries, weightLbs);
    setWeightEntries(updated);
    setDailyPromptOpen(false);
    setWeightPromptSettled(true);
    setHealthWeightSuggestion(null);
    try {
      await setDoc(weightLogDocRef(authUser.uid), { entries: updated });
      checkAchievementsForUser(authUser.uid).then(celebrateAchievements).catch(() => {});
    } catch {
      showError(t('errorSaveFailed'));
    }
  };

  const skipDailyWeight = async () => {
    setDailyPromptOpen(false);
    setWeightPromptSettled(true);
    setHealthWeightSuggestion(null);
    if (!authUser) return;
    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'meta', 'weightPromptSkips'),
        { skippedDate: getTodayKey() },
        { merge: true },
      );
    } catch {
      // silent — if the skip fails to persist, the modal re-opens on next
      // reload, which is a harmless nag rather than data loss.
    }
  };

  // Sleep is no longer force-prompted. Logging sleep now only happens when
  // the user deliberately opens the Sleep screen through normal navigation
  // (the Sleep stat card) — no automatic popup/redirect fires on Dashboard
  // load. See the one-time bedtime-reminder prompt below, which replaces
  // the old daily nag with a single first-login ask.

  const saveDayProgress = (updates: Partial<{ waterTotal: number; sleepHours: number; sleepLoggedFromTimes: boolean }>) => {
    if (!authUser) return;
    setDoc(dayDocRef(authUser.uid), updates, { merge: true }).catch(() => {
      showError(t('errorSaveFailed'));
    });
  };

  const saveQuestProgress = (updatedIds: number[]) => {
    if (!authUser) return;
    setDoc(questDocRef(authUser.uid), { completedQuestIds: updatedIds }, { merge: true }).catch(() => {
      showError(t('errorSaveFailed'));
    });
  };

  // Marks one or more quests complete and awards their combined XP in a
  // single pair of writes. Taking an array matters for auto-verification:
  // logging one big meal can satisfy several quests at once, and completing
  // them one-at-a-time would fire overlapping writes that clobber each other
  // (each would compute its new XP from the same stale starting value).
  // The XP itself is awarded by a Firestore transaction rather than computed
  // here and written as an absolute number. Doing the arithmetic locally was
  // silently destroying XP: this screen stays mounted underneath Workout, so
  // its `currentXP` goes stale the moment a workout awards anything, and the
  // next quest tap would write the stale total straight over the server's.
  // See awardXP in firebase/progress.ts.
  const completeQuests = async (ids: number[]) => {
    if (!authUser) return;
    const fresh = ids.filter(id => !completedQuestIds.includes(id));
    if (fresh.length === 0) return;

    const updatedIds = [...completedQuestIds, ...fresh];
    setCompletedQuestIds(updatedIds);
    saveQuestProgress(updatedIds);
    // One tick per batch, not per quest. Logging a big meal can satisfy three
    // quests at once, and three overlapping vibrations read as a malfunction
    // rather than three rewards.
    haptics.questTick();

    const baseXP = fresh.reduce((sum, id) => {
      const quest = QUEST_POOL.find(q => q.id === id);
      return sum + (quest?.xp || 0);
    }, 0);
    // 5x on the user's birthday, 1x otherwise — see utils/birthday.ts.
    const gainedXP = baseXP * xpMultiplier(profile?.birthdayMonth, profile?.birthdayDay);

    try {
      const next = await awardXP(authUser.uid, gainedXP);
      setCurrentXP(next.currentXP);
      setLevel(next.level);
    } catch {
      // The quest is already marked done both locally and in Firestore, so
      // rolling that back would be worse than leaving the XP to be picked up
      // on the next successful award. Just say the save failed.
      showError(t('errorSaveFailed'));
    }
  };

  // The tap handler behind every QuestRow. This is the ONE place a manual tap
  // can turn into a completion, so it's also the one place that has to tell
  // apart the two kinds of quest the design distinguishes:
  //
  //   - Auto-verifiable (has an entry in QUEST_VERIFIERS, marked "⚡ Auto-
  //     tracked" in the UI): the app can check the real answer, so a tap
  //     can't be allowed to force a "yes" the data disagrees with. Before
  //     this fix, tapping "Hit your calorie goal" at 9am with nothing logged
  //     yet paid out the XP anyway — the honor-system tap and the auto-verify
  //     effect were both wired to the same completeQuests call with nothing
  //     between them.
  //   - Everything else ("Take a 10-minute walk outside"): there is no data
  //     that could confirm or deny it, so a tap IS the only signal that
  //     exists, and stays instant — same as it always has.
  //
  // The context comes from the ref, not a plain closure over the render's
  // props, for the same reason the auto-verify effect below reads it that
  // way — see questContextRef's own comment for the stale-closure bug that
  // caused.
  const completeQuest = (id: number) => {
    if (isAutoVerifiable(id)) {
      const earned = verifyQuest(id, questContextRef.current());
      if (!earned) {
        // Not done yet. A no-op that still acknowledges the tap — silence
        // here would read as the button being broken, not as "not yet".
        // The toast covers sighted users who aren't running a screen
        // reader; the accessibility announcement covers those who are —
        // AccessibilityInfo.announceForAccessibility on its own is
        // silent to everyone else.
        haptics.selection();
        const quest = quests_.find(q => q.id === id);
        const message = `${quest?.title ?? 'This quest'} isn't complete yet — it tracks itself automatically once you've done it.`;
        showToast(message);
        AccessibilityInfo.announceForAccessibility?.(message);
        return;
      }
    }
    completeQuests([id]);
  };

  // Rank thresholds now live in data/ranks.ts so the Leaderboard screen shows
  // the identical names/emoji without a second copy of the ladder.
  const { rank, next } = getRankInfo(level);
  // getRankInfo returns either "Warrior at Level 20" or the top-of-ladder
  // message. Only the first wants a "Next:" in front of it.
  const nextRankLabel = next.includes('at Level') ? `Next: ${next}` : next;
  const questsDone = quests_.filter(q => q.completed).length;
  const currentStreakDays = liveStreak(streak, getQuestCycleKey());

  // Ask for notification permission once profile has actually loaded, and
  // only then. This used to run with an empty dependency array — "once, on
  // mount" — which is wrong here specifically because `profile` loads
  // asynchronously from Firestore and is still `null` on Dashboard's first
  // render. `null?.notificationsEnabled === false` is false (it's
  // `undefined === false`), so the guard silently passed and requested the
  // OS permission prompt every time, completely ignoring a user who had
  // already turned notifications off — the opt-out only ever "won" the
  // race by accident, on whichever render happened to fire after profile
  // finished loading, if the effect hadn't already fired first. The ref
  // makes this fire exactly once, and only after `profile` is real.
  const permissionRequestedRef = useRef(false);
  useEffect(() => {
    if (!profile || permissionRequestedRef.current) return;
    permissionRequestedRef.current = true;
    if (profile.notificationsEnabled === false) return;
    requestNotificationPermission();
  }, [profile]);

  // Health sync — only runs once the user has actually connected Apple
  // Health / Health Connect in Settings. Re-fetches on every focus (same
  // cadence as the main progress reload above) so returning to the
  // Dashboard after a walk shows an updated count without a manual refresh.
  // fetchTodaySteps() already fails soft to 0 on any error/denial, so this
  // has no separate error path of its own — a failed sync just leaves
  // healthSteps at whatever it last successfully was.
  useEffect(() => {
    if (loading || !authUser || !profile?.healthSyncEnabled) return;
    let cancelled = false;
    const sync = async () => {
      const steps = await fetchTodaySteps();
      if (cancelled) return;
      setHealthSteps(steps);
      // Absolute overwrite, not incrementTodayField — see setTodayField's
      // own comment in firebase/progress.ts for why steps needs "set" rather
      // than "add" semantics. Skipped when the read comes back 0, since a
      // genuine "0 steps today" and a failed/denied read are indistinguishable
      // here, and a transient failure shouldn't be able to stomp a real
      // count already saved earlier today.
      if (steps > 0) {
        setTodayField(authUser.uid, 'steps', steps).catch(() => {});
      }
    };
    sync();
    const unsubscribe = navigation.addListener('focus', sync);
    return () => { cancelled = true; unsubscribe(); };
  }, [loading, authUser, profile?.healthSyncEnabled, navigation]);

  // Local streak-risk reminder. Re-evaluated on every render where quest
  // completion or the streak count could have changed — see
  // services/notifications.ts for why "reschedule from scratch each time"
  // is the right model for a notification that can't check live state at
  // fire time. Opted out entirely when the user has turned notifications
  // off in Edit Profile (undefined/unset defaults to on, matching every
  // other opt-in-by-default flag in this app).
  useEffect(() => {
    if (profile?.notificationsEnabled === false) {
      cancelStreakRiskReminder();
      return;
    }
    scheduleStreakRiskReminder(questsDone < quests_.length, currentStreakDays);
  }, [profile?.notificationsEnabled, questsDone, quests_.length, currentStreakDays]);

  // Water reminders — a few times a day, every day, nudging toward the
  // hydration goal. These don't depend on today's actual water total (a
  // local-only notification can't re-check that at fire time — see the
  // service file), so this only needs to run once notifications are opted
  // into, not on every sip logged.
  useEffect(() => {
    if (loading) return;
    if (profile?.notificationsEnabled === false) {
      cancelWaterReminders();
      return;
    }
    scheduleWaterReminders(true);
  }, [loading, profile?.notificationsEnabled]);

  // Bedtime / sleep reminder — one nightly nudge at a fixed local hour.
  // Gated on its OWN flag, not the shared `notificationsEnabled` (Settings'
  // "Streak & quest reminders" switch) — bedtime is its own category with
  // its own toggle on SleepScreen, not a side effect of an unrelated switch.
  // Still respects the master permission gate: if the user has never
  // granted notification permission at all (notificationsEnabled === false),
  // nothing should schedule regardless of the per-category flags.
  useEffect(() => {
    if (loading) return;
    if (profile?.notificationsEnabled === false || profile?.bedtimeReminderEnabled === false) {
      cancelBedtimeReminder();
      return;
    }
    // Uses the bedtime the user set on SleepScreen; falls back to the
    // service's own 22:00 default when they haven't set one.
    scheduleBedtimeReminder(true, profile?.bedtimeHour, profile?.bedtimeMinute);
  }, [loading, profile?.notificationsEnabled, profile?.bedtimeReminderEnabled, profile?.bedtimeHour, profile?.bedtimeMinute]);

  // Workout reminder — same cancel-then-maybe-reschedule pattern as the
  // streak reminder above: re-evaluated whenever workoutsCompleted changes,
  // so finishing today's workout silences tonight's nudge immediately.
  useEffect(() => {
    if (loading) return;
    if (profile?.notificationsEnabled === false) {
      cancelWorkoutReminder();
      return;
    }
    scheduleWorkoutReminder(workoutsCompleted > 0);
  }, [loading, profile?.notificationsEnabled, workoutsCompleted]);

  // Skeletons in the shape of the real layout, not a spinner. A spinner in
  // the middle of an empty screen says "wait"; skeletons say "here's what's
  // coming", the layout doesn't jump when data lands, and the wait measurably
  // feels shorter because there's already something to look at.
  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Shimmer width="60%" height={28} />
          <Shimmer width="100%" height={132} style={styles.skeletonCard} />
          <Shimmer width="40%" height={16} />
          <Shimmer width="100%" height={56} style={styles.skeletonCard} />
          <Shimmer width="100%" height={56} style={styles.skeletonCard} />
          <Shimmer width="100%" height={56} style={styles.skeletonCard} />
          <View style={styles.statsRow}>
            <Shimmer width="100%" height={84} style={[styles.skeletonCard, styles.flexOne]} />
            <Shimmer width="100%" height={84} style={[styles.skeletonCard, styles.flexOne]} />
          </View>
          <Shimmer width="100%" height={128} style={styles.skeletonCard} />
        </ScrollView>
      </View>
    );
  }

  // The masthead dateline — "Tuesday · August 23". The one truly distinctive
  // device on the redesigned screen: the dashboard reads as today's page in a
  // daily record rather than a game HUD, and this is what establishes that
  // register before anything else on screen does.
  const now = new Date();
  const dateline = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* Error banner */}
      {errorMsg !== '' && (
        <Pressable
          style={styles.errorBanner}
          onPress={() => setErrorMsg('')}
          accessibilityRole="button"
          // role="alert" + a live region so the failure is spoken when it
          // appears. Without it the only signal that a save failed is a red
          // bar that a screen-reader user never lands on, because nothing
          // moves focus here.
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${errorMsg}. Double tap to dismiss.`}>
          <Text style={styles.errorText} accessible={false}>
            {errorMsg}
          </Text>
          <Ionicons name="close" size={16} color={palette.danger} accessible={false} />
        </Pressable>
      )}

      {/* Quest-not-done-yet toast. Same top-of-screen placement as the error
          banner, but neutral rather than red — it isn't reporting a failure,
          just answering a tap. Self-dismisses; not meant to be tapped away. */}
      {toastMsg !== '' && (
        <View
          style={styles.toastBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Warning banners */}
      {sleepHours > 0 && sleepHours < 6 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Only {sleepHours}h of sleep last night — rest up today.</Text>
        </View>
      )}

      {/* Birthday XP boost. Shown all day so the multiplier is discoverable
          — the one-time Birthday screen is easy to tap past, and silently
          multiplying XP without saying so reads as a bug. */}
      {isBirthday && (
        <Pressable
          style={styles.birthdayBanner}
          onPress={() => navigation.navigate('Birthday')}
          accessibilityRole="button"
          accessibilityLabel={`Happy birthday. All XP is multiplied by ${BIRTHDAY_XP_MULTIPLIER} today.`}>
          <Ionicons name="gift" size={16} color={styles.birthdayBannerText.color} />
          <Text style={styles.birthdayBannerText}>
            {' '}Happy birthday! All XP is {BIRTHDAY_XP_MULTIPLIER}× today.
          </Text>
        </Pressable>
      )}

      {/* Masthead — the day's dateline over a hairline, with the section nav
          underneath it as plain tracked labels. Replaces the old emoji glyph
          row: this direction spends its one visual idea on the dateline, so
          everything else stays quiet, typographic, and named in words rather
          than icons. */}
      <Enter index={0}>
        <View style={styles.masthead}>
          <View style={styles.mastheadTop}>
            {/* Hamburger — opens the side panel that now holds Friends /
                Leaderboard / History / Settings. Sized to match the icon
                bubbles inside that panel (SidePanel's iconBubble, 44x44) so
                the button that opens the rail reads as the same scale as
                what's inside it, and borderless so it reads as a plain icon
                button rather than a bordered card competing with the
                masthead's own hairline rule underneath it. */}
            <Pressable
              onPress={() => { haptics.selection(); setSidePanelVisible(true); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              style={[styles.menuButton, { backgroundColor: palette.surface }]}>
              <Ionicons name="menu" size={22} color={palette.textPrimary} />
            </Pressable>
            <Text style={styles.dateline}>{dateline}</Text>
          </View>
          <View style={styles.mastRule} />
          {/* Down to the 2 things opened every day. Sleep moved to being
              purely notification-driven (see services/notifications.ts —
              the bedtime reminder is now the only way in), Weight moved to
              the side panel (it already has its own daily auto-prompt —
              WeightPromptModal below — for the "shows once when you open
              the app" case, so it doesn't need a permanent nav slot too),
              and Motivation was removed outright. Friends/Leaderboard/
              History/Settings live in the side panel opened by the
              hamburger above. Centered rather than left-aligned now that
              there are only two items — left-aligned read fine as the start
              of a longer row, but reads as oddly stranded with just two. */}
          <View style={styles.navRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('nutrition')} onPress={() => navigation.navigate('Nutrition')} style={styles.navItem}>
              <Text style={styles.navLabel}>{t('nutrition')}</Text>
            </Pressable>
            <View style={styles.navDivider} />
            <Pressable accessibilityRole="button" accessibilityLabel="Workout" onPress={() => navigation.navigate('Workout')} style={styles.navItem}>
              <Text style={styles.navLabel}>Workout</Text>
            </Pressable>
          </View>
        </View>
      </Enter>

      <SidePanel
        visible={sidePanelVisible}
        onClose={() => setSidePanelVisible(false)}
        palette={palette}
        isDark={mode === 'dark'}
        items={[
          { key: 'friends', label: t('friendsTitle'), icon: 'people', onPress: () => navigation.navigate('Friends') },
          { key: 'leaderboard', label: t('leaderboard'), icon: 'trophy', onPress: () => navigation.navigate('Leaderboard') },
          { key: 'history', label: t('history'), icon: 'time', onPress: () => navigation.navigate('History') },
          // Weight moved out of the daily nav row (see the comment above the
          // nav row) — it still gets its own daily auto-prompt
          // (WeightPromptModal, below), and this is the manual way back in.
          { key: 'weight', label: t('weight'), icon: 'scale', onPress: () => navigation.navigate('Weight') },
          // SleepScreen existed and was fully wired into the navigator, the
          // Activity history chart, and BedtimePromptModal's own copy ("you
          // can change this anytime from the Sleep screen") — but nothing
          // anywhere actually called navigate('Sleep'). Confirmed by
          // grepping the whole codebase: zero call sites. The entire screen
          // was unreachable. This is that missing entry point.
          { key: 'sleep', label: t('sleep'), icon: 'moon', onPress: () => navigation.navigate('Sleep') },
          { key: 'achievements', label: 'Achievements', icon: 'ribbon', onPress: () => navigation.navigate('Achievements') },
          { key: 'settings', label: 'Settings', icon: 'settings', onPress: handleSettings },
        ]}
      />

      {/* Greeting + avatar. Time-of-day greeting mirrors WorkoutScreen's own
          morning/afternoon/evening split (see that screen's greeting logic)
          — this used to hardcode "Good morning" no matter when the app was
          opened. Only "morning" has a translated string (t('goodMorning'));
          afternoon/evening fall back to plain English, same as
          WorkoutScreen already does, rather than half-translating one time
          of day and not the other two. */}
      <Enter index={0}>
        <View style={styles.greetingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={() => navigation.navigate('EditProfile')}
            style={styles.avatarPressable}>
            <Avatar
              photoUrl={profile?.avatar}
              color={profile?.avatarColor}
              uid={authUser?.uid ?? ''}
              firstName={profile?.firstName}
              lastInitial={profile?.lastInitial}
              size={AVATAR_SIZE}
            />
          </Pressable>
          {/* No numberOfLines cap on the Text below — a 2-line limit still
              truncated with "…" for a long enough name. Wrapping to however
              many lines the name actually needs guarantees the full name
              always shows, at the cost of the greeting block growing taller
              (pushing the rank block etc. down slightly) for long names. */}
          {profile && (
            <Text style={styles.greeting}>
              {(() => {
                const hour = new Date().getHours();
                return hour < 12 ? t('goodMorning') : hour < 18 ? 'Good afternoon' : 'Good evening';
              })()}, {profile.nickname || profile.firstName}
            </Text>
          )}
        </View>
      </Enter>

      {/* Level + XP + rank — CircularRankBadge (Apple Watch style) */}
      <Enter index={1}>
        <View style={styles.rankBlock}>
          <CircularRankBadge
            level={level}
            progress={currentXP / totalXP}
            rankName={rank}
            size={160}
          />
          {currentStreakDays > 0 && (
            <View style={styles.streakLineRow}>
              <PulsingIcon name="flame" size={14} color={styles.streakLine.color} />
              <Text style={styles.streakLine}> {currentStreakDays}-day streak</Text>
              {/* Freezes are earned (every 7-day milestone), never bought —
                  shown right next to the streak they protect rather than
                  buried in a settings screen, since this is the number that
                  answers "what happens if I miss tomorrow". */}
              {streak.freezesAvailable > 0 && (
                <View style={styles.freezeChip} accessibilityLabel={`${streak.freezesAvailable} streak freeze${streak.freezesAvailable === 1 ? '' : 's'} available`}>
                  <Ionicons name="snow" size={11} color={palette.accentText} />
                  <Text style={styles.freezeChipText}>{streak.freezesAvailable}</Text>
                </View>
              )}
            </View>
          )}
          {nextRankLabel && (
            <Text style={styles.nextRankLine}>
              {nextRankLabel}
            </Text>
          )}
        </View>
      </Enter>

      {/* Daily Quests.
          One card PER QUEST, with real space between them — the layout the
          Claude Design mock uses. An earlier version merged them into a single
          card of hairline-separated rows on the theory that a checklist reads
          as one finishable thing; the mock disagrees, and on screen the mock
          is right. Each quest is independently tappable and independently
          rewarding, and giving each one its own edges makes the tap target
          obvious and gives the 1.14 tick somewhere to happen. The "0 / 3 done"
          counter is what supplies the sense of a set, so the cards don't have
          to.

          The whole section is ONE entrance beat, not one per card. The design
          is explicit about this — "five groups rise 18px in sequence:
          greeting, level card, quests, stats, water" — and it's the right
          call: the quests are a group, and staggering them individually would
          spend three of the five beats on one section and make the stats and
          water arrive late enough to feel like an afterthought. */}
      <Enter index={2}>
        <View style={styles.questSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dailyQuests')}</Text>
            <Text style={styles.sectionCount}>
              {questsDone} / {quests_.length} done
            </Text>
          </View>

          {quests_.map(quest => (
            <View key={quest.id} style={styles.questCard}>
              <QuestRow
                title={quest.title}
                xp={quest.xp}
                completed={quest.completed}
                /* AUTO badge intentionally suppressed. Auto-verification
                   still runs — see findNewlyEarnedQuests below — so a
                   quest the user has already earned by their real logged
                   data will silently flip to completed the next time the
                   Dashboard re-evaluates. The badge is gone so the
                   surface reads uniformly: every quest looks tappable,
                   even the ones the app is quietly verifying for you. */
                autoLabel={undefined}
                onPress={() => completeQuest(quest.id)}
              />
            </View>
          ))}

          <Text style={styles.countdownText}>
            {t('nextQuestReset')} {formatCountdown(msUntilNoon)}
          </Text>
        </View>
      </Enter>

      {/* Steps — only shown once Health sync is actually connected (see
          Settings' Customize tab), and only once a sync has resolved at
          least once this session. The Calories/Workouts/Sleep/lbs stat-tile
          rows that used to sit here were removed per explicit request — that
          data is still reachable from Nutrition, Workout, Sleep, and the
          Weight screen (side panel), just not duplicated on the Dashboard. */}
      {profile?.healthSyncEnabled && healthSteps !== null && (
        <Enter index={3}>
          <Text style={styles.healthStepsLine}>
            {healthSteps.toLocaleString()} steps today · Health Connect
          </Text>
        </Enter>
      )}

      {/* Level-up takeover.
          In a Modal rather than an absolutely-positioned View, because this
          screen is a ScrollView — absoluteFill inside scrolling content is
          positioned against the CONTENT, so a user scrolled halfway down
          would see the celebration land somewhere off screen. A Modal is
          measured against the window, which is what "takeover" means.
          animationType="none" because the component runs its own timeline and
          the OS sliding it in first would push the whole thing past 2.5s. */}
      {/* The level-up takeover is no longer rendered here — it lives at the
          app root (context/LevelUpContext), which watches the stats
          document itself and fires the takeover directly. This screen
          doesn't call celebrate() at all anymore. */}

      {/* The other end of AuthScreen's sign-in transition — same overlay,
          same 500ms floor, going the other direction. */}
      {loggingOut && <AuthTransition />}

      {/* Daily weight prompt. See dailyPromptOpen state comment above for
          when it opens; it dismisses via onSubmit (logs weight) or onSkip
          (writes today's date to weightPromptSkips, silencing itself
          until tomorrow).
          Conditionally MOUNTED (not just visible={false}) alongside the
          bedtime prompt below on purpose — react-native-web's Modal tracks
          all currently-mounted <Modal> instances to decide which one is
          "on top" for pointer-event purposes, regardless of their own
          `visible` prop. Toggling `visible` while leaving both mounted
          confirmed-broke this: on a brand-new account, "first weight log
          ever" and "first-ever bedtime ask" both fire on the same load, and
          whichever modal mounted FIRST kept eating every tap — both its own
          buttons AND, worse, the second modal's — even after its own
          `visible` had already gone false. Rendering only one of these two
          <Modal> elements at a time removes the ambiguity entirely. */}
      {dailyPromptOpen && !bedtimePromptOpen && (
        <WeightPromptModal
          visible
          currentWeight={latestWeight(weightEntries)?.weightLbs ?? null}
          onSubmit={submitDailyWeight}
          onSkip={skipDailyWeight}
          healthSuggestion={healthWeightSuggestion}
        />
      )}

      {/* One-time first-login bedtime-reminder prompt. See the
          bedtimePromptOpen effect above — shows once ever, then persists
          users/{uid}/meta/onboarding.bedtimePromptShown so it never shows
          again. See the comment above WeightPromptModal for why this is
          conditionally mounted rather than always-mounted-with-visible. */}
      {bedtimePromptOpen && !dailyPromptOpen && (
        <BedtimePromptModal
          visible
          defaultHour={profile?.bedtimeHour ?? 22}
          defaultMinute={profile?.bedtimeMinute ?? 0}
          onConfirm={confirmBedtimePrompt}
          onSkip={skipBedtimePrompt}
        />
      )}

    </ScrollView>
    </View>
  );
}

// Converted from a static StyleSheet.create({...}) to a function called
// once per render with the current palette. A static sheet is evaluated
// ONCE at module load, so any colors.X reference baked into it can never
// react to the theme toggle — this is the same fix already applied to
// ui.tsx, dashboard.tsx, and dashboardMinimal.tsx, just landing here last
// because this screen's stylesheet was the biggest one in the app.
//
// Structural values (spacing, radius, layout, font family/size) still
// come from the static minimal* imports — those aren't theme-dependent
// and don't need to move.
function makeStyles(palette: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    skeletonCard: {
      borderRadius: radius.lg,
    },
    container: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.xl,
      paddingBottom: layout.bottomInset,
      gap: spacing.lg,
    },
    errorBanner: {
      backgroundColor: palette.dangerSoft,
      borderWidth: 1,
      borderColor: palette.danger,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    errorText: {
      ...type.bodySm,
      color: palette.danger,
      flex: 1,
    },
    toastBanner: {
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    toastText: {
      ...type.bodySm,
      color: palette.textPrimary,
    },
    birthdayBanner: {
      backgroundColor: palette.xpSoft,
      borderWidth: 1,
      borderColor: palette.xp,
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
    },
    birthdayBannerText: {
      ...type.bodySm,
      color: palette.xp,
      fontFamily: fontFamily.sansBold,
    },

    /* Masthead — the signature device. A dateline over a hairline, with plain
       tracked nav labels underneath rather than icons or emoji. */
    masthead: {
      gap: spacing.sm,
    },
    mastheadTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    menuButton: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateline: {
      ...type.dateline,
      color: palette.textSecondary,
      textTransform: 'uppercase',
      flex: 1,
    },
    mastRule: {
      height: 1,
      backgroundColor: palette.borderStrong,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    navItem: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    // Bigger than type.label's 11px (a shared token used for section
    // headers/badges elsewhere — bumped here only, not in theme/tokens.ts,
    // since this row is the one place asking for larger nav text).
    navLabel: {
      ...type.label,
      fontSize: 14,
      lineHeight: 18,
      color: palette.textSecondary,
      textTransform: 'uppercase',
    },
    navDivider: {
      width: 1,
      height: 14,
      backgroundColor: palette.border,
    },

    // CircularRankBadge block. Big center-aligned column with the streak and
    // next-rank label sitting below the ring. Explicit marginTop on each
    // line rather than a `gap` on the container — see the comment in
    // CircularRankBadge.tsx for why.
    rankBlock: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    streakLine: {
      fontFamily: fontFamily.sansBold,
      fontSize: 13,
      color: palette.xp,
    },
    streakLineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    freezeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginLeft: spacing.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: palette.accent,
    },
    freezeChipText: {
      fontFamily: fontFamily.sansBold,
      fontSize: 11,
      color: palette.accentText,
    },
    nextRankLine: {
      fontFamily: fontFamily.sans,
      fontSize: 12,
      color: palette.textMuted,
      marginTop: spacing.xs,
    },

    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    // The Avatar component supplies its own circle, fill and border-radius —
    // this only adds the hairline frame around it.
    avatarPressable: {
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: palette.border,
    },
    // The one serif headline on the page.
    greeting: {
      ...type.greeting,
      fontSize: 26,
      lineHeight: 30,
      color: palette.textPrimary,
      flexShrink: 1,
    },

    warningBanner: {
      backgroundColor: palette.xpSoft,
      borderWidth: 1,
      borderColor: palette.xp,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    warningText: {
      ...type.body,
      color: palette.xp,
    },

    questSection: {
      gap: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      ...type.heading,
      color: palette.textPrimary,
    },
    sectionCount: {
      ...type.bodySm,
      color: palette.textMuted,
    },
    // One card per quest. Horizontal padding only — QuestRow supplies its own
    // vertical padding, so the tap target spans the full card height rather
    // than stopping at the text.
    questCard: {
      backgroundColor: palette.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: spacing.lg,
    },
    countdownText: {
      ...type.bodySm,
      color: palette.textMuted,
      textAlign: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    healthStepsLine: {
      ...type.bodySm,
      color: palette.textMuted,
      textAlign: 'center',
    },
    modalTitle: {
      ...type.serifHeading,
      color: palette.textPrimary,
    },
    modalSubtitle: {
      ...type.body,
      color: palette.textSecondary,
    },
    quickButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    orText: {
      ...type.bodySm,
      color: palette.textMuted,
      textAlign: 'center',
    },
    rowInputsSleep: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    error: {
      ...type.bodySm,
      color: palette.danger,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    flexOne: {
      flex: 1,
    },
    flexTwo: {
      flex: 2,
    },
  });
}
