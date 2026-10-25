// Server-side constants. Limits live ONLY here: the app displays whatever the
// server reports, and nothing the client sends can raise them.

export const MODEL = 'gemini-3.1-flash-lite';
// GEMINI_ENDPOINT_OVERRIDE exists only so tests can point at a local fake; it is never set in production.
export const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT_OVERRIDE
  ?? `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Rolling 24-hour windows, not calendar days: a client-supplied timezone could
// otherwise be flipped to reset the counter.
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type Bucket = 'chat' | 'tool' | 'rescue';
export type Tier = 'free' | 'premium';

export const LIMITS: Record<Tier, Record<Bucket, number>> = {
  free: { chat: 5, tool: 2, rescue: 2 },
  premium: { chat: 50, tool: 15, rescue: 2 },
};

// Abuse controls.
export const BURST_MAX = 8;            // requests per BURST_WINDOW_MS
export const BURST_WINDOW_MS = 60_000;
export const STRIKE_WINDOW_MS = 60 * 60 * 1000;
export const STRIKES_BEFORE_BLOCK = 3;
export const BLOCK_MS = 15 * 60 * 1000;
export const IN_FLIGHT_MS = 70_000;    // one model call per user at a time
export const MAX_REFUNDS_PER_WINDOW = 3;

// Payload caps.
export const MAX_TEXT_CHARS = 1000;
export const MAX_HISTORY_TURNS = 12;
export const MAX_HISTORY_CHARS = 8000;
export const MAX_IMAGE_BASE64_CHARS = 4_500_000; // ~3.4 MB of image
export const MAX_FRIENDS = 25;

// The consent card version the server requires. Bump this (and the app's
// COACH_CONSENT_VERSION) whenever the legal text changes materially.
export const CONSENT_VERSION = 1;

export const PREMIUM_CACHE_MS = 10 * 60 * 1000;
export const REVENUECAT_ENTITLEMENT = 'premium';
