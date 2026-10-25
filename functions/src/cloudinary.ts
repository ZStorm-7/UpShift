// Signed Cloudinary uploads. The unsigned preset that used to live in the app
// let anyone who extracted it upload arbitrary files to our account; now the
// server signs each upload for one specific public_id and constrained options.

import { createHash } from 'node:crypto';

export const CLOUD_NAME = 'yuhglwt3';
export const UPLOAD_OPTIONS = {
  allowed_formats: 'jpg,png,webp',
  // Applied on upload (before storing): downscales anything larger.
  transformation: 'c_limit,w_512,h_512,q_auto',
  overwrite: 'true',
  invalidate: 'true',
} as const;

// Cloudinary: sort params alphabetically, join as key=value with &, append the
// API secret, SHA-1 hex. Empty values are excluded.
export function sign(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params).sort()
    .filter(k => params[k] !== '' && params[k] !== undefined)
    .map(k => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

export const avatarPublicId = (uid: string) => `avatars/${uid}`;

export function signedAvatarParams(uid: string, apiKey: string, apiSecret: string, now: number) {
  const timestamp = Math.floor(now / 1000);
  const params = { ...UPLOAD_OPTIONS, public_id: avatarPublicId(uid), timestamp };
  return { cloudName: CLOUD_NAME, apiKey, params, signature: sign(params, apiSecret) };
}
