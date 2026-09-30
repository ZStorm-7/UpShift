import { Ionicons } from '@expo/vector-icons';

// Rank names + icon used to live inside DashboardScreen, but the Leaderboard
// needs the exact same mapping — and two copies of this would drift apart the
// first time a threshold changed. Single source of truth.
export type RankInfo = { rank: string; next: string; icon: keyof typeof Ionicons.glyphMap };

export type RankTheme = {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Drives the rank-up takeover's ring/rays/text color (see
   * components/dashboard.tsx's LevelUpTakeover `themeColor` prop) — this is
   * the ONE thing that makes each rank's celebration feel distinct, since
   * the takeover itself is one shared timeline/template, not 8 separate
   * animations (see RankUpContext's own comment for why). */
  color: string;
  /** One line under the rank name on the rank-up takeover — the closest
   * thing to a unique "moment" per rank without a bespoke animation. */
  tagline: string;
};

// Level 100 is the intended ceiling — see xpRequiredForLevel in
// firebase/progress.ts for why that's now a genuinely long climb (the
// per-level XP cost grows exponentially, where it used to be flat). Apex is
// the true highest rank, reached at level 100.
//
// Levels don't literally stop at 100 — a player who gets there keeps
// earning XP and climbing levels forever ("prestige"), but getRankInfo
// below has no tier above Apex to walk into, so the RANK TITLE freezes
// there permanently. The level number is what keeps proving how far past
// the cap someone has gone; the rank badge itself just stays capped.
const RANKS: ({ minLevel: number } & RankTheme)[] = [
  { minLevel: 0,   name: 'Rookie',  icon: 'leaf',    color: '#00C805', tagline: 'Everyone starts here.' },
  { minLevel: 5,   name: 'Grinder', icon: 'barbell', color: '#F59E0B', tagline: 'The work is starting to show.' },
  { minLevel: 10,  name: 'Athlete', icon: 'walk',    color: '#3B82F6', tagline: 'Consistency is becoming who you are.' },
  { minLevel: 20,  name: 'Warrior', icon: 'shield',  color: '#DC2626', tagline: 'You show up even when it\'s hard.' },
  { minLevel: 35,  name: 'Champion',icon: 'trophy',  color: '#EAB308', tagline: 'Most people never get this far.' },
  { minLevel: 50,  name: 'Legend',  icon: 'ribbon',  color: '#8B5CF6', tagline: 'Your story is the one others follow.' },
  { minLevel: 75,  name: 'Mythic',  icon: 'planet',  color: '#06B6D4', tagline: 'Barely anyone reaches this far.' },
  { minLevel: 100, name: 'Apex',    icon: 'flame',   color: '#F97316', tagline: 'The top of the mountain. Keep climbing.' },
];

export function getRankInfo(level: number): RankInfo {
  const current = rankTierFor(level);
  const index = RANKS.findIndex(r => r.name === current.name);
  const upcoming = RANKS[index + 1];
  return {
    rank: current.name,
    icon: current.icon,
    next: upcoming
      ? `${upcoming.name} at Level ${upcoming.minLevel}`
      : "You've reached the top!",
  };
}

export function getRankIcon(rankName: string): keyof typeof Ionicons.glyphMap {
  return RANKS.find(r => r.name === rankName)?.icon || 'shield';
}

/** Full theme (icon, color, tagline) for the rank a given level sits in —
 * used by the rank-up takeover to pick which of the 8 looks to show. */
export function getRankTheme(level: number): RankTheme {
  return rankTierFor(level);
}

function rankTierFor(level: number) {
  // Walk backwards to find the highest tier the level qualifies for, so the
  // thresholds only need listing once (the old version repeated each number
  // in both a comparison and the "next rank" string).
  let index = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) {
      index = i;
      break;
    }
  }
  return RANKS[index];
}
