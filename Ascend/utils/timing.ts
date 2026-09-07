// Small timing helpers shared by anything that needs a promise to take AT
// LEAST some minimum time — the auth transition being the reason this exists.
//
// Why a floor and not just "show a spinner while this runs": on a fast
// connection, signInWithEmailAndPassword can resolve in well under 100ms.
// Showing a loading screen for 80ms and then snapping it away reads as a
// flicker, not as feedback — the eye barely registers what happened. A fixed
// minimum makes the transition feel like a deliberate beat every time,
// whether the network took 50ms or 5 seconds, rather than an artifact of
// how fast the user's connection happened to be on this attempt.

/**
 * How long every signed-out/signed-in transition holds, in both directions:
 * signing in, signing up, and signing out. Shared by AuthScreen and
 * DashboardScreen so the two ends of the same transition can't drift apart —
 * a 500ms floor going one way and a 400ms floor coming back would make the
 * app feel like it has two different loading systems instead of one.
 */
export const AUTH_TRANSITION_MS = 500;

/**
 * Ceiling on a whole sign-in/sign-up/sign-out exchange, via withTimeout
 * below. Long enough for a genuinely slow mobile connection to succeed,
 * short enough that a stalled request doesn't leave the loading spinner up
 * forever with no way out.
 */
export const AUTH_TIMEOUT_MS = 15000;

/**
 * Runs `promise`, but never resolves sooner than `ms` after being called.
 * A slow promise is unaffected — this only ever ADDS wait time, never removes
 * it, so it can't mask a genuinely slow network by making things feel worse.
 */
export async function withMinDuration<T>(promise: Promise<T>, ms: number): Promise<T> {
  const start = Date.now();
  const result = await promise;
  const elapsed = Date.now() - start;
  if (elapsed < ms) {
    await new Promise(resolve => setTimeout(resolve, ms - elapsed));
  }
  return result;
}

/**
 * Rejects if `promise` hasn't settled within `ms`. Used to put a ceiling on
 * the auth transition: without this, a request that never resolves or
 * rejects (a stalled connection, a hung backend) left the loading spinner
 * on screen forever with no way out and no explanation — "the loading
 * screen never actually loaded" is exactly what that looks like from the
 * user's side. This turns an indefinite hang into a normal, recoverable
 * error after a reasonable ceiling.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number = AUTH_TIMEOUT_MS, message = 'This is taking longer than expected. Check your connection and try again.'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
