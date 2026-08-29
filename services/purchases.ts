// RevenueCat wrapper. Same lazy-require pattern as services/haptics.ts:
// the app has to keep booting cleanly BEFORE the RevenueCat package and
// keys exist — otherwise a developer who hasn't yet done `npx expo install
// react-native-purchases` can't launch anything. Every method here catches
// the "module not found" case and returns a safe default.
//
// SETUP (all outside this file):
//   1. `npx expo install react-native-purchases`
//   2. Set REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY in your env (or
//      hardcode them below during development — but don't commit real keys
//      to a public repo).
//   3. Configure two products in App Store Connect + Google Play:
//        upshift_monthly ($9.99/month)
//        upshift_annual  ($99.99/year)
//      and one entitlement in the RevenueCat dashboard called "premium"
//      that grants both.
//   4. Native rebuild — this is a native module.
//
// Until step 1 is done, `configure()` is a no-op and `getActiveEntitlement`
// returns null, which means SubscriptionContext will keep the user on the
// app-side trial. That's the right behavior in development.

import { Platform } from 'react-native';

// ---- Product identifiers ----
// These strings have to match your App Store / Play Console products
// EXACTLY. Change them here and they're changed everywhere.
export const PRODUCT_IDS = {
  monthly: 'upshift_monthly',
  annual: 'upshift_annual',
} as const;

// One entitlement in the RevenueCat dashboard, granted by both products.
export const ENTITLEMENT_ID = 'premium';

// ---- API keys ----
// Fill these in from https://app.revenuecat.com/ once your account is set
// up. Empty strings are safe — the SDK will fail-open and getActiveEntitlement
// will return null, so the user stays on the app-side trial.
const REVENUECAT_IOS_KEY = '';
const REVENUECAT_ANDROID_KEY = '';

type EntitlementChangeListener = () => void;
const listeners = new Set<EntitlementChangeListener>();
let configured = false;

// Lazy-load react-native-purchases. Wrapped so a missing module doesn't
// crash the JS bundle at import time.
function tryLoadPurchases(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

async function ensureConfigured(uid?: string): Promise<any | null> {
  const RNP = tryLoadPurchases();
  if (!RNP) return null;

  if (!configured) {
    const key = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
    if (!key) return RNP; // let calls succeed / return null gracefully
    try {
      RNP.configure({ apiKey: key, appUserID: uid });
      configured = true;
      // Wire the SDK's own listener into ours so SubscriptionContext
      // refreshes when a purchase completes.
      RNP.addCustomerInfoUpdateListener(() => {
        listeners.forEach(fn => fn());
      });
    } catch {
      // Configure can throw if keys are malformed. Leaving configured=false
      // means the next call will try again — harmless.
    }
  }
  return RNP;
}

// ---- Public API ----

async function getActiveEntitlement(uid?: string): Promise<'monthly' | 'annual' | null> {
  const RNP = await ensureConfigured(uid);
  if (!RNP) return null;
  try {
    const info = await RNP.getCustomerInfo();
    const active = info?.entitlements?.active?.[ENTITLEMENT_ID];
    if (!active) return null;
    // productIdentifier will be either 'upshift_monthly' or 'upshift_annual'
    if (active.productIdentifier === PRODUCT_IDS.annual) return 'annual';
    if (active.productIdentifier === PRODUCT_IDS.monthly) return 'monthly';
    // Unknown product but entitlement is active — default to monthly so
    // the UI still treats it as paid.
    return 'monthly';
  } catch {
    return null;
  }
}

// Returns the store products (with localized price strings) for the
// paywall to render. Falls back to hardcoded strings if the SDK is
// missing, so the paywall still LOOKS right during development.
async function getOfferings(): Promise<{
  monthly: { productId: string; priceString: string };
  annual: { productId: string; priceString: string };
}> {
  const RNP = await ensureConfigured();
  const fallback = {
    monthly: { productId: PRODUCT_IDS.monthly, priceString: '$9.99' },
    annual:  { productId: PRODUCT_IDS.annual,  priceString: '$99.99' },
  };
  if (!RNP) return fallback;
  try {
    const offerings = await RNP.getOfferings();
    const current = offerings?.current;
    if (!current) return fallback;
    const monthly = current.monthly?.product;
    const annual  = current.annual?.product;
    return {
      monthly: monthly
        ? { productId: monthly.identifier, priceString: monthly.priceString }
        : fallback.monthly,
      annual: annual
        ? { productId: annual.identifier, priceString: annual.priceString }
        : fallback.annual,
    };
  } catch {
    return fallback;
  }
}

async function purchaseMonthly(): Promise<'success' | 'cancelled' | 'error'> {
  const RNP = await ensureConfigured();
  if (!RNP) return 'error';
  try {
    const offerings = await RNP.getOfferings();
    const pkg = offerings?.current?.monthly;
    if (!pkg) return 'error';
    await RNP.purchasePackage(pkg);
    return 'success';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    return 'error';
  }
}

async function purchaseAnnual(): Promise<'success' | 'cancelled' | 'error'> {
  const RNP = await ensureConfigured();
  if (!RNP) return 'error';
  try {
    const offerings = await RNP.getOfferings();
    const pkg = offerings?.current?.annual;
    if (!pkg) return 'error';
    await RNP.purchasePackage(pkg);
    return 'success';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    return 'error';
  }
}

async function restore(): Promise<void> {
  const RNP = await ensureConfigured();
  if (!RNP) return;
  try {
    await RNP.restorePurchases();
  } catch {
    // silent — SubscriptionContext refreshes and surfaces the outcome
  }
}

async function openManageSubscription(): Promise<void> {
  const RNP = await ensureConfigured();
  if (!RNP) return;
  try {
    // On iOS this opens the App Store subscription management sheet; on
    // Android it goes to the Play Store subscription page.
    if (typeof RNP.showManageSubscriptions === 'function') {
      await RNP.showManageSubscriptions();
    }
  } catch {
    // silent
  }
}

function onEntitlementChanged(fn: EntitlementChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export default {
  getActiveEntitlement,
  getOfferings,
  purchaseMonthly,
  purchaseAnnual,
  restore,
  openManageSubscription,
  onEntitlementChanged,
};
