// Plausible ranges for the numbers a person types about their body. They feed the calorie and
// water formulas, so a stray "3" for age or "40" inches must not get through. The minimum age
// matches the privacy policy (the app is not for children under 13).

export const AGE_MIN = 13;
export const AGE_MAX = 120;
export const FEET_MIN = 3;
export const FEET_MAX = 8;
export const WEIGHT_MIN_LBS = 40;
export const WEIGHT_MAX_LBS = 1000;

const whole = (v: unknown): number => (/^\s*\d+\s*$/.test(String(v ?? '')) ? parseInt(String(v), 10) : NaN);

export const validAge = (v: unknown): boolean => { const n = whole(v); return n >= AGE_MIN && n <= AGE_MAX; };
export const validFeet = (v: unknown): boolean => { const n = whole(v); return n >= FEET_MIN && n <= FEET_MAX; };
/** Inches may be left blank (5 feet is a complete answer) but must be 0 to 11 when given. */
export const validInches = (v: unknown): boolean => String(v ?? '').trim() === '' || (whole(v) >= 0 && whole(v) <= 11);
export const validWeight = (v: unknown): boolean => { const n = Number(String(v ?? '').trim()); return Number.isFinite(n) && n >= WEIGHT_MIN_LBS && n <= WEIGHT_MAX_LBS; };
