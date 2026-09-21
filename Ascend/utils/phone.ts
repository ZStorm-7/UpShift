// Phone number entry helpers shared by AuthMethodScreen's "Continue with
// phone number" flow.
//
// Two concerns kept deliberately separate, per Firebase's own requirement:
// the DISPLAY string (dashed, US-grouped, whatever the user is used to
// typing) and the E.164 string signInWithPhoneNumber actually needs
// ("+15551234567" — no dashes, no spaces, dial code glued directly onto the
// national number). Mixing the two up is what makes phone auth flaky in
// practice, so `composeE164` is the one place that assembly happens.

export type Country = {
  name: string;
  dialCode: string; // digits only, no leading '+'
  flag: string;
};

// A modest, not-exhaustive list — the most commonly picked ~18 countries
// rather than a full ITU table. Good enough for "tap +1 to change it" without
// building a 200-row picker nobody but a handful of users will ever open.
export const COUNTRIES: Country[] = [
  { name: 'United States', dialCode: '1', flag: '🇺🇸' },
  { name: 'Canada', dialCode: '1', flag: '🇨🇦' },
  { name: 'United Kingdom', dialCode: '44', flag: '🇬🇧' },
  { name: 'Australia', dialCode: '61', flag: '🇦🇺' },
  { name: 'India', dialCode: '91', flag: '🇮🇳' },
  { name: 'Germany', dialCode: '49', flag: '🇩🇪' },
  { name: 'France', dialCode: '33', flag: '🇫🇷' },
  { name: 'Spain', dialCode: '34', flag: '🇪🇸' },
  { name: 'Italy', dialCode: '39', flag: '🇮🇹' },
  { name: 'Mexico', dialCode: '52', flag: '🇲🇽' },
  { name: 'Brazil', dialCode: '55', flag: '🇧🇷' },
  { name: 'Japan', dialCode: '81', flag: '🇯🇵' },
  { name: 'South Korea', dialCode: '82', flag: '🇰🇷' },
  { name: 'China', dialCode: '86', flag: '🇨🇳' },
  { name: 'Philippines', dialCode: '63', flag: '🇵🇭' },
  { name: 'Netherlands', dialCode: '31', flag: '🇳🇱' },
  { name: 'Ireland', dialCode: '353', flag: '🇮🇪' },
  { name: 'New Zealand', dialCode: '64', flag: '🇳🇿' },
  { name: 'South Africa', dialCode: '27', flag: '🇿🇦' },
  { name: 'United Arab Emirates', dialCode: '971', flag: '🇦🇪' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // United States, +1

/**
 * Formats a run of raw digits (no dashes, no country code) as US-style
 * ###-###-####, growing a group at a time as the user types.
 *
 *   ''           -> ''
 *   '5'          -> '5'
 *   '555'        -> '555'
 *   '5551'       -> '555-1'
 *   '5551234'    -> '555-123-4'
 *   '5551234567' -> '555-123-4567'
 *
 * Traced by hand: slice(0,3) is always the first group; once there are more
 * than 3 digits a dash is inserted before the next up-to-3; once there are
 * more than 6 a second dash precedes the final up-to-4. Anything past the
 * 10th digit is dropped — a US national number is exactly 10 digits, and
 * signInWithPhoneNumber gets the raw digits separately from this display
 * string anyway.
 */
export function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

/** Strips everything but digits — the inverse direction, used when the user
 *  types into (or pastes over) the already-formatted display field. */
export function extractDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, 10);
}

/**
 * Assembles the E.164 string Firebase's signInWithPhoneNumber requires:
 * dial code and national digits glued together with a single leading '+',
 * no dashes, no spaces. e.g. composeE164('1', '5551234567') -> '+15551234567'.
 */
export function composeE164(dialCode: string, digits: string): string {
  const cleanDial = dialCode.replace(/\D/g, '');
  const cleanDigits = digits.replace(/\D/g, '');
  return `+${cleanDial}${cleanDigits}`;
}
