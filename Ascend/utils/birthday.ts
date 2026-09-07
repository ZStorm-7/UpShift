// Birthday helpers, shared by everything that awards XP and by the
// Dashboard's once-a-day birthday screen trigger.
//
// The stored birthday is month/day only (no year) — see UserProfile in
// context/UserContext.tsx — so "is it their birthday" is a plain
// month/day comparison against the device's local date, with no timezone
// or age arithmetic involved.

/** Multiplier applied to ALL XP earned on the user's birthday. */
export const BIRTHDAY_XP_MULTIPLIER = 5;

export function isBirthdayToday(birthdayMonth?: number, birthdayDay?: number): boolean {
  if (!birthdayMonth || !birthdayDay) return false;
  const now = new Date();
  return now.getMonth() + 1 === birthdayMonth && now.getDate() === birthdayDay;
}

/**
 * The XP multiplier in effect right now — 5x on the user's birthday, 1x
 * otherwise. Callers multiply their base XP by this before awarding, so
 * every XP source (quests, workouts, overtime bonuses) gets the birthday
 * boost from one shared rule rather than each re-deriving it.
 */
export function xpMultiplier(birthdayMonth?: number, birthdayDay?: number): number {
  return isBirthdayToday(birthdayMonth, birthdayDay) ? BIRTHDAY_XP_MULTIPLIER : 1;
}
