// LevelUpContext — the level-up celebration, hoisted out of DashboardScreen
// so it can play over WHATEVER screen the user is on.
//
// It used to live inside DashboardScreen's own render tree, which meant the
// single best moment in the app could only ever appear in one place. Level
// changes are driven by XP, and XP is earned all over the app — finishing a
// workout, logging food, completing a quest — so a user who levelled up while
// on the Workout or Nutrition screen either saw nothing, or saw it only later
// when they happened to return to the Dashboard, by which point it's no longer
// a reaction to anything they did.
//
// Mounting the TAKEOVER at the app root only solved half of that problem —
// it plays on top of whatever screen is showing, WHEN something calls
// celebrate(). But for a long time the only thing that ever called it was
// DashboardScreen's own effect, comparing its own locally-loaded `level`
// state to what it was a moment ago. That state is fetched once (a plain
// getDoc, not a live listener) when Dashboard mounts — so finishing a
// workout on WorkoutScreen, which calls awardXP() directly and never touches
// Dashboard's state, produced a level-up with nobody watching for it. The
// user would only find out on their NEXT visit to Dashboard, by which point
// prevLevelRef there had already caught up silently in the background (no
// comparison ever fired, because nothing re-ran that effect while a real
// level change happened on another screen) — so no celebration ever played
// for it at all, not even a late one.
//
// The fix: this provider watches the SAME stats document itself, with a
// live onSnapshot instead of a one-time read, mounted once at the app root
// regardless of which screen is focused. Any XP award anywhere in the app —
// Dashboard, Workout, Nutrition, wherever — writes to that one document
// (see firebase/progress.ts's awardXP), and this listener sees the level
// change the instant Firestore commits it, whether or not Dashboard is even
// mounted at that moment. No other screen has to remember to call
// celebrate() itself; this is the one and only place that decides a level
// went up.
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Modal } from 'react-native';
import { onSnapshot } from 'firebase/firestore';
import { LevelUpTakeover } from '../components/dashboard';
import { useUser } from './UserContext';
import { statsDocRef, xpRequiredForLevel } from '../firebase/progress';
import { getRankInfo, getRankTheme, RankTheme } from '../data/ranks';
import haptics from '../services/haptics';

type Celebration = {
  level: number;
  rank: string;
  progressToNext: number;
  /** Set only when this level-up also crossed into a new rank tier — see
   * the onSnapshot handler below, which is the one place that decides
   * "level-up" vs "level-up AND rank-up" by comparing the rank NAME before
   * and after, not just the raw level number. */
  rankTheme?: RankTheme;
};

type LevelUpContextValue = {
  /**
   * Manual escape hatch — normally nothing needs to call this directly (see
   * the file comment: the provider detects level-ups itself), but it's kept
   * available for a screen that wants to force the takeover for some other
   * reason. `progressToNext` is 0–1 progress toward the level AFTER the one
   * just reached, driving the small progress ring at the end of the takeover.
   */
  celebrate: (level: number, rank: string, progressToNext: number, rankTheme?: RankTheme) => void;
};

const LevelUpContext = createContext<LevelUpContextValue>({
  celebrate: () => {},
});

export function LevelUpProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [active, setActive] = useState<Celebration | null>(null);

  function celebrate(level: number, rank: string, progressToNext: number, rankTheme?: RankTheme) {
    setActive({ level, rank, progressToNext, rankTheme });
  }

  // Starts as null so the very first snapshot (going from "nothing loaded
  // yet" to whatever level was saved) never counts as a level-up — only a
  // real increase *after* that first snapshot should trigger the takeover.
  // Same guard DashboardScreen's old version needed, for the same reason:
  // without it, every fresh sign-in for a level-12 user would fire a
  // "Level Up!" celebration for a level earned weeks ago.
  const prevLevelRef = useRef<number | null>(null);

  useEffect(() => {
    // A new/different signed-in account starts this tracking over — the
    // next snapshot for THEM is a fresh "first load", not a level-up
    // relative to whatever the previous account's level happened to be.
    prevLevelRef.current = null;
    if (!authUser) return;

    const unsubscribe = onSnapshot(statsDocRef(authUser.uid), snap => {
      const data = snap.exists() ? (snap.data() as { level?: number; currentXP?: number }) : {};
      const level = data.level ?? 1;
      const currentXP = data.currentXP ?? 0;

      if (prevLevelRef.current !== null && level > prevLevelRef.current) {
        // A RANK-up is a level-up whose rank NAME differs from the previous
        // level's — comparing names (not just crossing one of RANKS' minLevel
        // thresholds directly) means this stays correct even if someone
        // jumps several levels at once (a big birthday-multiplier XP grant,
        // say) and lands past more than one rank boundary in a single award;
        // it only ever compares "where they were" to "where they ended up".
        const prevRank = getRankInfo(prevLevelRef.current).rank;
        const newRank = getRankInfo(level).rank;
        const rankTheme = newRank !== prevRank ? getRankTheme(level) : undefined;
        celebrate(level, newRank, currentXP / xpRequiredForLevel(level), rankTheme);
        // Fired here, on the same update that triggers the takeover, rather
        // than inside the takeover component itself — see the takeover's
        // own render for why the physical buzz and the visual burst need to
        // land on the same frame to read as one event, not two.
        haptics.levelUp();
      }
      prevLevelRef.current = level;
    });

    return unsubscribe;
  }, [authUser?.uid]);

  return (
    <LevelUpContext.Provider value={{ celebrate }}>
      {children}
      {/* A Modal rather than an absolutely-positioned View. A Modal is
          measured against the window, which is what "takeover" means — and
          it renders above every screen, including any other modal a screen
          may already have open. animationType="none" because the takeover
          runs its own 2.5s timeline; letting the OS slide it in first would
          push the whole thing past its budget. */}
      <Modal visible={!!active} transparent animationType="none" statusBarTranslucent>
        {!!active && (
          <LevelUpTakeover
            level={active.level}
            rank={active.rank}
            progressToNext={active.progressToNext}
            rankTheme={active.rankTheme}
            onDone={() => setActive(null)}
          />
        )}
      </Modal>
    </LevelUpContext.Provider>
  );
}

export function useLevelUp() {
  return useContext(LevelUpContext);
}
