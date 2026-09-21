// foodRecognition — Gemini-backed food recognition for the Nutrition screen's
// "Picture" tab (photo -> candidates) AND the Manual tab's "Describe your
// meal" fallback (free-text -> candidates). Both call the same Gemini
// generateContent endpoint with a prompt that demands strict JSON back, so
// one small parsing/validation layer serves both entry points.
//
// Previously this file wrapped LogMeal (photo-only, no text-description
// path). Replaced with Google Gemini so photo AND free-text recognition both
// go through one model, MacroFactor-style, and so a typed description like
// "grilled chicken breast with rice and broccoli" gets a real structured
// nutrition estimate instead of requiring a plain search-by-name match.
//
// ---- Getting a free API key (do this once, as the app's developer) ----
//   1. Go to https://aistudio.google.com/apikey and sign in with a Google
//      account.
//   2. Click "Create API key". As of this writing (2026), Google AI
//      Studio's free tier hands you a working key immediately with no
//      Google Cloud project and no billing account required — verify this
//      is still the case on their pricing page, since free-tier terms can
//      change on Google's end.
//   3. Put it in a local `.env` (never committed — see .env.example at the
//      project root) as:
//        EXPO_PUBLIC_GEMINI_API_KEY=your-key-here
//   4. Restart the Expo dev server so the EXPO_PUBLIC_ env var is picked up.
//   Optionally set EXPO_PUBLIC_GEMINI_MODEL to override the model id below
//   without a code change, if Google renames/retires the default.
//
// The key is read once at module load from an EXPO_PUBLIC_ env var (Expo's
// convention for values safe to bundle into the client — this is a
// free-tier API key, not a server secret). If it's missing, every call
// throws FoodRecognitionNotConfiguredError instead of silently failing or
// making a doomed network request, so the UI can catch that ONE specific
// error and point the user at manual entry rather than showing a generic
// "something went wrong".
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

// "flash" tier: fast + cheap, which is what a fire-and-forget "guess this
// meal" call wants. gemini-2.5-flash is confirmed current as of this writing
// (Google's own model docs still list it as the flash-tier "best
// price-performance" model); newer flash generations may exist by the time
// you're reading this; override via EXPO_PUBLIC_GEMINI_MODEL if so.
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class FoodRecognitionNotConfiguredError extends Error {
  constructor() {
    super('Food recognition is not configured (missing EXPO_PUBLIC_GEMINI_API_KEY).');
    this.name = 'FoodRecognitionNotConfiguredError';
  }
}

export class FoodRecognitionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoodRecognitionRequestError';
  }
}

export type FoodRecognitionCandidate = {
  name: string;
  confidence: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sugar?: number;
  fiber?: number;
  sodium?: number;
};

// Shared instruction: identical field contract for both the photo path and
// the text-description path, so one parser/validator handles both and
// nothing downstream (health score, XP, "Not this food?" cycling) needs to
// know which path produced a candidate.
const JSON_CONTRACT = `Respond with ONLY a JSON array (no markdown fences, no commentary) of up to 5 candidate foods, ranked most-likely first. Each element must be an object with exactly these fields:
- "name": string, a short human-readable food/dish name
- "confidence": number from 0 to 1
- "calories": number, total kcal for the described/pictured portion
- "protein": number, grams
- "carbs": number, grams
- "fat": number, grams
- "sugar": number, grams (optional, omit the key if genuinely unknown)
- "fiber": number, grams (optional, omit the key if genuinely unknown)
- "sodium": number, milligrams (optional, omit the key if genuinely unknown)
Estimate nutrition for the WHOLE portion shown/described, not per 100g. If nothing food-related is identifiable, respond with an empty JSON array: [].`;

function photoPrompt(): string {
  return `You are a food recognition system. Look at this photo of food and identify what dish(es) are present.\n\n${JSON_CONTRACT}`;
}

function descriptionPrompt(description: string): string {
  return `You are a nutrition estimation system. A user typed this free-text description of a meal they ate:\n"""${description}"""\n\nIdentify the most likely food(s) they mean and estimate its nutrition.\n\n${JSON_CONTRACT}`;
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

async function callGemini(parts: GeminiPart[]): Promise<FoodRecognitionCandidate[]> {
  if (!GEMINI_API_KEY) {
    throw new FoodRecognitionNotConfiguredError();
  }

  let res: Response;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          // Ask Gemini to emit raw JSON directly — supported on the 1.5/2.0/
          // 2.5 flash generations. Markdown fences are still stripped below
          // defensively in case a future model ignores this on an edge case.
          response_mime_type: 'application/json',
          temperature: 0.2,
        },
      }),
    });
  } catch (err: any) {
    throw new FoodRecognitionRequestError(`Gemini request failed: ${err?.message ?? 'network error'}`);
  }

  if (!res.ok) {
    throw new FoodRecognitionRequestError(`Gemini request failed (${res.status}).`);
  }

  const json: any = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new FoodRecognitionRequestError('Gemini returned no content.');
  }

  return parseCandidates(text);
}

// Defensive parsing: strip a ```json ... ``` (or bare ```) fence if the
// model wraps its answer despite being asked not to, then validate shape so
// a malformed/partial response degrades to "no match" rather than crashing
// the screen or silently logging garbage nutrition numbers.
function parseCandidates(rawText: string): FoodRecognitionCandidate[] {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new FoodRecognitionRequestError('Gemini returned unparseable JSON.');
  }

  if (!Array.isArray(parsed)) return [];

  const toNum = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  return parsed
    .filter((c): c is Record<string, unknown> => c && typeof c === 'object' && typeof c.name === 'string')
    .slice(0, 5)
    .map(c => ({
      name: String(c.name),
      confidence: typeof c.confidence === 'number' && Number.isFinite(c.confidence)
        ? Math.max(0, Math.min(1, c.confidence))
        : 0.5,
      calories: toNum(c.calories),
      protein: toNum(c.protein),
      carbs: toNum(c.carbs),
      fat: toNum(c.fat),
      sugar: toNum(c.sugar),
      fiber: toNum(c.fiber),
      sodium: toNum(c.sodium),
    }));
}

/**
 * recognizeFoodFromImage — sends a (already-compressed) photo to Gemini and
 * returns a list of candidate foods ranked by confidence, richest guess
 * first. Returning the whole ranked list — rather than just the top guess —
 * is what lets the UI's "Not this food?" button cycle through alternatives
 * without a second round-trip to the network.
 *
 * Takes a local file URI (same signature as the old LogMeal-backed version)
 * and base64-encodes it itself via expo-image-manipulator (already a
 * dependency for the photo-compression step upstream), so callers don't need
 * to know Gemini wants inline base64 data rather than a multipart upload.
 */
export async function recognizeFoodFromImage(imageUri: string): Promise<FoodRecognitionCandidate[]> {
  if (!GEMINI_API_KEY) {
    throw new FoodRecognitionNotConfiguredError();
  }

  const ImageManipulator = await import('expo-image-manipulator');
  const encoded = await ImageManipulator.manipulateAsync(imageUri, [], {
    base64: true,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  if (!encoded.base64) {
    throw new FoodRecognitionRequestError('Could not read photo data.');
  }

  return callGemini([
    { text: photoPrompt() },
    { inline_data: { mime_type: 'image/jpeg', data: encoded.base64 } },
  ]);
}

/**
 * recognizeFoodFromDescription — NEW: text-only recognition for a free-typed
 * meal description (the Manual tab's "Can't find it? Describe your meal"
 * option), MacroFactor-style. Same ranked-candidate contract as the photo
 * path, so the UI's existing candidate-picker view works for both.
 */
export async function recognizeFoodFromDescription(description: string): Promise<FoodRecognitionCandidate[]> {
  if (!GEMINI_API_KEY) {
    throw new FoodRecognitionNotConfiguredError();
  }
  const trimmed = description.trim();
  if (!trimmed) return [];

  return callGemini([{ text: descriptionPrompt(trimmed) }]);
}
