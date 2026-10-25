// Mindful breaks: owns the user's settings, the in-app timer, and the hand-off
// from the native side (Android service / iOS Screen Time) to the Break screen.
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
import {
  BreakSettings, DEFAULT_BREAK_SETTINGS, normalizeSettings,
} from '../services/breaks/settings';
import { loadBreakSettings, saveBreakSettings } from '../services/breaks/settingsStore';
import { INITIAL_TRACKER, step, complete, TrackerState } from '../services/breaks/usageTracker';
import {
  applySettings, capability, getAndroidWatchedPackages, getPendingBreak, markBreakDone, BREAK_DEEP_LINK,
} from '../services/breaks/native';

export type BreakSource = 'in-app' | 'android' | 'ios';
export type BreakParams = { source: BreakSource; pkg?: string; label?: string };

type PauseKind = 'workout' | 'audio' | 'questClock';

type BreakContextType = {
  settings: BreakSettings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<BreakSettings>) => Promise<void>;
  androidPackages: string[];
  setAndroidPackages: (pkgs: string[]) => Promise<void>;
  /** True while the Break screen is showing. */
  /** False while the app's splash is still showing (a cold start from another app). */
  appReady: boolean;
  isBreakActive: boolean;
  setBreakActive: (active: boolean) => void;
  /** Opens the Break screen (no-op if already open). */
  startBreak: (params: BreakParams) => void;
  /** Called when the exercise finishes: lifts native blocks and restarts the interval. */
  completeBreak: () => Promise<void>;
  /** Turns the feature off everywhere on this device (used on account deletion). */
  disableAll: () => Promise<void>;
};

const noop = async () => {};
const BreakContext = createContext<BreakContextType>({
  settings: DEFAULT_BREAK_SETTINGS, settingsLoaded: false, updateSettings: noop,
  androidPackages: [], setAndroidPackages: noop, appReady: true, isBreakActive: false, setBreakActive: () => {},
  startBreak: () => {}, completeBreak: noop, disableAll: noop,
});

let pendingStart: BreakParams | null = null;

export function BreakProvider({ children, ready = true }: { children: ReactNode; ready?: boolean }) {
  const { authUser } = useUser();
  const uid = authUser?.uid;

  const [settings, setSettings] = useState<BreakSettings>(DEFAULT_BREAK_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [androidPackages, setPackagesState] = useState<string[]>(() => getAndroidWatchedPackages());
  const [isBreakActive, setBreakActiveState] = useState(false);
  const activeRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const trackerRef = useRef<TrackerState>(INITIAL_TRACKER);

  const setBreakActive = useCallback((active: boolean) => {
    activeRef.current = active;
    setBreakActiveState(active);
  }, []);

  const startBreak = useCallback((params: BreakParams) => {
    if (activeRef.current || currentRouteName() === 'Break') return;
    if (!navigationRef.isReady()) { pendingStart = params; return; } // cold start: flushed on ready
    navigationRef.navigate('Break', params);
  }, []);

  // ---- load settings after sign-in, and push them to the platform ----
  useEffect(() => {
    if (!uid) { setSettings(DEFAULT_BREAK_SETTINGS); setSettingsLoaded(false); return; }
    let cancelled = false;
    loadBreakSettings(uid)
      .then(s => {
        if (cancelled) return;
        setSettings(s);
        applySettings({ enabled: s.enabled, intervalMin: s.intervalMin, androidPackages: getAndroidWatchedPackages() });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSettingsLoaded(true); });
    return () => { cancelled = true; };
  }, [uid]);

  const updateSettings = useCallback(async (patch: Partial<BreakSettings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch });
    setSettings(next);
    trackerRef.current = INITIAL_TRACKER; // a changed interval starts a fresh count
    await applySettings({ enabled: next.enabled, intervalMin: next.intervalMin, androidPackages: getAndroidWatchedPackages() });
    if (uid) await saveBreakSettings(uid, next).catch(() => {});
  }, [uid]);

  const setAndroidPackages = useCallback(async (pkgs: string[]) => {
    setPackagesState(pkgs);
    const s = settingsRef.current;
    await applySettings({ enabled: s.enabled, intervalMin: s.intervalMin, androidPackages: pkgs });
  }, []);

  const disableAll = useCallback(async () => {
    setSettings(DEFAULT_BREAK_SETTINGS);
    setPackagesState([]);
    await applySettings({ enabled: false, intervalMin: DEFAULT_BREAK_SETTINGS.intervalMin, androidPackages: [] });
  }, []);

  const completeBreak = useCallback(async () => {
    trackerRef.current = complete(trackerRef.current);
    await markBreakDone(settingsRef.current.intervalMin);
  }, []);

  // ---- in-app timer: time spent inside UpShift itself ----
  useEffect(() => {
    if (!uid || !settings.enabled || !settings.includeUpShift) return;
    trackerRef.current = INITIAL_TRACKER;
    const thresholdMs = settings.intervalMin * 60_000;
    const id = setInterval(() => {
      const active = AppState.currentState === 'active' && !activeRef.current;
      const r = step(trackerRef.current, { now: Date.now(), watchedInForeground: active, screenOn: true }, thresholdMs);
      trackerRef.current = r.state;
      if (r.trigger) startBreak({ source: 'in-app' });
    }, 2000);
    return () => clearInterval(id);
  }, [uid, settings.enabled, settings.includeUpShift, settings.intervalMin, startBreak]);

  // ---- hand-off from the platform: a break launched while UpShift was in the background ----
  useEffect(() => {
    if (!settings.enabled) return;
    const check = () => {
      const pending = getPendingBreak();
      if (!pending) return;
      startBreak({ source: Platform.OS === 'ios' ? 'ios' : 'android', pkg: pending.pkg || undefined, label: pending.label || undefined });
    };
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
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
    appReady: ready, isBreakActive, setBreakActive, startBreak, completeBreak, disableAll,
  }), [settings, settingsLoaded, updateSettings, androidPackages, setAndroidPackages, ready, isBreakActive, setBreakActive, startBreak, completeBreak, disableAll]);

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
