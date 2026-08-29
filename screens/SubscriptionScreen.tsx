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
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useSubscription } from '../context/SubscriptionContext';
import purchases from '../services/purchases';
import haptics from '../services/haptics';

type Plan = 'monthly' | 'annual';

export default function SubscriptionScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { startTrial, status } = useSubscription();
  const [selected, setSelected] = useState<Plan>('annual'); // annual pre-selected — better value
  const [prices, setPrices] = useState<{ monthly: string; annual: string }>({
    monthly: '$9.99', annual: '$99.99',
  });
  const [purchasing, setPurchasing] = useState(false);
  const inFlight = useRef(false);

  // Load real store prices (falls back to the hardcoded strings above).
  useEffect(() => {
    purchases.getOfferings().then(o => {
      setPrices({ monthly: o.monthly.priceString, annual: o.annual.priceString });
    });
  }, []);

  // If the trial is already active (user came here via Settings), or a
  // subscription is active, this screen shouldn't be reachable at all.
  useEffect(() => {
    if (status === 'trial' || status === 'active_monthly' || status === 'active_annual') {
      navigation.replace('Onboarding');
    }
  }, [status]);

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
        // SubscriptionContext will refresh via the entitlement listener.
        // Navigate to Onboarding regardless — App.tsx's gate handles the
        // rest based on subscription status.
        navigation.replace('Onboarding');
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

  async function handleTrial() {
    if (inFlight.current) return;
    inFlight.current = true;
    haptics.setComplete();
    try {
      await startTrial();
      haptics.goalMet();
      navigation.replace('Onboarding');
    } catch {
      Alert.alert('Could not start trial', 'Please check your connection and try again.');
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            Unlock UpShift
          </Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            Track everything. Earn every rank. No ads, ever.
          </Text>
        </View>

        {/* Benefits list */}
        <View style={[styles.benefits, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {[
            'Full nutrition tracking with USDA foods',
            'Personalized workout plans that progress with you',
            'Quest system, streaks, and leaderboard',
            'History graphs across every metric',
            'Friends and challenges',
          ].map(line => (
            <View key={line} style={styles.benefitRow}>
              <View style={[styles.check, { backgroundColor: palette.accent }]}>
                <Text style={styles.checkGlyph}>✓</Text>
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

        {/* Divider + trial CTA */}
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

        <Pressable
          onPress={() => purchases.restore()}
          hitSlop={12}
          style={styles.restore}>
          <Text style={[styles.restoreText, { color: palette.textMuted }]}>
            Restore purchases
          </Text>
        </Pressable>

        <Text style={[styles.fine, { color: palette.textMuted }]}>
          Subscriptions renew automatically unless cancelled. Cancel any time in your
          {' '}App Store or Play Store settings.
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
  checkGlyph: { color: '#001700', fontSize: 14, fontFamily: fontFamily.sansBold },
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
});
