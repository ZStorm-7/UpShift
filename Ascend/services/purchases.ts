// RevenueCat wrapper. Same lazy-require pattern as services/haptics.ts:
// the app has to keep booting cleanly BEFORE the RevenueCat package and
// keys exist — otherwise a developer who hasn't yet done `npx expo install
// react-native-purchases` can't launch anything. Every method here catches
// the "module not found" case and returns a safe default.
//
// RevenueCat project: projff634a3f (app.revenuecat.com/projects/projff634a3f)
// — the dashboard/REST-API identifier, not something the client SDK needs;
// configure() below only ever takes the API key.
//
// SETUP (all outside this file):
//   1. `npx expo install react-native-purchases react-native-purchases-ui`
//      (already in package.json — see the two react-native-purchases*
//      entries).
//   2. Set REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY below. Both point at
//      the same project's public SDK key during development; RevenueCat
//      issues separate iOS/Android keys once you add each store to the
//      project, at which point split these two constants.
//   3. Configure two products in App Store Connect + Google Play:
//        monthly ($9.99/month)
//        yearly  ($99.99/year)
//      and one entitlement in the RevenueCat dashboard called
//      "upshift_unlimited" that grants both, attached to an Offering with
//      the standard $rc_monthly / $rc_annual package types (that's what
//      `offerings.current.monthly` / `.annual` read below).
//   4. Native rebuild — this is a native module, so it isn't available in
//      Expo Go; a development build is required to test purchases for real.
//
// Until a key is set, `configure()` is a no-op and `getActiveEntitlement`
// returns null, which means SubscriptionContext will keep the user on the
// app-side trial. That's the right behavior in development.

import { Platform } from 'react-native';

// ---- Product identifiers ----
// These strings have to match your App Store / Play Console products
// EXACTLY. Change them here and they're changed everywhere.
export const PRODUCT_IDS = {
  monthly: 'monthly',
  annual: 'yearly',
} as const;

// One entitlement in the RevenueCat dashboard, granted by both products.
export const ENTITLEMENT_ID = 'upshift_unlimited';

// ---- API keys ----
// From https://app.revenuecat.com/ → Project settings → API keys. This is a
// PUBLIC client key (safe to ship in the app bundle — it's how every
// RevenueCat-integrated app works), not a secret; RevenueCat's server-side
// secret key is never used from the client and has no business in this file.
const REVENUECAT_IOS_KEY = 'test_pwIQToYOdacPQfBGNdSxWlLabyJ';
const REVENUECAT_ANDROID_KEY = 'test_pwIQToYOdacPQfBGNdSxWlLabyJ';

type EntitlementChangeListener = () => void;
const listeners = new Set<EntitlementChangeListener>();
let configured = false;

// react-native-purchases is a THIRD-PARTY native module, so it exists only in
// a development build or a store build — never in Expo Go, whose native shell
// ships a fixed set of Expo's own modules and nothing else. The npm package
// still resolves there (Metro only needs the JS), so requiring it succeeds and
// hands back an object whose methods all reach for a native bridge that isn't
// there. Calling into that is what takes the app down rather than throwing
// something catchable.
//
// So: check for the native half before trusting the JS half.
function nativePurchasesAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    return !!NativeModules?.RNPurchases;
  } catch {
    return false;
  }
}

// Lazy-load react-native-purchases. Wrapped so a missing module doesn't
// crash the JS bundle at import time.
function tryLoadPurchases(): any | null {
  if (!nativePurchasesAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

// Same lazy-load story for the Paywall/Customer Center screens, which ship
// as a separate package (react-native-purchases-ui) on top of the base SDK.
// Not gated behind a native-module pre-check like tryLoadPurchases is —
// there's no equivalent "hard native crash if unconfigured" risk here,
// since every call site below only reaches this after ensureConfigured()
// has already confirmed the base SDK is present and configured.
function tryLoadPurchasesUI(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases-ui');
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
    // Without a key we must NOT hand back the native module: RevenueCat's
    // native SDK hard-crashes (not a catchable JS rejection) if you call
    // getCustomerInfo/getOfferings/etc. on it before configure() has run.
    // Returning null here makes every caller take its "SDK missing" fallback
    // instead, which is what "let calls succeed gracefully" actually needs.
    if (!key) return null;
    try {
      // Verbose in dev only — this is RevenueCat's own SDK log, useful while
      // wiring up products/offerings for the first time, noisy in a release
      // build. __DEV__ is the same global the rest of the RN toolchain uses
      // to strip dev-only code from a production bundle.
      if (__DEV__) RNP.setLogLevel(RNP.LOG_LEVEL.VERBOSE);
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
    // productIdentifier will be either 'monthly' or 'yearly' (PRODUCT_IDS).
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

export type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

// Presents RevenueCat's own remotely-configured Paywall screen (built and
// styled in the RevenueCat dashboard, no app release needed to change it) —
// unconditionally, regardless of current entitlement status. Prefer
// `presentPaywallIfNeeded` for "show the paywall only if the user isn't
// already entitled" call sites; this one is for a deliberate "view plans"
// entry point that should always open it.
async function presentPaywall(): Promise<PaywallResult> {
  const RNP = await ensureConfigured();
  const RCUI = tryLoadPurchasesUI();
  if (!RNP || !RCUI) return 'not_presented';
  try {
    // Unlike presentPaywallIfNeeded, this one has no entitlement gate to
    // pass — it shows the current offering's paywall unconditionally,
    // which is exactly right for a deliberate "view plans" link.
    const result = await RCUI.presentPaywall();
    return String(result).toLowerCase() as PaywallResult;
  } catch {
    return 'error';
  }
}

// Same screen, but a no-op if the current customer already holds
// ENTITLEMENT_ID — the guarded version, for spots in the app that gate a
// feature behind the subscription (e.g. "unlock this" buttons elsewhere)
// where re-showing the paywall to an already-paying user would be wrong.
async function presentPaywallIfNeeded(): Promise<PaywallResult> {
  const RNP = await ensureConfigured();
  const RCUI = tryLoadPurchasesUI();
  if (!RNP || !RCUI) return 'not_presented';
  try {
    const result = await RCUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT_ID });
    return String(result).toLowerCase() as PaywallResult;
  } catch {
    return 'error';
  }
}

// RevenueCat's self-service "Customer Center" — lets a subscriber see their
// plan, switch/cancel, and get help, all from a dashboard-configured screen
// with no extra UI for this app to build or maintain. This is the "when it
// makes sense" spot the feature is meant for: Settings, for someone who
// ALREADY has a subscription, as a richer alternative to the plain
// openManageSubscription() store-sheet deep link above.
async function presentCustomerCenter(): Promise<boolean> {
  const RNP = await ensureConfigured();
  const RCUI = tryLoadPurchasesUI();
  if (!RNP || !RCUI) return false;
  try {
    await RCUI.presentCustomerCenter();
    return true;
  } catch {
    return false;
  }
}

export default {
  getActiveEntitlement,
  getOfferings,
  purchaseMonthly,
  purchaseAnnual,
  restore,
  openManageSubscription,
  onEntitlementChanged,
  presentPaywall,
  presentPaywallIfNeeded,
  presentCustomerCenter,
};
