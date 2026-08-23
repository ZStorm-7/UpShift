// Rank names + emoji used to live inside DashboardScreen, but the Leaderboard
// needs the exact same mapping — and two copies of this would drift apart the
// first time a threshold changed. Single source of truth.
export type RankInfo = { rank: string; next: string; emoji: string };

const RANKS: { minLevel: number; name: string; emoji: string }[] = [
  { minLevel: 0, name: 'Rookie', emoji: '🐣' },
  { minLevel: 5, name: 'Grinder', emoji: '💪' },
  { minLevel: 10, name: 'Athlete', emoji: '🏃' },
  { minLevel: 20, name: 'Warrior', emoji: '⚔️' },
  { minLevel: 35, name: 'Champion', emoji: '🏆' },
  { minLevel: 50, name: 'Legend', emoji: '👑' },
  { minLevel: 75, name: 'Mythic', emoji: '🐉' },
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
    emoji: current.emoji,
    next: upcoming
      ? `${upcoming.name} at Level ${upcoming.minLevel}`
      : "You've reached the top!",
  };
}

export function getRankEmoji(rankName: string): string {
  return RANKS.find(r => r.name === rankName)?.emoji || '⚔️';
}
