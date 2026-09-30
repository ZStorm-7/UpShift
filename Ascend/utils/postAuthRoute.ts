// Where a signed-in user lands right after THIS device just authenticated
// them — sign-up, log-in, or a Google/Apple/phone credential exchange.
//
// This exists because App.tsx's RootNavigator only computes this decision
// ONCE, on cold boot: the navigator never remounts on sign-in (see that
// file's own comment on why BootSkeleton/isLoading can't be reused here), so
// every place that just authenticated someone has to make this same call
// itself. Three call sites (AuthScreen's log-in branch, AuthMethodScreen's
// Google/Apple/phone credential sign-in, and its phone-OTP confirm) used to
// each hand-roll a SHORTER version that only checked `hasProfile` — which
// is how a returning user whose trial had expired, or who'd cancelled a paid
// subscription, could log back in and land straight on Dashboard with full
// access, never re-hitting the paywall. One shared function means all three
// either agree or all three are wrong at once — not silently drift apart the
// way they had.
//
// Mirrors RootNavigator's initialRouteName in App.tsx field for field; if
// that logic ever changes, this needs to change with it.

import { getDoc } from 'firebase/firestore';
import { legalAcceptanceDocRef } from '../screens/LegalGateScreen';
import type { SubscriptionStatus } from '../context/SubscriptionContext';

export type PostAuthRoute = 'Subscription' | 'VerifyEmail' | 'LegalGate' | 'Dashboard' | 'Onboarding';

export async function resolvePostAuthRoute(params: {
  uid: string;
  /** Read straight off the credential/currentUser right after sign-in —
   * NOT off UserContext's `emailVerified`, which is populated by the
   * `onAuthStateChanged` listener and can still be lagging one render
   * behind at this exact moment. */
  emailVerified: boolean;
  loadProfile: (uid: string) => Promise<boolean>;
  /** Must be the CONTEXT's refreshEntitlement (returns the freshly-computed
   * status, not a value read off React state) — see that function's own
   * comment for why reading `status` here instead would race a re-render. */
  refreshEntitlement: (uidOverride?: string) => Promise<SubscriptionStatus>;
}): Promise<PostAuthRoute> {
  const { uid, emailVerified, loadProfile, refreshEntitlement } = params;

  // Passing `uid` explicitly, not relying on refreshEntitlement's own
  // fallback to SubscriptionContext's `authUser` — that context state is
  // populated by a SEPARATE Firebase listener (onAuthStateChanged) that has
  // not necessarily fired yet at this exact point, immediately after THIS
  // sign-in resolved. Omitting it here reintroduces the exact bug this
  // whole helper exists to fix: refreshEntitlement silently reading a
  // stale/null authUser and returning 'none', bouncing a genuinely
  // entitled user to the paywall right after they logged in.
  const [hasProfile, status] = await Promise.all([loadProfile(uid), refreshEntitlement(uid)]);

  const isEntitled = status === 'trial' || status === 'active_monthly' || status === 'active_annual';
  if (!isEntitled) return 'Subscription';

  // Same rule as RootNavigator's needsEmailVerification: only a REAL
  // subscription forces this, never the free trial.
  const needsEmailVerification = !emailVerified && (status === 'active_monthly' || status === 'active_annual');
  if (needsEmailVerification) return 'VerifyEmail';

  // Fail OPEN on a read error, same as RootNavigator — an entitled user
  // shouldn't be stuck unable to tell whether they've already accepted.
  const hasLegalAcceptance = await getDoc(legalAcceptanceDocRef(uid))
    .then(snap => snap.exists() && !!snap.data()?.accepted)
    .catch(() => true);
  if (!hasLegalAcceptance) return 'LegalGate';

  return hasProfile ? 'Dashboard' : 'Onboarding';
}
