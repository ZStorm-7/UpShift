import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

// ---------------------------------------------------------------------------
// Profile photo uploads, SIGNED by the server.
//
// This used to post to an UNSIGNED Cloudinary preset whose name shipped inside
// the app, which meant anyone who extracted it could upload anything to our
// account. Now each upload is signed by the `signAvatarUpload` Cloud Function:
// the signature is tied to this user's own public_id, limits the format to
// jpg/png/webp and downsizes the image, expires within an hour, and the
// function rate-limits how many signatures a user can request.
//
// The Cloudinary API secret lives only in Secret Manager (see
// docs/coach-deploy.md). In the Cloudinary console, switch the old unsigned
// preset off so the app's previous builds can no longer upload.
// ---------------------------------------------------------------------------

type SignedParams = {
  cloudName: string;
  apiKey: string;
  signature: string;
  params: Record<string, string | number>;
};

// Photo uploads depend on the backend being deployed, so the UI can't know in
// advance. Callers treat a thrown error as "uploads unavailable right now".
export function isCloudinaryConfigured(): boolean {
  return true;
}

async function buildFilePart(localUri: string, fileName: string): Promise<any> {
  if (Platform.OS === 'web') {
    const response = await fetch(localUri);
    return response.blob();
  }
  return { uri: localUri, type: 'image/jpeg', name: fileName };
}

export async function uploadImageToCloudinary(localUri: string, fileName: string): Promise<string> {
  const { data } = await httpsCallable<Record<string, never>, SignedParams>(functions, 'signAvatarUpload')({});

  const form = new FormData();
  form.append('file', await buildFilePart(localUri, fileName));
  form.append('api_key', data.apiKey);
  form.append('signature', data.signature);
  // Every signed parameter must be sent exactly as signed.
  Object.entries(data.params).forEach(([k, v]) => form.append(k, String(v)));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error(`Cloudinary upload failed (${response.status})`);

  const json = await response.json();
  if (!json.secure_url) throw new Error('Cloudinary response had no secure_url');
  return json.secure_url as string;
}
