// Wraps the app tree with ThemeContext. Two independent settings, both
// persisted to Firestore so they survive reloads and follow the account:
//
//   autoMode    — when true, the effective theme follows time of day.
//                 7:00–19:00 local = light, everything else = dark. This
//                 is a fixed clock rather than real sunrise/sunset — no
//                 location permission needed, and "roughly day vs night"
//                 is what the feature promises, not an astronomy app.
//   manualMode  — the user's last explicit light/dark pick. Used as the
//                 effective mode whenever autoMode is off, and remembered
//                 so flipping autoMode back on/off doesn't lose the pick.
//
// `mode` (what everything actually renders with) is derived: autoMode
// picks the effective value from the clock; otherwise it's manualMode.
//
// The clock is re-checked every 5 minutes while the app is open, which is
// frequent enough that a session spanning the 7:00/19:00 boundary flips
// live rather than requiring a relaunch, without running a timer that
// fires every second for no visible benefit.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { ThemeContext, ThemeMode, darkPalette, lightPalette } from './themedColors';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUser } from '../context/UserContext';

const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DAY_START_HOUR = 7;   // 7:00am — light mode begins
const DAY_END_HOUR = 19;    // 7:00pm — dark mode begins

function computeAutoMode(): ThemeMode {
  const hour = new Date().getHours();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  // Light by default, always — not auto/time-based. A fresh install (and
  // any existing account that never touched Settings' theme controls) opens
  // in light mode; dark is now something a user opts INTO via Settings, not
  // something the clock or the app's dark-only history picks for them.
  const [autoMode, setAutoModeState] = useState(false);
  const [manualMode, setManualModeState] = useState<ThemeMode>('light');
  const [mode, setMode] = useState<ThemeMode>('light');
  const loadedRef = useRef(false);

  // Load persisted prefs whenever the signed-in user changes. Defaults
  // (autoMode: false, manualMode: 'light') apply if nothing is stored yet.
  useEffect(() => {
    loadedRef.current = false;
    if (!authUser) {
      setAutoModeState(false);
      setManualModeState('light');
      loadedRef.current = true;
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', authUser.uid, 'meta', 'prefs'));
        const data = snap.exists() ? (snap.data() as { themeAutoMode?: boolean; themeManualMode?: ThemeMode }) : {};
        setAutoModeState(data.themeAutoMode ?? false);
        setManualModeState(data.themeManualMode === 'light' || data.themeManualMode === 'dark' ? data.themeManualMode : 'light');
      } catch {
        // silent — defaults already applied
      } finally {
        loadedRef.current = true;
      }
    })();
  }, [authUser?.uid]);

  // Recompute the effective mode whenever autoMode/manualMode change, and
  // on an interval while autoMode is on.
  useEffect(() => {
    function recompute() {
      setMode(autoMode ? computeAutoMode() : manualMode);
    }
    recompute();
    if (!autoMode) return;
    const id = setInterval(recompute, AUTO_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoMode, manualMode]);

  async function persist(next: { autoMode?: boolean; manualMode?: ThemeMode }) {
    if (!authUser) return;
    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'meta', 'prefs'),
        {
          ...(next.autoMode !== undefined ? { themeAutoMode: next.autoMode } : {}),
          ...(next.manualMode !== undefined ? { themeManualMode: next.manualMode } : {}),
        },
        { merge: true }
      );
    } catch {
      // silent — the UI already updated; a stale value on next launch is
      // the worst case, not a broken app.
    }
  }

  function setAutoMode(v: boolean) {
    setAutoModeState(v);
    persist({ autoMode: v });
  }

  function setManualMode(m: ThemeMode) {
    setManualModeState(m);
    persist({ manualMode: m });
  }

  const palette = mode === 'light' ? lightPalette : darkPalette;

  return (
    <ThemeContext.Provider value={{ mode, palette, autoMode, manualMode, setAutoMode, setManualMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
