// Mindful breaks: owns the user's settings, the in-app timer, strict mode, the
// emergency pass, and the hand-off from the native side (Android service / iOS
// Screen Time) to the Break screen.
//
// A break is "active" from the moment the Break screen opens until it is
// finished. While active, other parts of the app can pause themselves with
// useBreakPause('workout' | 'audio' | 'questClock').

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useUser } from './UserContext';
import { navigationRef, currentRouteName } from '../services/navigationRef';
import { BreakSettings, DEFAULT_BREAK_SETTINGS, normalizeSettings } from '../services/breaks/settings';
import { loadBreakSettings, saveBreakSettings } from '../services/breaks/settingsStore';
import { decide, localTime, toPolicy, patternFor, INITIAL_TRACKER, complete } from '../services/breaks/policy';
import type { TrackerState } from '../services/breaks/usageTracker';
import { PASSES_PER_DAY, passesLeft, usePass, PASS_PAUSE_MS } from '../services/breaks/passes';
import { IntentId, dayKey } from '../services/breaks/stats';
import { awardXP } from '../firebase/progress';
import { emitDayDataChanged } from '../services/dataEvents';
import { breakXp, advanceBreakStreak, liveBreakStreak, bestFrame, EMPTY_BREAK_STREAK, BreakStreakState } from '../services/breaks/rewards';
import { loadBreakStreak, saveBreakStreak } from '../services/breaks/streakStore';
import { publishBreakStreak } from '../firebase/leaderboard';
import { loadToday, recordBreakEvent } from '../services/breaks/statsStore';
import type { PatternId } from '../services/breaks/timeline';
import {
  applySettings, capability, getAndroidWatchedPackages, getPendingBreak, markBreakDone, abandonBreak,
  getNativeCompletedToday, BREAK_DEEP_LINK,
} from '../services/breaks/native';

export type BreakSource = 'in-app' | 'android' | 'ios';
export type BreakParams = {
  source: BreakSource;
  mode?: 'breathe' | 'strict';
  pkg?: string;
  label?: string;
  // Strict mode: when it ends (epoch ms).
  until?: number;
  // Try-out from settings: use this pattern instead of the saved one.
  pattern?: PatternId;
  preview?: boolean;
};

type PauseKind = 'workout' | 'audio' | 'questClock';

export type FinishOutcome = 'stay' | 'exit';

type BreakContextType = {
  settings: BreakSettings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<BreakSettings>) => Promise<void>;
  androidPackages: string[];
  setAndroidPackages: (pkgs: string[]) => Promise<void>;
  /** False while the app's splash is still showing (a cold start from another app). */
  appReady: boolean;
  /** True while the Break screen is showing. */
  isBreakActive: boolean;
  setBreakActive: (active: boolean) => void;
  /** Opens the Break screen (no-op if already open). */
  startBreak: (params: BreakParams) => void;
  /** Called when the exercise finishes: records it, lifts native blocks and restarts the interval. */
  completeBreak: (outcome: FinishOutcome, intent?: IntentId, mood?: number) => Promise<{ xp: number; streak: number }>;
  /** Strict mode: close the chosen apps for `minutes`. */
  startStrict: (minutes: number) => Promise<void>;
  endStrict: () => Promise<void>;
  /** XP the next finished break will earn today (0 once the daily cap is reached). */
  xpNext: number;
  /** Days in a row with a finished break (0 if the streak has lapsed). */
  breakStreak: number;
  /** The longest run of days with a break, ever. Frames unlock from this. */
  longestBreakStreak: number;
  /** The best frame colour earned so far, shown around your avatar. */
  frameColor: string | null;
  /** Emergency passes left today. */
  passesLeftToday: number;
  /** Uses one pass: pauses breaks and strict mode for 10 minutes. Resolves false if none are left. */
  takeEmergencyPass: (opts?: { abandonPending?: boolean }) => Promise<boolean>;
  /** Turns the feature off everywhere on this device (used on account deletion). */
  disableAll: () => Promise<void>;
};

const noop = async () => {};
const BreakContext = createContext<BreakContextType>({
  settings: DEFAULT_BREAK_SETTINGS, settingsLoaded: false, updateSettings: noop,
  androidPackages: [], setAndroidPackages: noop, appReady: true, isBreakActive: false, setBreakActive: () => {},
  startBreak: () => {}, completeBreak: async () => ({ xp: 0, streak: 0 }), startStrict: noop, endStrict: noop,
  breakStreak: 0, longestBreakStreak: 0, frameColor: null, xpNext: 0,
  passesLeftToday: PASSES_PER_DAY, takeEmergencyPass: async () => false, disableAll: noop,
});

let pendingStart: BreakParams | null = null;

export function BreakProvider({ children, ready = true }: { children: ReactNode; ready?: boolean }) {
  const { authUser } = useUser();
  const uid = authUser?.uid;

  const [settings, setSettings] = useState<BreakSettings>(DEFAULT_BREAK_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [androidPackages, setPackagesState] = useState<string[]>(() => getAndroidWatchedPackages());
  const [isBreakActive, setBreakActiveState] = useState(false);
  const [passesUsed, setPassesUsed] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [streakState, setStreakState] = useState<BreakStreakState>(EMPTY_BREAK_STREAK);
  const streakRef = useRef(streakState);
  streakRef.current = streakState;
  const activeRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const packagesRef = useRef(androidPackages);
  packagesRef.current = androidPackages;
  const trackerRef = useRef<TrackerState>(INITIAL_TRACKER);
  const breaksTodayRef = useRef(0);

  const setBreakActive = useCallback((active: boolean) => {
    activeRef.current = active;
    setBreakActiveState(active);
  }, []);

  const startBreak = useCallback((params: BreakParams) => {
    if (activeRef.current || currentRouteName() === 'Break') return;
    if (!navigationRef.isReady()) { pendingStart = params; return; } // cold start: flushed on ready
    navigationRef.navigate('Break', params);
  }, []);

  const push = useCallback(async (s: BreakSettings) => {
    await applySettings(s, packagesRef.current).catch(() => {});
    if (uid) await saveBreakSettings(uid, s).catch(() => {});
  }, [uid]);

  // ---- load settings and today's counters after sign-in, and push them to the platform ----
  useEffect(() => {
    if (!uid) { setSettings(DEFAULT_BREAK_SETTINGS); setSettingsLoaded(false); return; }
    let cancelled = false;
    Promise.all([loadBreakSettings(uid), loadToday(uid).catch(() => null), loadBreakStreak(uid).catch(() => EMPTY_BREAK_STREAK)])
      .then(([s, today, streak]) => {
        if (cancelled) return;
        setSettings(s);
        setStreakState(streak);
        // Let friends see where the streak stands (the server bounds it; failure is harmless).
        publishBreakStreak(liveBreakStreak(streak, dayKey(new Date()))).catch(() => {});
        if (today) { setPassesUsed(today.passes); breaksTodayRef.current = today.done; setDoneToday(today.done); }
        applySettings(s, getAndroidWatchedPackages()).catch(() => {});
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSettingsLoaded(true); });
    return () => { cancelled = true; };
  }, [uid]);

  const updateSettings = useCallback(async (patch: Partial<BreakSettings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch });
    setSettings(next);
    settingsRef.current = next;
    trackerRef.current = INITIAL_TRACKER; // a changed rule starts a fresh count
    await push(next);
  }, [push]);

  const setAndroidPackages = useCallback(async (pkgs: string[]) => {
    setPackagesState(pkgs);
    packagesRef.current = pkgs;
    await applySettings(settingsRef.current, pkgs).catch(() => {});
  }, []);

  const disableAll = useCallback(async () => {
    setSettings(DEFAULT_BREAK_SETTINGS);
    setPackagesState([]);
    await applySettings(DEFAULT_BREAK_SETTINGS, []).catch(() => {});
  }, []);

  // ---- strict mode ----
  const startStrict = useCallback(async (minutes: number) => {
    const until = Date.now() + Math.max(15, Math.round(minutes)) * 60_000;
    await updateSettings({ strictUntil: until, pausedUntil: 0 });
    if (uid) recordBreakEvent(uid, { kind: 'strict' }).catch(() => {});
  }, [updateSettings, uid]);

  const endStrict = useCallback(async () => { await updateSettings({ strictUntil: 0 }); }, [updateSettings]);

  // ---- emergency pass ----
  const takeEmergencyPass = useCallback(async (opts?: { abandonPending?: boolean }) => {
    if (!settingsRef.current.passEnabled) return false;
    const r = usePass(Date.now(), passesUsed);
    if (!r.ok) return false;
    setPassesUsed(r.usedToday);
    if (uid) recordBreakEvent(uid, { kind: 'pass' }).catch(() => {});
    const next = normalizeSettings({ ...settingsRef.current, pausedUntil: r.pausedUntil });
    setSettings(next);
    settingsRef.current = next;
    trackerRef.current = complete(trackerRef.current);
    if (opts?.abandonPending) await abandonBreak(next);
    await push(next);
    return true;
  }, [passesUsed, push, uid]);

  const completeBreak = useCallback(async (outcome: FinishOutcome, intent?: IntentId, mood?: number) => {
    trackerRef.current = complete(trackerRef.current);
    const before = breaksTodayRef.current;
    breaksTodayRef.current += 1;
    setDoneToday(breaksTodayRef.current);
    const today = dayKey(new Date());
    const nextStreak = advanceBreakStreak(streakRef.current, today);
    setStreakState(nextStreak);
    let xp = 0;
    if (uid) {
      recordBreakEvent(uid, { kind: 'done', outcome, intent, mood, hour: new Date().getHours() }).catch(() => {});
      saveBreakStreak(uid, nextStreak).catch(() => {});
      publishBreakStreak(nextStreak.current).catch(() => {});
      // Capped: only the first few breaks a day pay out (see services/breaks/rewards.ts).
      xp = breakXp(before);
      if (xp > 0) awardXP(uid, xp).then(() => emitDayDataChanged()).catch(() => { xp = 0; });
    }
    await markBreakDone(settingsRef.current);
    return { xp, streak: nextStreak.current };
  }, [uid]);

  // ---- in-app timer: time spent inside UpShift itself ----
  // Strict mode is about the OTHER apps, so it is never applied to UpShift (that
  // would lock the person out of the very screen that holds the emergency pass).
  useEffect(() => {
    if (!uid || !settings.enabled || !settings.includeUpShift) return;
    trackerRef.current = INITIAL_TRACKER;
    const id = setInterval(() => {
      const s = settingsRef.current;
      const now = Date.now();
      const active = AppState.currentState === 'active' && !activeRef.current;
      const r = decide(trackerRef.current, {
        now, watchedInForeground: active, screenOn: true, local: localTime(now),
        switchesLast5Min: 0, breaksToday: Math.max(breaksTodayRef.current, capability() === 'android' ? getNativeCompletedToday() : 0),
        // Calls and navigation can't be seen from inside the app; a workout can.
        inCall: false, navigating: false, workout: currentRouteName() === 'Workout',
        // UpShift itself is never wind-down-blocked, so it can't lock the person out of their own app.
      }, { ...toPolicy(s), strictUntil: 0, windDown: { ...s.windDown, enabled: false } });
      trackerRef.current = r.state;
      // Inside the wind-down window the long exhale is used instead of the chosen style.
      if (r.action === 'break') startBreak({ source: 'in-app', pattern: patternFor(s.pattern, s.windDown, localTime(now)) });
    }, 2000);
    return () => clearInterval(id);
  }, [uid, settings.enabled, settings.includeUpShift, startBreak]);

  // ---- hand-off from the platform ----
  useEffect(() => {
    if (!settings.enabled) return;
    const check = () => {
      const pending = getPendingBreak();
      if (!pending) return;
      startBreak({ source: Platform.OS === 'ios' ? 'ios' : 'android', pkg: pending.pkg || undefined, label: pending.label || undefined });
    };
    check();
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      check();
      // A pause or strict window may have ended while we were away (iOS can't tell us): re-apply.
      applySettings(normalizeSettings(settingsRef.current), packagesRef.current).catch(() => {});
    });
    return () => sub.remove();
  }, [settings.enabled, startBreak]);

  // iOS: tapping the "time for a break" notification opens the app on the break.
  useEffect(() => {
    if (capability() !== 'ios') return;
    let remove: (() => void) | undefined;
    try {
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const sub = Notifications.addNotificationResponseReceivedListener(r => {
        const url = (r.notification.request.content.data as any)?.url;
        if (url === BREAK_DEEP_LINK) startBreak({ source: 'ios' });
      });
      remove = () => sub.remove();
    } catch { /* notifications unavailable */ }
    return () => remove?.();
  }, [startBreak]);

  const value = useMemo<BreakContextType>(() => ({
    settings, settingsLoaded, updateSettings, androidPackages, setAndroidPackages,
    appReady: ready, isBreakActive, setBreakActive, startBreak, completeBreak,
    startStrict, endStrict, passesLeftToday: passesLeft(passesUsed), takeEmergencyPass, disableAll,
    xpNext: breakXp(doneToday), longestBreakStreak: streakState.longest, breakStreak: liveBreakStreak(streakState, dayKey(new Date())), frameColor: bestFrame(streakState.longest)?.color ?? null,
  }), [doneToday, streakState, settings, settingsLoaded, updateSettings, androidPackages, setAndroidPackages, ready, isBreakActive,
    setBreakActive, startBreak, completeBreak, startStrict, endStrict, passesUsed, takeEmergencyPass, disableAll]);

  return <BreakContext.Provider value={value}>{children}</BreakContext.Provider>;
}

export function useBreak() {
  return useContext(BreakContext);
}

/** True while a break is on screen AND the user chose for that kind of thing to pause. */
export function useBreakPause(kind: PauseKind): boolean {
  const { isBreakActive, settings } = useBreak();
  if (!isBreakActive) return false;
  return kind === 'workout' ? settings.pauseWorkout : kind === 'audio' ? settings.pauseAudio : settings.pauseQuestClock;
}

/** Called by the navigation container once it is ready, to open a break requested during startup. */
export function takePendingBreak(): BreakParams | null {
  const p = pendingStart;
  pendingStart = null;
  return p;
}

export { PASS_PAUSE_MS };
