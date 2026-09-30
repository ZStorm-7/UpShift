// Subscription gate. This is the file that says whether a signed-in user
// has app access at all.
//
// The plan the user picked from us at signup:
//   1. Days 0–7: an APP-SIDE trial. No card, no store involvement. A
//      trialStartedAt timestamp is written to Firestore when the user taps
//      "Start 7-day free trial" on the paywall. `isEntitled` returns true
//      for the 7 days after that timestamp.
//   2. Day 7 onwards: RevenueCat takes over. When the trial expires,
//      isEntitled flips to false unless RevenueCat reports an active
//      subscription (monthly $10 or annual $100).
//
// This split exists because Apple/Google's own "free trial" mechanisms
// REQUIRE a payment method to start — the user asked for a no-card trial,
// so the trial has to be tracked by us instead of by the store. Once the
// trial ends and the paywall reappears, ANY charge from that point is a
// real store subscription and RevenueCat handles it end-to-end.
//
// This module is deliberately narrow: it exposes { status, isEntitled,
// startTrial, refreshEntitlement, restorePurchases, cancelSubscription }
// and knows nothing about UI. The paywall screen consumes it; RootNavigator
// gates on it.

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUser } from './UserContext';
import purchases, { PaywallResult } from '../services/purchases';
import { scheduleTrialExpiryReminders, cancelTrialExpiryReminders } from '../services/notifications';

const TRIAL_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export type SubscriptionStatus =
  | 'loading'          // haven't checked Firestore/RevenueCat yet
  | 'none'             // signed in, no trial started, no subscription
  | 'trial'            // in-trial (trialStartedAt within last 7 days)
  | 'trial_expired'    // trial ran out, no paid subscription
  | 'active_monthly'   // paying $10/mo through RevenueCat
  | 'active_annual';   // paying $100/yr through RevenueCat

type SubscriptionDoc = {
  trialStartedAt?: number; // ms since epoch
};

type SubscriptionContextValue = {
  status: SubscriptionStatus;
  isEntitled: boolean;                    // true == user can use the app
  trialDaysRemaining: number | null;      // integer >=0 during trial, else null
  // True the instant a trial has ever been started for this account — stays
  // true forever after, through 'trial', 'trial_expired', and even a paid
  // status, since trialStartedAt is never cleared. This is what SubscriptionScreen
  // reads to decide whether the free-trial option should be offered at all.
  hasUsedTrial: boolean;
  startTrial: () => Promise<void>;
  refreshEntitlement: (uidOverride?: string) => Promise<SubscriptionStatus>;
  restorePurchases: () => Promise<void>;
  // Used by Settings → "Cancel subscription". Sets the local record to
  // "none" and lets RevenueCat manage the actual store cancellation
  // (Apple/Google don't allow apps to cancel subscriptions programmatically
  // — this navigates to the manage-subscription URL).
  goToManageSubscription: () => Promise<void>;
  // Opens RevenueCat's dashboard-configured Paywall screen. Returns what
  // happened so the caller can react (e.g. refresh + navigate on purchase).
  presentPaywall: () => Promise<PaywallResult>;
  // Opens RevenueCat's self-service "Customer Center" (plan details,
  // switch/cancel, support) — the richer alternative to
  // goToManageSubscription's plain store-sheet deep link. Returns whether it
  // actually opened (false if the SDK/module isn't available, e.g. Expo Go).
  presentCustomerCenter: () => Promise<boolean>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status: 'loading',
  isEntitled: false,
  trialDaysRemaining: null,
  hasUsedTrial: false,
  startTrial: async () => {},
  refreshEntitlement: async () => 'none',
  restorePurchases: async () => {},
  goToManageSubscription: async () => {},
  presentPaywall: async () => 'not_presented',
  presentCustomerCenter: async () => false,
});

function subDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'subscription');
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [trialStartedAt, setTrialStartedAt] = useState<number | null>(null);

  // Returns the freshly-computed status, not just setting it — a caller that
  // needs to make a routing decision RIGHT AFTER a sign-in (see AuthScreen's
  // and AuthMethodScreen's log-in paths) can't rely on reading `status` off
  // this hook immediately afterward: that's React state, and the setStatus
  // call below won't be visible to the caller's own closure until the next
  // render.
  //
  // `uidOverride` exists for that exact caller too, and isn't optional to
  // skip for convenience: `signInWithEmailAndPassword`/`signInWithCredential`
  // resolving does NOT mean this context's `authUser` has updated yet — that
  // only happens once Firebase's separate `onAuthStateChanged` listener
  // (UserContext) fires and re-renders this provider, which can land after
  // the caller's very next line. Without the override, `refreshEntitlement`
  // called right after a fresh sign-in reads the closure's stale `authUser`
  // (still null from before), takes the `!authUser` branch below, and
  // returns 'none' — which is exactly how a legitimately entitled user could
  // get bounced to the paywall immediately after logging in. Passing the uid
  // the caller just obtained directly from the sign-in result sidesteps the
  // race entirely.
  const refreshEntitlement = useCallback(async (uidOverride?: string): Promise<SubscriptionStatus> => {
    const uid = uidOverride ?? authUser?.uid;
    if (!uid) {
      setStatus('none');
      setTrialStartedAt(null);
      return 'none';
    }

    // Firestore: has the user started the app-side trial?
    let trialAt: number | null = null;
    try {
      const snap = await getDoc(subDocRef(uid));
      const data = snap.exists() ? (snap.data() as SubscriptionDoc) : {};
      trialAt = data.trialStartedAt ?? null;
    } catch {
      // If the read fails we'd rather assume trial-active than lock the user
      // out of an app they may have paid for. status will reconcile on the
      // next refresh.
    }
    setTrialStartedAt(trialAt);

    // RevenueCat: is there an active paid subscription? Wrapped in a
    // try/catch because the SDK may not be installed yet (see
    // services/purchases.ts) — a missing SDK is not an entitlement.
    let paid: 'monthly' | 'annual' | null = null;
    try {
      // Passing the Firebase uid makes it RevenueCat's appUserID too, so the
      // same person reads as the same customer whether they check
      // entitlement from this device, a reinstall, or (later) the web — as
      // opposed to each install getting its own anonymous RevenueCat ID.
      paid = await purchases.getActiveEntitlement(uid);
    } catch {
      paid = null;
    }

    if (paid === 'monthly') {
      setStatus('active_monthly');
      // A real subscription makes any still-pending "trial ending soon"
      // notification wrong — cancel it rather than let it fire and tell a
      // paying subscriber their trial is about to run out.
      cancelTrialExpiryReminders().catch(() => {});
      return 'active_monthly';
    }
    if (paid === 'annual')  {
      setStatus('active_annual');
      cancelTrialExpiryReminders().catch(() => {});
      return 'active_annual';
    }

    if (trialAt === null) { setStatus('none'); return 'none'; }

    const elapsed = Date.now() - trialAt;
    const next = elapsed < TRIAL_MS ? 'trial' : 'trial_expired';
    setStatus(next);
    return next;
  }, [authUser?.uid]);

  // Refresh entitlement whenever the signed-in user changes, and once at
  // mount. Not on an interval — trial expiry is checked on read via the
  // Date.now() comparison above, so nothing changes until the user does
  // something that triggers a refresh.
  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  // Also re-check whenever the RevenueCat SDK reports a purchase completed.
  useEffect(() => {
    const unsub = purchases.onEntitlementChanged(() => {
      refreshEntitlement();
    });
    return unsub;
  }, [refreshEntitlement]);

  const startTrial = useCallback(async () => {
    if (!authUser) throw new Error('Sign in first.');
    // One trial per account, ever. trialStartedAt is written once here and
    // never cleared afterward — including once the trial has expired — so
    // its mere presence (not whether it's still within the 7-day window) is
    // what blocks a second trial. Without this check, anyone who let the
    // trial lapse could return to this same paywall and tap "Start trial"
    // again for another free 7 days, indefinitely.
    if (trialStartedAt !== null) {
      throw new Error('You\'ve already used your free trial.');
    }
    const now = Date.now();
    await setDoc(subDocRef(authUser.uid), { trialStartedAt: now }, { merge: true });
    setTrialStartedAt(now);
    setStatus('trial');
    // Local notifications only — see services/notifications.ts. Scheduled
    // once, right here, because this is the only moment trialStartedAt is
    // ever set for an account.
    scheduleTrialExpiryReminders(now).catch(() => {});
  }, [authUser?.uid, trialStartedAt]);

  const restorePurchases = useCallback(async () => {
    try {
      await purchases.restore();
    } catch {
      // Show nothing on failure — the paywall itself surfaces the outcome
      // by refreshing entitlement.
    }
    await refreshEntitlement();
  }, [refreshEntitlement]);

  const goToManageSubscription = useCallback(async () => {
    // RevenueCat exposes a URL that opens the store's own manage-
    // subscription sheet. On stores where that isn't available, we fall
    // back to opening the app's App Store / Play page. See purchases.ts.
    await purchases.openManageSubscription();
  }, []);

  const presentPaywall = useCallback(async () => {
    const result = await purchases.presentPaywall();
    // A purchase or restore made from the native paywall doesn't go through
    // startTrial/purchaseMonthly/purchaseAnnual above, so it wouldn't
    // otherwise trigger a refresh — the SDK's own listener (wired in
    // purchases.ts's ensureConfigured) usually beats this to it, but calling
    // it here too costs nothing and closes any race.
    if (result === 'purchased' || result === 'restored') {
      await refreshEntitlement();
    }
    return result;
  }, [refreshEntitlement]);

  const presentCustomerCenter = useCallback(async () => {
    const opened = await purchases.presentCustomerCenter();
    // A Customer Center visit can end in a cancellation or plan change made
    // entirely inside RevenueCat's UI, with no purchase/restore call on this
    // side to react to — refresh unconditionally once it closes.
    if (opened) await refreshEntitlement();
    return opened;
  }, [refreshEntitlement]);

  const isEntitled =
    status === 'trial' ||
    status === 'active_monthly' ||
    status === 'active_annual';

  const trialDaysRemaining = (() => {
    if (status !== 'trial' || trialStartedAt === null) return null;
    const msLeft = TRIAL_MS - (Date.now() - trialStartedAt);
    return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  })();

  const hasUsedTrial = trialStartedAt !== null;

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        isEntitled,
        trialDaysRemaining,
        hasUsedTrial,
        startTrial,
        refreshEntitlement,
        restorePurchases,
        goToManageSubscription,
        presentPaywall,
        presentCustomerCenter,
      }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
