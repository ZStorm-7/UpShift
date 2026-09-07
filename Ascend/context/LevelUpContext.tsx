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
// Mounting it at the app root fixes both halves of that:
//
//   * ANY screen can call celebrate() and the takeover plays immediately,
//     on top of whatever is currently showing.
//   * It's measured against the WINDOW, not against a screen's scrolling
//     content. An absolutely-positioned overlay inside a ScrollView is
//     positioned relative to the CONTENT, so a user scrolled down the page
//     saw the celebration land somewhere above the viewport rather than
//     centered on it. At the root there is no scroll ancestor to inherit
//     that offset from.

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Modal } from 'react-native';
import { LevelUpTakeover } from '../components/dashboard';

type Celebration = { level: number; rank: string; progressToNext: number };

type LevelUpContextValue = {
  /**
   * Play the level-up takeover over the current screen.
   * `progressToNext` is 0–1 progress toward the level AFTER the one just
   * reached (e.g. currentXP / xpPerLevel at the moment of leveling up) — it
   * drives the small progress ring that appears at the end of the takeover,
   * showing "and here's what's next" rather than ending cold on the rank
   * name. Pass 0 if it isn't known; the ring will just start empty.
   */
  celebrate: (level: number, rank: string, progressToNext: number) => void;
};

const LevelUpContext = createContext<LevelUpContextValue>({
  celebrate: () => {},
});

export function LevelUpProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Celebration | null>(null);

  const celebrate = useCallback((level: number, rank: string, progressToNext: number) => {
    setActive({ level, rank, progressToNext });
  }, []);


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
