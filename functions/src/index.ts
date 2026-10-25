// The AI coach backend. The Gemini key lives in Secret Manager and never
// reaches the app. Every call is authenticated, consent-checked, rate-limited
// and quota-checked here, so a modified client can't lift any of it.

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import {
  CONSENT_VERSION, MAX_IMAGE_BASE64_CHARS, type Bucket,
} from './config.ts';
import { screenText, looksLikeInjection } from './safety.ts';
import {
  systemPrompt, asLang, asTone, TOOLS, MEAL_PHOTO_SCHEMA, WORKOUT_PLAN_SCHEMA, MEAL_PLAN_SCHEMA, CHALLENGE_SCHEMA,
  type Profile,
} from './prompts.ts';
import {
  cleanHistory, clampText, cleanMeal, cleanPlan, cleanMealPlan, cleanAllergies, allergenHits,
  calorieMisses, cleanFriends, cleanStyleSuggestion, type MealItem,
} from './validate.ts';
import { generate, textOf, parseJson, sourcesOf, type Content } from './gemini.ts';
import {
  loadPrefs, loadProfile, resolveTier, reserveUnit, releaseUnit, addStrike, readUsage, historyFor, breakStatsFor, db,
} from './store.ts';
import { getAuth } from 'firebase-admin/auth';
import { hit, applyXpBank, isRecentLogin, maxPlausibleStreak, type XpState } from './ratelimit.ts';
import { cleanScore } from './scores.ts';
import { signedAvatarParams, CLOUD_NAME } from './cloudinary.ts';
import { deleteAllUserData } from './account.ts';
import { resolveTrialStart, trialClaimId } from './trial.ts';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REVENUECAT_SECRET = defineSecret('REVENUECAT_SECRET_KEY');
const CLOUDINARY_API_KEY = defineSecret('CLOUDINARY_API_KEY');
const CLOUDINARY_API_SECRET = defineSecret('CLOUDINARY_API_SECRET');

type Mode = 'usage' | 'chat' | 'photo' | 'plan' | 'mealplan' | 'rescue' | 'challenge';
const BUCKET: Record<Exclude<Mode, 'usage'>, Bucket> = {
  chat: 'chat', photo: 'tool', plan: 'tool', mealplan: 'tool', challenge: 'tool', rescue: 'rescue',
};

export const coach = onCall(
  { secrets: [GEMINI_API_KEY, REVENUECAT_SECRET], timeoutSeconds: 90, memory: '512MiB', maxInstances: 20, region: 'us-central1' },
  async (req: CallableRequest) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const data = (req.data ?? {}) as Record<string, any>;
    const mode = data.mode as Mode;
    const now = Date.now();
    const tz = Math.min(840, Math.max(-840, Math.round(Number(data.tzOffsetMinutes) || 0)));

    const { tier } = await resolveTier(uid, REVENUECAT_SECRET.value(), now);
    if (mode === 'usage') return { usage: await readUsage(uid, tier, now) };
    if (!(mode in BUCKET)) throw new HttpsError('invalid-argument', 'Unknown mode.');

    const prefs = await loadPrefs(uid);
    if (!prefs.consented || (prefs.consentVersion ?? 0) < CONSENT_VERSION) {
      throw new HttpsError('failed-precondition', 'consent-required');
    }
    const profileDoc = await loadProfile(uid);
    const lang = asLang(profileDoc?.language);
    const tone = asTone(prefs.tone);
    const personalize = prefs.useData !== false;
    const profile: Profile | null = personalize && profileDoc ? {
      firstName: profileDoc.firstName, goal: profileDoc.goal,
      activityLevel: profileDoc.activityLevel, calorieGoal: profileDoc.calorieGoal,
    } : null;

    // ---- Validate the payload BEFORE spending quota ----
    const text = clampText(data.text);
    const history = cleanHistory(data.history);
    let image: { b64: string; mime: string } | null = null;
    if (mode === 'chat') {
      if (!history.length || history[history.length - 1].role !== 'user') throw new HttpsError('invalid-argument', 'No message.');
      const last = history[history.length - 1].text;
      const s = screenText(last, lang);
      if (s.kind !== 'ok') {
        logger.info('coach.safety', { uid, kind: s.kind });
        return { text: s.reply, safety: true, usage: await readUsage(uid, tier, now) };
      }
      if (looksLikeInjection(last)) { logger.warn('coach.injection', { uid }); await addStrike(uid, now); }
    }
    if (mode === 'photo') {
      const b64 = String(data.imageBase64 ?? '');
      const mime = String(data.mimeType ?? 'image/jpeg');
      if (!b64 || b64.length > MAX_IMAGE_BASE64_CHARS || !/^image\/(jpeg|png|webp)$/.test(mime)) {
        await addStrike(uid, now);
        throw new HttpsError('invalid-argument', 'Bad image.');
      }
      image = { b64, mime };
    }

    const bucket = BUCKET[mode as Exclude<Mode, 'usage'>];
    const decision = await reserveUnit(uid, bucket, tier, now);
    if (!decision.ok) {
      logger.warn('coach.denied', { uid, code: decision.code, bucket });
      throw new HttpsError('resource-exhausted', decision.code, { code: decision.code, retryAt: decision.retryAt, bucket });
    }

    const key = GEMINI_API_KEY.value();
    let failed = false;
    try {
      const result = await run(mode, {
        uid, key, tone, lang, profile, personalize, tz, history, text, image, data, prefs, profileDoc,
      });
      return { ...result, usage: await readUsage(uid, tier, Date.now()) };
    } catch (e) {
      failed = true;
      if (e instanceof HttpsError) throw e;
      logger.error('coach.failure', { uid, mode, err: String(e) });
      throw new HttpsError('unavailable', 'upstream');
    } finally {
      await releaseUnit(uid, bucket, Date.now(), failed).catch(err => logger.error('coach.release', { err: String(err) }));
    }
  },
);

type Ctx = {
  uid: string; key: string; tone: ReturnType<typeof asTone>; lang: ReturnType<typeof asLang>;
  profile: Profile | null; personalize: boolean; tz: number; history: ReturnType<typeof cleanHistory>;
  text: string; image: { b64: string; mime: string } | null; data: Record<string, any>;
  prefs: Awaited<ReturnType<typeof loadPrefs>>; profileDoc: Record<string, any> | null;
};

async function run(mode: Mode, c: Ctx): Promise<Record<string, unknown>> {
  const sys = (extra?: string) => systemPrompt({ tone: c.tone, lang: c.lang, profile: c.profile, screen: c.data.screen, extra });
  const json = (schema: unknown, temperature: number) => ({ temperature, responseMimeType: 'application/json', responseSchema: schema });

  switch (mode) {
    case 'chat': return chat(c, sys());

    case 'photo': {
      const out = await generate(c.key, {
        systemInstruction: { parts: [{ text: 'You estimate nutrition from food photos. Be honest about uncertainty; portions are estimates. Reply text in ' + c.lang + '.' }] },
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: c.image!.mime, data: c.image!.b64 } },
          { text: 'Identify each food or drink and estimate calories and macros (grams) for the visible portion.' },
        ] }],
        generationConfig: json(MEAL_PHOTO_SCHEMA, 0.2),
      });
      const p = parseJson(out);
      const items: MealItem[] = (p.items ?? []).slice(0, 12).map(cleanMeal);
      return { text: String(p.note || '').slice(0, 400), card: items.length ? { kind: 'meal', items } : undefined };
    }

    case 'plan': {
      const request = clampText(c.data.request, 300);
      const out = await generate(c.key, {
        systemInstruction: { parts: [{ text: sys('You design safe, progressive 7-day workout plans.') }] },
        contents: [{ role: 'user', parts: [{ text: `Build my 7-day workout plan (Monday to Sunday, English weekday names in "day"). Include rest days. Max 6 exercises per day. ${request}` }] }],
        generationConfig: json(WORKOUT_PLAN_SCHEMA, 0.5),
      });
      const p = parseJson(out);
      const days = cleanPlan(p);
      if (!days.length) throw new HttpsError('unavailable', 'empty-plan');
      return { text: String(p.summary || '').slice(0, 400), card: { kind: 'plan', days } };
    }

    case 'mealplan': {
      const allergies = cleanAllergies(c.data.allergies ?? c.prefs.allergies);
      const diet = clampText(c.data.diet ?? c.prefs.diet, 60);
      const goal = Number(c.profileDoc?.calorieGoal) || 0;
      const base = `Create a 7-day meal plan (Monday to Sunday, English weekday names in "day") with breakfast, lunch, dinner and one snack each day. ` +
        (goal ? `Each day must total about ${goal} kcal (within 10%). ` : '') +
        (diet ? `Dietary style: ${diet}. ` : '') +
        (allergies.length ? `The user is allergic to or avoids: ${allergies.join(', ')}. NEVER include these or their derivatives. ` : '') +
        'List every ingredient with a numeric quantity and unit, and a grocery aisle.';
      let feedback = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const out = await generate(c.key, {
          systemInstruction: { parts: [{ text: sys('You are a careful meal planner. Never include allergens the user listed.') }] },
          contents: [{ role: 'user', parts: [{ text: base + feedback }] }],
          generationConfig: json(MEAL_PLAN_SCHEMA, 0.6),
        });
        const p = parseJson(out);
        const days = cleanMealPlan(p);
        const hits = allergies.length ? allergenHits(days, allergies) : [];
        const misses = calorieMisses(days, goal);
        if (!hits.length && !misses.length) return { text: String(p.summary || '').slice(0, 400), card: { kind: 'mealplan', days, allergies } };
        if (attempt === 1) {
          if (hits.length) throw new HttpsError('failed-precondition', 'allergen-conflict');
          return { text: String(p.summary || '').slice(0, 400), card: { kind: 'mealplan', days, allergies, calorieNote: misses.join('; ') } };
        }
        feedback = `\nFix these problems from the previous attempt: ${[...hits.map(h => `allergen ${h}`), ...misses.map(m => `calories off (${m})`)].join('; ')}.`;
      }
      throw new HttpsError('unavailable', 'meal-plan');
    }

    case 'rescue': {
      const streak = Math.min(9999, Math.max(1, Math.round(Number(c.data.streak)) || 1));
      const out = await generate(c.key, {
        systemInstruction: { parts: [{ text: sys() }] },
        contents: [{ role: 'user', parts: [{ text: `Write ONE push-notification sentence (max 110 characters, no quotes, at most one emoji) urging me to finish today's quests to keep my ${streak}-day streak.` }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 80 },
      });
      return { text: textOf(out).replace(/^["']|["']$/g, '').slice(0, 140) };
    }

    case 'challenge': {
      const friends = cleanFriends(c.data.friends);
      if (!friends.length) return { text: '', card: { kind: 'challenge', suggestions: [] } };
      const out = await generate(c.key, {
        systemInstruction: { parts: [{ text: sys('You suggest friendly fitness challenges. The only supported challenge type is "most workouts this week". Only suggest friends from the list, by their exact uid.') }] },
        contents: [{ role: 'user', parts: [{ text: `My friends (public leaderboard data): ${JSON.stringify(friends)}. Suggest up to 3 friends to challenge this week, preferring friends close to me in level or streak so it is fair. Give each a short goalLabel (max 40 chars) and a one-sentence reason.` }] }],
        generationConfig: json(CHALLENGE_SCHEMA, 0.7),
      });
      const byUid = new Map(friends.map(f => [f.uid, f]));
      const suggestions = (parseJson(out).suggestions ?? []).slice(0, 3)
        .filter((s: any) => byUid.has(s.uid))
        .map((s: any) => ({ uid: s.uid, name: byUid.get(s.uid)!.name, goalLabel: String(s.goalLabel).slice(0, 40), reason: String(s.reason).slice(0, 160) }));
      return { text: '', card: { kind: 'challenge', suggestions } };
    }
  }
  throw new HttpsError('invalid-argument', 'Unknown mode.');
}

// Function-calling loop. The model chooses between logging food, a sourced
// web lookup, and reading the user's own history, so there is no regex routing
// and a single reply can use more than one of them.
async function chat(c: Ctx, system: string): Promise<Record<string, unknown>> {
  const contents: Content[] = c.history.map(t => ({ role: t.role, parts: [{ text: t.text }] }));
  let card: Record<string, unknown> | undefined;
  const sources: { title: string; uri: string }[] = [];

  for (let round = 0; round < 3; round++) {
    const out = await generate(c.key, {
      systemInstruction: { parts: [{ text: system }] },
      contents, tools: [TOOLS],
      generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
    });
    const modelContent = out?.candidates?.[0]?.content;
    const parts: any[] = modelContent?.parts ?? [];
    const calls = parts.filter(p => p.functionCall);
    if (!calls.length) {
      const text = textOf(out) || (card ? 'Here is my estimate. Tap Log to add it to today.' : '');
      if (!text) throw new HttpsError('unavailable', 'empty');
      return { text, sources: sources.slice(0, 4), card };
    }
    contents.push({ role: 'model', parts });
    const responses = await Promise.all(calls.map(async p => {
      const { name, args } = p.functionCall;
      let response: Record<string, unknown>;
      if (name === 'log_food') {
        const items: MealItem[] = (args?.items ?? []).slice(0, 12).map(cleanMeal);
        if (items.length) card = { kind: 'meal', items };
        response = { status: 'shown_to_user_for_confirmation', note: 'Do not claim it is already logged.' };
      } else if (name === 'research') {
        const q = clampText(args?.question, 300);
        const r = await generate(c.key, {
          systemInstruction: { parts: [{ text: 'Answer factually and concisely using search. Note uncertainty where evidence is mixed. Reply in ' + c.lang + '.' }] },
          contents: [{ role: 'user', parts: [{ text: q }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        });
        sources.push(...sourcesOf(r));
        response = { answer: textOf(r) };
      } else if (name === 'get_break_stats') {
        response = c.personalize
          ? await breakStatsFor(c.uid, Number(args?.days) || 14, c.tz)
          : { error: 'The user turned off personalization. Tell them they can enable it in coach settings.' };
      } else if (name === 'suggest_breathing_style') {
        const sug = cleanStyleSuggestion(args);
        if (sug) card = { kind: 'pattern', ...sug };
        response = sug
          ? { status: 'shown_to_user_for_confirmation', note: 'Do not claim it is already applied.' }
          : { error: 'pattern must be calm, sigh, box or long' };
      } else if (name === 'get_history') {
        response = c.personalize
          ? await historyFor(c.uid, Number(args?.days) || 7, c.tz)
          : { error: 'The user turned off personalization. Tell them they can enable it in coach settings.' };
      } else {
        response = { error: 'unknown tool' };
      }
      return { functionResponse: { name, response } };
    }));
    contents.push({ role: 'user', parts: responses });
  }
  throw new HttpsError('unavailable', 'tool-loop');
}



// ---------------------------------------------------------------------------
// Account deletion. Requires a login from the last 5 minutes so a stolen,
// idle session can't wipe an account; the app re-asks for the password first.
// ---------------------------------------------------------------------------
export const deleteAccount = onCall(
  { secrets: [REVENUECAT_SECRET, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET], timeoutSeconds: 300, region: 'us-central1' },
  async (req: CallableRequest) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!isRecentLogin(req.auth?.token?.auth_time as number | undefined, Date.now())) {
      throw new HttpsError('failed-precondition', 'recent-login-required');
    }
    logger.info('account.delete', { uid });
    await deleteAllUserData(uid, {
      cloudinaryKey: CLOUDINARY_API_KEY.value(), cloudinarySecret: CLOUDINARY_API_SECRET.value(),
      revenuecat: REVENUECAT_SECRET.value(),
    });
    return { deleted: true };
  },
);

// ---------------------------------------------------------------------------
// Signed avatar uploads (replaces the unsigned Cloudinary preset).
// ---------------------------------------------------------------------------
export const signAvatarUpload = onCall(
  { secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET], region: 'us-central1' },
  async (req: CallableRequest) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const ref = db.doc(`rateLimits/${uid}`);
    const now = Date.now();
    const ok = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const next = hit(snap.data()?.signUpload, now, 10, 60 * 60 * 1000);
      if (!next) return false;
      tx.set(ref, { signUpload: next }, { merge: true });
      return true;
    });
    if (!ok) throw new HttpsError('resource-exhausted', 'Too many uploads. Try again later.');
    return signedAvatarParams(uid, CLOUDINARY_API_KEY.value(), CLOUDINARY_API_SECRET.value(), now);
  },
);

// ---------------------------------------------------------------------------
// Leaderboard writes. Clients can no longer write `leaderboard/{uid}`; they
// ask the server, which validates the row and bounds how quickly XP can grow.
// ---------------------------------------------------------------------------
export const publishScore = onCall({ region: 'us-central1' }, async (req: CallableRequest) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const entry = cleanScore(req.data, CLOUD_NAME);
  if (!entry.displayName) throw new HttpsError('invalid-argument', 'Missing name.');
  const now = Date.now();
  const lbRef = db.doc(`leaderboard/${uid}`);
  const rlRef = db.doc(`rateLimits/${uid}`);

  const result = await db.runTransaction(async tx => {
    const [lb, rl] = await Promise.all([tx.get(lbRef), tx.get(rlRef)]);
    const limited = hit(rl.data()?.publish, now, 60, 60 * 60 * 1000);
    if (!limited) return { limited: true as const };
    const prev = lb.exists ? Number(lb.data()?.totalXP) || 0 : null;
    const xp = applyXpBank(prev, rl.data()?.xp as XpState | undefined, entry.totalXP, now);
    // merge: keeps fields other functions own (breakStreak) when the app republishes its score.
    tx.set(lbRef, { uid, ...entry, totalXP: xp.total }, { merge: true });
    tx.set(rlRef, { publish: limited, xp: xp.state }, { merge: true });
    return { limited: false as const, clamped: xp.clamped };
  });
  if (result.limited) throw new HttpsError('resource-exhausted', 'Too many updates.');
  if (result.clamped) logger.warn('score.clamped', { uid });
  return { ok: true };
});



// ---------------------------------------------------------------------------
// Mindful-break streak on the leaderboard row, so friends can see it. Only
// updates an existing row (the score publisher creates it), and is bounded by
// how old the account is.
// ---------------------------------------------------------------------------
export const publishBreakStreak = onCall({ region: 'us-central1' }, async (req: CallableRequest) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const asked = Math.max(0, Math.floor(Number(req.data?.breakStreak)) || 0);
  const now = Date.now();
  const created = Date.parse((await getAuth().getUser(uid)).metadata.creationTime) || now;
  const value = Math.min(asked, maxPlausibleStreak(created, now), 10_000);

  const lbRef = db.doc(`leaderboard/${uid}`);
  const rlRef = db.doc(`rateLimits/${uid}`);
  const ok = await db.runTransaction(async tx => {
    const [lb, rl] = await Promise.all([tx.get(lbRef), tx.get(rlRef)]);
    const limited = hit(rl.data()?.streakPub, now, 30, 60 * 60 * 1000);
    if (!limited) return 'limited' as const;
    if (!lb.exists) return 'no-row' as const;
    tx.set(lbRef, { breakStreak: value }, { merge: true });
    tx.set(rlRef, { streakPub: limited }, { merge: true });
    return 'ok' as const;
  });
  if (ok === 'limited') throw new HttpsError('resource-exhausted', 'Too many updates.');
  return { ok: ok === 'ok', breakStreak: value };
});

// ---------------------------------------------------------------------------
// startTrial: the only place a trial begins. Idempotent: calling it again returns
// the same start date. See trial.ts for why the date is kept on the server.
// ---------------------------------------------------------------------------
export const startTrial = onCall({ region: 'us-central1' }, async (req: CallableRequest) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = typeof req.auth?.token?.email === 'string' ? req.auth.token.email : '';
  if (!email) throw new HttpsError('failed-precondition', 'An email address is needed to start a trial.');
  const now = Date.now();
  const trialRef = db.doc(`trials/${uid}`);
  const claimRef = db.doc(`trialClaims/${trialClaimId(email)}`);
  const legacyRef = db.doc(`users/${uid}/meta/subscription`);

  const startedAt = await db.runTransaction(async tx => {
    const [trial, claim, legacy] = await Promise.all([tx.get(trialRef), tx.get(claimRef), tx.get(legacyRef)]);
    if (trial.exists) return Number(trial.data()?.startedAt);
    const start = resolveTrialStart({ now, claim: claim.data()?.startedAt, legacy: legacy.data()?.trialStartedAt });
    tx.set(trialRef, { startedAt: start });
    if (!claim.exists) tx.set(claimRef, { startedAt: start });
    return start;
  });
  return { startedAt };
});
