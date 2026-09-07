// How a user's name is shown to OTHER people (leaderboard, friend lists).
//
// One helper rather than each screen doing its own `${firstName} ${lastInitial}.`
// so the optional displayName override can't be honoured in some places and
// silently ignored in others.

export function displayNameFor(profile: {
  displayName?: string;
  firstName?: string;
  lastInitial?: string;
} | null | undefined): string {
  if (!profile) return 'Someone';
  const custom = profile.displayName?.trim();
  if (custom) return custom;
  const first = profile.firstName?.trim() ?? '';
  const initial = profile.lastInitial?.trim() ?? '';
  const fallback = initial ? `${first} ${initial}.` : first;
  return fallback.trim() || 'Someone';
}

/** Shown on a profile view when the user hasn't written a bio. */
export const NO_BIO_PLACEHOLDER = 'No bio yet.';
