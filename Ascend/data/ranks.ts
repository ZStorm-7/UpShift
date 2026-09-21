import { Ionicons } from '@expo/vector-icons';

// Rank names + icon used to live inside DashboardScreen, but the Leaderboard
// needs the exact same mapping — and two copies of this would drift apart the
// first time a threshold changed. Single source of truth.
export type RankInfo = { rank: string; next: string; icon: keyof typeof Ionicons.glyphMap };

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
const RANKS: { minLevel: number; name: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { minLevel: 0, name: 'Rookie', icon: 'leaf' },
  { minLevel: 5, name: 'Grinder', icon: 'barbell' },
  { minLevel: 10, name: 'Athlete', icon: 'walk' },
  { minLevel: 20, name: 'Warrior', icon: 'shield' },
  { minLevel: 35, name: 'Champion', icon: 'trophy' },
  { minLevel: 50, name: 'Legend', icon: 'ribbon' },
  { minLevel: 75, name: 'Mythic', icon: 'planet' },
  { minLevel: 100, name: 'Apex', icon: 'flame' },
];

export function getRankInfo(level: number): RankInfo {
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
  const current = RANKS[index];
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
