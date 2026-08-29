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
import purchases from '../services/purchases';

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
  startTrial: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  // Used by Settings → "Cancel subscription". Sets the local record to
  // "none" and lets RevenueCat manage the actual store cancellation
  // (Apple/Google don't allow apps to cancel subscriptions programmatically
  // — this navigates to the manage-subscription URL).
  goToManageSubscription: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status: 'loading',
  isEntitled: false,
  trialDaysRemaining: null,
  startTrial: async () => {},
  refreshEntitlement: async () => {},
  restorePurchases: async () => {},
  goToManageSubscription: async () => {},
});

function subDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'subscription');
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [trialStartedAt, setTrialStartedAt] = useState<number | null>(null);

  const refreshEntitlement = useCallback(async () => {
    if (!authUser) {
      setStatus('none');
      setTrialStartedAt(null);
      return;
    }

    // Firestore: has the user started the app-side trial?
    let trialAt: number | null = null;
    try {
      const snap = await getDoc(subDocRef(authUser.uid));
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
      paid = await purchases.getActiveEntitlement();
    } catch {
      paid = null;
    }

    if (paid === 'monthly') { setStatus('active_monthly'); return; }
    if (paid === 'annual')  { setStatus('active_annual');  return; }

    if (trialAt === null) { setStatus('none'); return; }

    const elapsed = Date.now() - trialAt;
    setStatus(elapsed < TRIAL_MS ? 'trial' : 'trial_expired');
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
    const now = Date.now();
    await setDoc(subDocRef(authUser.uid), { trialStartedAt: now }, { merge: true });
    setTrialStartedAt(now);
    setStatus('trial');
  }, [authUser?.uid]);

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

  const isEntitled =
    status === 'trial' ||
    status === 'active_monthly' ||
    status === 'active_annual';

  const trialDaysRemaining = (() => {
    if (status !== 'trial' || trialStartedAt === null) return null;
    const msLeft = TRIAL_MS - (Date.now() - trialStartedAt);
    return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  })();

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        isEntitled,
        trialDaysRemaining,
        startTrial,
        refreshEntitlement,
        restorePurchases,
        goToManageSubscription,
      }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
