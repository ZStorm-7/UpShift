// MOVED — this file is kept only so nothing breaks if an old import lingers.
//
// Avatars aren't a Firebase concern anymore: Firebase Storage now requires the
// paid Blaze plan, so photo uploads (when enabled) go to Cloudinary instead.
// The real implementation lives in services/avatar.ts.
//
// PRESET_AVATARS (the 12-emoji picker) no longer exists there — it was
// removed along with the rest of the emoji avatar system, in favor of real
// photos and colored initials. Dropped from this re-export too, rather than
// left pointing at a name that would just fail to resolve.
//
// Safe to delete this file once you've confirmed nothing imports it.
export { uploadProfilePhoto, photoUploadAvailable } from '../services/avatar';
