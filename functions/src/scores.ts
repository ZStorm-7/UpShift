// Validation for leaderboard rows. Pure.

export type ScoreInput = {
  displayName: string; avatar: string; avatarColor?: string;
  level: number; totalXP: number; rank: string; streak: number;
};

const str = (v: unknown, max: number) => String(v ?? '').slice(0, max);
const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v)) || 0));

// Avatars must be an https URL on our own Cloudinary account (or empty), so a
// row can't be used to make other users' devices fetch an arbitrary URL.
export function validAvatar(url: unknown, cloudName: string): string {
  const s = str(url, 300);
  if (!s) return '';
  return s.startsWith(`https://res.cloudinary.com/${cloudName}/`) ? s : '';
}

export function cleanScore(raw: any, cloudName: string): ScoreInput {
  const color = str(raw?.avatarColor, 9);
  return {
    displayName: str(raw?.displayName, 40).replace(/[\u0000-\u001f]/g, ''),
    avatar: validAvatar(raw?.avatar, cloudName),
    ...(/^#[0-9a-fA-F]{3,8}$/.test(color) ? { avatarColor: color } : {}),
    level: Math.max(1, int(raw?.level, 1000)),
    totalXP: int(raw?.totalXP, 10_000_000),
    rank: str(raw?.rank, 30),
    streak: int(raw?.streak, 10_000),
  };
}
