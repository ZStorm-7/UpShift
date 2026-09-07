import { uploadImageToCloudinary, isCloudinaryConfigured } from './cloudinary';
import { avatarPalette } from '../theme/colors';

// Profile pictures, in order of what a user actually sees:
//
//   1. A real uploaded photo, if they've set one.
//   2. Otherwise, colored initials — deterministic per person, and the user
//      can override the color from `avatarPalette` if they want a different
//      one. See components/Avatar.tsx for the rendering half of this.
//
// There used to be a third option: 12 emoji presets (🦁🐯🐼…). Removed
// entirely — an emoji avatar is the thing that made the app read as a toy
// rather than a product, which is exactly the complaint that started this
// file's rewrite. Existing users who picked one are handled gracefully, not
// specially: firebase/questVerify.ts's Avatar component treats any stored
// `preset:` value the same as no photo at all, which means those accounts
// just start showing their initials on next load. No migration needed.

/** Whether photo upload is available at all. The UI uses this to hide the
 *  upload button rather than offer something that's guaranteed to fail —
 *  the initials avatar works fine without any of this configured. */
export const photoUploadAvailable = isCloudinaryConfigured;

// Uploads a locally-picked image and returns a public URL to store on the
// profile. Storing the URL (not the image bytes) keeps profile documents in
// Firestore small and fast to read.
//
// This used to upload to Firebase Storage, which now requires the paid Blaze
// plan even for tiny amounts of data. Cloudinary's free tier needs no card and
// no backend. The function signature is unchanged on purpose, so the screens
// that call it didn't need editing — the storage provider is an implementation
// detail behind this one function.
export async function uploadProfilePhoto(uid: string, localUri: string): Promise<string> {
  return uploadImageToCloudinary(localUri, `${uid}.jpg`);
}

/* ------------------------------------------------------------------ *
 * Initials avatar
 * ------------------------------------------------------------------ */

/**
 * Up to two letters: first name's first letter, plus the stored last-name
 * initial if there is one. Falls back to "?" for a profile with no name at
 * all yet, rather than rendering blank — an empty circle reads as broken,
 * "?" reads as "still loading".
 */
export function getInitials(firstName?: string, lastInitial?: string): string {
  const first = (firstName ?? '').trim().charAt(0);
  const last = (lastInitial ?? '').trim().charAt(0);
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}

/**
 * A small, fast, deterministic string hash (FNV-1a, 32-bit). Not
 * cryptographic — it doesn't need to be, it just needs the SAME uid to land
 * on the SAME palette slot every time, on every device, forever. Math.random
 * or anything seeded by time would give each user a different color on every
 * app launch, which defeats the entire point of a color being part of their
 * identity.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 0x01000193 (FNV prime), done with shifts because JS numbers
    // aren't true 32-bit ints and Math.imul is the reliable way to multiply
    // two values as if they were.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // coerce to unsigned so the mod below is never negative
}

/**
 * The default avatar color for a user who hasn't chosen one — deterministic
 * from their uid, so it's stable across sessions and devices without needing
 * to be stored anywhere. A profile's explicit `avatarColor` (if the user
 * picked one in Edit Profile) always wins over this; this is only the
 * fallback for "never chose".
 */
export function getDefaultAvatarColor(uid: string): string {
  if (!uid) return avatarPalette[0];
  const index = hashString(uid) % avatarPalette.length;
  return avatarPalette[index];
}
