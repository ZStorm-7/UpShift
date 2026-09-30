// SubscriptionScreen — the hard-gate paywall shown after signup, and
// again if the trial expires.
//
// Two purchasable plans (monthly $9.99, annual $99.99 → shown as ~$8.33/mo
// with a "17% off" badge) plus a "Start 7-day free trial" that requires no
// card. Trial is app-side (Firestore-tracked); real purchases go through
// RevenueCat and Apple/Google billing.
//
// Design goal: MacroFactor / Robinhood clean — a lot of white space, one
// tap decision at the bottom, no dark patterns. The trial button is at
// bottom because Apple's guidelines and general fairness both want the
// user's cheapest path visible; putting it under the paid options rather
// than hidden behind them is the honest layout.

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useSubscription } from '../context/SubscriptionContext';
import { useUser } from '../context/UserContext';
import purchases from '../services/purchases';
import haptics from '../services/haptics';

type Plan = 'monthly' | 'annual';

export default function SubscriptionScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { startTrial, status, hasUsedTrial, presentPaywall } = useSubscription();
  const { emailVerified } = useUser();
  const [selected, setSelected] = useState<Plan>('annual'); // annual pre-selected — better value
  const [prices, setPrices] = useState<{ monthly: string; annual: string }>({
    monthly: '$9.99', annual: '$99.99',
  });
  const [purchasing, setPurchasing] = useState(false);
  const inFlight = useRef(false);

  // The subscribe button gets a soft ambient glow (Jitter's "Glow Button"
  // reference, adapted rather than copied) — this is the one thing on the
  // whole paywall the user is most likely to skip past without it, so it's
  // the only control on this screen that gets the treatment.
  const glowPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });

  // Load real store prices (falls back to the hardcoded strings above).
  useEffect(() => {
    purchases.getOfferings().then(o => {
      setPrices({ monthly: o.monthly.priceString, annual: o.annual.priceString });
    });
  }, []);

  // If the trial is already active (user came here via Settings), or a
  // subscription is active, this screen shouldn't be reachable at all.
  // Trial never gates on email verification — only a REAL subscription
  // does (see App.tsx's needsEmailVerification comment for why).
  useEffect(() => {
    if (status === 'trial') {
      navigation.replace('LegalGate');
      return;
    }
    if (status === 'active_monthly' || status === 'active_annual') {
      navigation.replace(emailVerified ? 'LegalGate' : 'VerifyEmail');
    }
  }, [status, emailVerified]);

  async function handlePurchase() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPurchasing(true);
    haptics.setComplete();
    try {
      const result = selected === 'monthly'
        ? await purchases.purchaseMonthly()
        : await purchases.purchaseAnnual();
      if (result === 'success') {
        haptics.goalMet();
        // SubscriptionContext will refresh via the entitlement listener,
        // but that's async — checked directly here rather than waiting on
        // it, since a just-completed purchase IS a real subscription
        // regardless of whether context has caught up yet.
        navigation.replace(emailVerified ? 'LegalGate' : 'VerifyEmail');
      } else if (result === 'unavailable') {
        // Not a failure — this build genuinely has no native purchases
        // module (Expo Go, the web preview, any JS-only environment). The
        // old code showed the exact same "Purchase failed" alert here as for
        // a real store error, which reads as the subscription flow being
        // broken when it's actually just not testable outside a real
        // device/store build. See services/purchases.ts's nativePurchasesAvailable.
        Alert.alert(
          'Not available in this build',
          'In-app purchases only work in a real App Store/Play Store build, not in this preview. Start the free trial to keep testing, or try this on a TestFlight/Play build.',
        );
      } else if (result === 'error') {
        Alert.alert(
          'Purchase failed',
          'Something went wrong. Please try again, or start the free trial to keep going.',
        );
      }
      // 'cancelled' — silent, user pressed cancel in the store sheet
    } finally {
      inFlight.current = false;
      setPurchasing(false);
    }
  }

  // RevenueCat's own dashboard-configured Paywall — an alternate checkout
  // surface to the hand-built cards above. Kept as a fallback link rather
  // than the primary flow (this screen's custom layout is what the rest of
  // the app looks like), but genuinely useful if a store-side promotional
  // offer or intro price is running that only the RevenueCat-hosted paywall
  // knows how to present.
  async function handleAlternatePaywall() {
    if (inFlight.current) return;
    const result = await presentPaywall();
    if (result === 'purchased' || result === 'restored') {
      haptics.goalMet();
      navigation.replace(emailVerified ? 'LegalGate' : 'VerifyEmail');
    } else if (result === 'not_presented') {
      Alert.alert('Not available', 'This checkout option isn\'t set up yet — please use the plans above.');
    }
    // 'cancelled' / 'error' — silent, same as the primary purchase flow.
  }

  async function handleTrial() {
    if (inFlight.current) return;
    // Defense in depth: the trial CTA below is already hidden once
    // hasUsedTrial is true, and startTrial() itself refuses a second trial —
    // this just short-circuits before either bothers, for whatever path got
    // here anyway (e.g. a stale render).
    if (hasUsedTrial) return;
    inFlight.current = true;
    haptics.setComplete();
    try {
      await startTrial();
      haptics.goalMet();
      navigation.replace('LegalGate');
    } catch (err: any) {
      const alreadyUsed = err?.message?.includes('already used');
      Alert.alert(
        alreadyUsed ? 'Trial already used' : 'Could not start trial',
        alreadyUsed
          ? 'You\'ve already used your free trial on this account — please choose a plan to continue.'
          : 'Please check your connection and try again.',
      );
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header — reached two ways (see this screen's top comment):
            fresh off signup, or back here because the trial ran out. Those
            are different moments and deserve different copy. The
            trial-expired version is deliberately forward-looking ("pick up
            where you left off") rather than mentioning data, deletion, or
            loss of any kind — there's nothing to threaten them with, since
            nothing here is ever deleted; being locked out of the app until
            they subscribe (SubscriptionContext's isEntitled gate) is the
            whole mechanism, and the copy's only job is to make picking a
            plan feel like the obvious next step. */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {status === 'trial_expired' ? 'Keep the momentum going' : 'Unlock UpShift'}
          </Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {status === 'trial_expired'
              ? 'Your free trial just wrapped up. Subscribe to pick up right where you left off — your streak, your history, all of it.'
              : 'Track everything. Earn every rank. No ads, ever.'}
          </Text>
        </View>

        {/* Benefits list */}
        <View style={[styles.benefits, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {[
            'Full nutrition tracking with USDA foods',
            'Personalized workout plans that progress with you',
            'Personalizes to your goals, body, and progress over time',
            'Quest system, streaks, and leaderboard',
            'History graphs across every metric',
            'Friends and challenges',
          ].map(line => (
            <View key={line} style={styles.benefitRow}>
              <View style={[styles.check, { backgroundColor: palette.accent }]}>
                <Ionicons name="checkmark" size={14} color="#001700" />
              </View>
              <Text style={[styles.benefitText, { color: palette.textPrimary }]}>{line}</Text>
            </View>
          ))}
        </View>

        {/* Plan cards */}
        <View style={styles.plans}>
          <PlanCard
            title="Annual"
            price={prices.annual}
            per="/year"
            secondary={`≈ ${monthlyEquivalent(prices.annual)}/mo`}
            badge="SAVE 17%"
            selected={selected === 'annual'}
            onPress={() => setSelected('annual')}
            palette={palette}
          />
          <PlanCard
            title="Monthly"
            price={prices.monthly}
            per="/month"
            secondary="Cancel anytime"
            selected={selected === 'monthly'}
            onPress={() => setSelected('monthly')}
            palette={palette}
          />
        </View>

        {/* Primary CTA — purchase */}
        <View style={styles.ctaWrap}>
          {!purchasing && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ctaGlow,
                {
                  backgroundColor: palette.accent,
                  shadowColor: palette.accent,
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                },
              ]}
            />
          )}
          <Pressable
            style={[styles.cta, { backgroundColor: palette.accent }, purchasing && { opacity: 0.6 }]}
            onPress={handlePurchase}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel={`Subscribe ${selected} for ${selected === 'monthly' ? prices.monthly : prices.annual}`}>
            {purchasing
              ? <ActivityIndicator color={palette.textOnAccent} />
              : <Text style={[styles.ctaText, { color: palette.textOnAccent }]}>
                  Subscribe — {selected === 'monthly' ? prices.monthly : prices.annual}
                </Text>}
          </Pressable>
        </View>

        {/* Divider + trial CTA — hidden entirely once this account has ever
            started a trial before. Without this, someone whose trial lapsed
            could come back to this exact screen and start another free
            7 days, indefinitely — see SubscriptionContext's startTrial for
            the matching one-trial-ever guard on the write side. This is the
            "don't even offer it" half of that fix. */}
        {!hasUsedTrial && (
          <>
            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: palette.divider }]} />
              <Text style={[styles.orText, { color: palette.textMuted }]}>OR</Text>
              <View style={[styles.line, { backgroundColor: palette.divider }]} />
            </View>

            <Pressable
              style={[styles.trialCta, { borderColor: palette.borderStrong }]}
              onPress={handleTrial}
              accessibilityRole="button"
              accessibilityLabel="Start 7-day free trial, no card required">
              <Text style={[styles.trialTitle, { color: palette.textPrimary }]}>
                Start 7-day free trial
              </Text>
              <Text style={[styles.trialSubtitle, { color: palette.textSecondary }]}>
                No card required · Full access for 7 days
              </Text>
            </Pressable>
          </>
        )}

        <Pressable
          onPress={() => purchases.restore()}
          hitSlop={12}
          style={styles.restore}>
          <Text style={[styles.restoreText, { color: palette.textMuted }]}>
            Restore purchases
          </Text>
        </Pressable>

        <Pressable
          onPress={handleAlternatePaywall}
          hitSlop={12}
          style={styles.restore}
          accessibilityRole="button"
          accessibilityLabel="Trouble checking out? Try another way to subscribe">
          <Text style={[styles.restoreText, { color: palette.textMuted }]}>
            Trouble checking out? Try another way
          </Text>
        </Pressable>

        <Text style={[styles.fine, { color: palette.textMuted }]}>
          Subscriptions renew automatically unless cancelled. Cancel any time in your
          {' '}App Store or Play Store settings.
        </Text>

        {/* Apple 3.1.2 / Play Billing both require a functional link to the
            Privacy Policy AND Terms of Use directly on the purchase screen
            itself — not just reachable from Settings several taps away. */}
        <Text style={[styles.legalLinks, { color: palette.textMuted }]}>
          <Text
            onPress={() => navigation.navigate('TermsOfService')}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
            style={[styles.legalLink, { color: palette.textSecondary }]}>
            Terms of Service
          </Text>
          {'  ·  '}
          <Text
            onPress={() => navigation.navigate('PrivacyPolicy')}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            style={[styles.legalLink, { color: palette.textSecondary }]}>
            Privacy Policy
          </Text>
        </Text>
      </ScrollView>
    </Screen>
  );
}

function PlanCard({
  title, price, per, secondary, badge, selected, onPress, palette,
}: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.plan,
        {
          backgroundColor: palette.surface,
          borderColor: selected ? palette.accent : palette.border,
          borderWidth: selected ? 2 : layout.hairline,
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title} plan, ${price} ${per}`}>
      {badge && (
        <View style={[styles.planBadge, { backgroundColor: palette.accent }]}>
          <Text style={[styles.planBadgeText, { color: palette.textOnAccent }]}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.planTitle, { color: palette.textSecondary }]}>{title}</Text>
      <View style={styles.planPriceRow}>
        <Text style={[styles.planPrice, { color: palette.textPrimary }]}>{price}</Text>
        <Text style={[styles.planPer, { color: palette.textMuted }]}>{per}</Text>
      </View>
      <Text style={[styles.planSecondary, { color: palette.textSecondary }]}>{secondary}</Text>
    </Pressable>
  );
}

// Parses "$99.99" → "$8.33". Falls back gracefully on odd formats.
function monthlyEquivalent(annualPrice: string): string {
  const m = annualPrice.match(/([£$€])(\d+(?:\.\d+)?)/);
  if (!m) return annualPrice;
  const [, sym, num] = m;
  return `${sym}${(parseFloat(num) / 12).toFixed(2)}`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: layout.bottomInset,
    gap: spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  benefits: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  check: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, fontFamily: fontFamily.sans, fontSize: 14 },
  plans: {
    gap: spacing.md,
  },
  plan: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    position: 'relative',
  },
  planBadge: {
    position: 'absolute', top: -10, right: spacing.lg,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.pill,
  },
  planBadgeText: {
    fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.6,
  },
  planTitle: {
    fontFamily: fontFamily.sansBold, fontSize: 15, letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  planPrice: { fontFamily: fontFamily.sansBlack, fontSize: 32, lineHeight: 36 },
  planPer:   { fontFamily: fontFamily.sans, fontSize: 15 },
  planSecondary: { fontFamily: fontFamily.sans, fontSize: 13, marginTop: 2 },
  ctaWrap: {
    position: 'relative',
  },
  ctaGlow: {
    position: 'absolute',
    top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: radius.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
    shadowOpacity: 0.9,
    elevation: 0,
  },
  cta: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  divider: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginVertical: spacing.sm,
  },
  line: { flex: 1, height: layout.hairline },
  orText: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8 },
  trialCta: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  trialTitle: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  trialSubtitle: { fontFamily: fontFamily.sans, fontSize: 13 },
  restore: { alignSelf: 'center', paddingVertical: spacing.sm },
  restoreText: { fontFamily: fontFamily.sans, fontSize: 13, textDecorationLine: 'underline' },
  fine: {
    fontFamily: fontFamily.sans, fontSize: 11, lineHeight: 16,
    textAlign: 'center',
  },
  legalLinks: {
    fontFamily: fontFamily.sans, fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
});
