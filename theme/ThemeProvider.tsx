// Wraps the app tree with the ThemeContext, and persists the user's choice
// to Firestore's user profile so it survives reloads and follows the
// account across devices.
//
// The initial mode is 'dark' — the app has shipped dark-only until now, so
// every existing user expects dark on next open. New users default to dark
// too, matching the app icon and splash. Users flip the toggle in Settings.

import { ReactNode, useEffect, useState } from 'react';
import { ThemeContext, ThemeMode, darkPalette, lightPalette } from './themedColors';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUser } from '../context/UserContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [mode, setModeState] = useState<ThemeMode>('dark');

  // Load the persisted preference whenever the signed-in user changes.
  // Failure is silent — an unreadable pref just leaves the default in
  // place, same as any other optional field on the profile.
  useEffect(() => {
    if (!authUser) {
      setModeState('dark');
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', authUser.uid, 'meta', 'prefs'));
        const stored = snap.exists() ? (snap.data() as { themeMode?: ThemeMode }).themeMode : null;
        if (stored === 'light' || stored === 'dark') setModeState(stored);
      } catch {
        // silent — fall back to default
      }
    })();
  }, [authUser?.uid]);

  async function setMode(next: ThemeMode) {
    setModeState(next);
    if (!authUser) return;
    // fire-and-forget: the UI updates immediately, the write catches up.
    // Failure doesn't roll the UI back — the user picked this and can
    // pick it again if a stale value shows up on next launch.
    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'meta', 'prefs'),
        { themeMode: next },
        { merge: true }
      );
    } catch {
      // silent
    }
  }

  const palette = mode === 'light' ? lightPalette : darkPalette;

  return (
    <ThemeContext.Provider value={{ mode, palette, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
