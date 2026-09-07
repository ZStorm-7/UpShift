import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// SETUP (two values to fill in, ~3 minutes, no credit card)
//
// 1. Sign up free at https://cloudinary.com
// 2. Your CLOUD NAME is on the dashboard homepage — paste it below.
// 3. Create an UNSIGNED upload preset:
//      Settings (gear icon) → Upload → Upload presets → Add upload preset
//      → set "Signing Mode" to **Unsigned** → Save
//    Copy the preset's name below.
//
// While you're in that preset, tighten these — see the security note further
// down for why it matters:
//      • Folder:                profilePhotos
//      • Allowed formats:       jpg, png, webp
//      • Max file size:         5000000  (5MB)
//      • Max image width/height: 1024
// ---------------------------------------------------------------------------
// Annotated `: string` for the same reason as USDA_API_KEY in
// data/usdaFoodApi.ts — without it TypeScript infers the exact placeholder as a
// *literal* type, so comparing against that placeholder below narrows the type
// to `never` and even `.length` becomes a compile error.
export const CLOUDINARY_CLOUD_NAME: string = 'yuhglwt3';
export const CLOUDINARY_UPLOAD_PRESET: string = 'u4zelzyn';

export function isCloudinaryConfigured(): boolean {
  return (
    CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME_HERE' &&
    CLOUDINARY_UPLOAD_PRESET !== 'YOUR_UNSIGNED_PRESET_HERE' &&
    CLOUDINARY_CLOUD_NAME.length > 0 &&
    CLOUDINARY_UPLOAD_PRESET.length > 0
  );
}

// ---------------------------------------------------------------------------
// SECURITY NOTE — read this, it's a real tradeoff you're accepting.
//
// An "unsigned" preset means the upload needs no secret, which is exactly why
// this works with no backend: the phone posts straight to Cloudinary. The cost
// is that the preset name is visible to anyone who unpacks the app bundle, so
// in principle a stranger could upload their own files to your account.
//
// That's why the preset restrictions above matter — they cap what an abuser
// could do (small images only, one folder, nothing else). The proper fix is
// signed uploads, which need a server to hold the API secret and sign each
// request. That's the same backend problem Cloudflare R2 would have required;
// this trades a little exposure for not needing one at all.
//
// If the app ever gets real users, switch to signed uploads.
// ---------------------------------------------------------------------------

// Turns a local device URI into something FormData will actually send.
//
// This differs by platform, and getting it wrong is a classic source of
// "upload silently produces an empty file":
//   • Web: file:// and blob: URIs must be fetched into a real Blob first.
//   • Native (iOS/Android): React Native's FormData accepts a special
//     { uri, type, name } object and streams the file itself. Passing a Blob
//     here works on some RN versions and not others, so the documented shape
//     is the safe choice.
async function buildFilePart(localUri: string, fileName: string): Promise<any> {
  if (Platform.OS === 'web') {
    const response = await fetch(localUri);
    return response.blob();
  }
  return { uri: localUri, type: 'image/jpeg', name: fileName };
}

// Uploads an image and returns its public HTTPS URL.
// Throws on failure so the caller can show a message.
export async function uploadImageToCloudinary(
  localUri: string,
  fileName: string
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured — see services/cloudinary.ts');
  }

  const formData = new FormData();
  formData.append('file', await buildFilePart(localUri, fileName));
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  // Deliberately NOT setting a Content-Type header. fetch generates the
  // multipart boundary automatically, and setting it by hand omits that
  // boundary — which makes Cloudinary reject the request as malformed.
  const response = await fetch(endpoint, { method: 'POST', body: formData });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Cloudinary upload failed:', response.status, body);
    throw new Error(`Cloudinary upload failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error('Cloudinary response had no secure_url');
  }
  return data.secure_url as string;
}
