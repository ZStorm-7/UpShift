// PLACEHOLDER LEGAL TEXT — NOT REVIEWED BY A LAWYER.
//
// Standard SaaS/app boilerplate sections, written to be directionally
// correct and to reference this app's actual trial/subscription model
// (see SubscriptionScreen) rather than being generic filler — but this has
// not been reviewed by counsel and must not ship to production users until
// it has been. Mirrors PrivacyPolicyContent.tsx's structure/styling exactly
// so the two legal screens read as one family rather than two different
// documents bolted together.

import { Text, View, StyleSheet } from 'react-native';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import type { Palette } from '../theme/themedColors';

export default function TermsOfServiceContent({ palette }: { palette: Palette }) {
  return (
    <View style={styles.content}>
      <Text style={[styles.updated, { color: palette.textMuted }]}>Last updated: August 30, 2026</Text>

      <Section title="1. Acceptance of Terms" palette={palette}>
        By creating an account or otherwise using UpShift ("we", "our", "us", or the "App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App. We may update these Terms from time to time; continued use of the App after an update constitutes acceptance of the revised Terms.
      </Section>

      <Section title="2. Use of the App" palette={palette}>
        You must be at least 13 years old to use the App. You agree to provide accurate information when creating an account and to keep your login credentials confidential. You are responsible for all activity that occurs under your account. You agree not to misuse the App — including attempting to access it by any means other than the interface we provide, interfering with its normal operation, or using it for any unlawful purpose.
      </Section>

      <Section title="3. Subscriptions, Trials, and Billing" palette={palette}>
        UpShift offers a free trial period, after which continued access to premium features requires an active paid subscription (monthly or annual, as offered in the App at the time of purchase).{'\n\n'}
        Subscriptions automatically renew at the end of each billing period unless cancelled at least 24 hours before the renewal date. Payment is charged through your app store account (Apple App Store or Google Play) at confirmation of purchase and again at each renewal. You can manage or cancel your subscription at any time through your app store account settings — we do not have the ability to cancel it on your behalf.{'\n\n'}
        No refunds are provided for partial subscription periods, except where required by applicable law or the policies of the relevant app store.
      </Section>

      <Section title="4. User Content" palette={palette}>
        You retain ownership of any content you submit to the App (such as a profile photo, display name, or logged activity). By submitting content, you grant us a non-exclusive, worldwide, royalty-free license to use, store, and display that content solely for the purpose of operating and improving the App — including, where you have not opted out, showing your first name, last initial, avatar, level, and XP on the leaderboard. You are solely responsible for the content you submit and must not submit anything unlawful, infringing, or abusive.
      </Section>

      <Section title="5. Disclaimers" palette={palette}>
        UpShift is a fitness and wellness tracking tool, not a medical device or a substitute for professional medical advice. Consult a physician before beginning any new exercise, nutrition, or supplementation program, particularly if you have an existing health condition. The App is provided "as is" and "as available" without warranties of any kind, whether express or implied, including — but not limited to — warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the App will be uninterrupted, error-free, or that any calorie, macro, or fitness estimate it produces is accurate.
      </Section>

      <Section title="6. Limitation of Liability" palette={palette}>
        To the fullest extent permitted by law, UpShift and its developers will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, use, goodwill, or other intangible losses, resulting from your access to or use of, or inability to access or use, the App — including any injury or health outcome arising from activity undertaken based on information in the App. Our total liability for any claim arising out of these Terms or the App will not exceed the amount you paid us, if any, in the twelve months preceding the claim.
      </Section>

      <Section title="7. Termination" palette={palette}>
        We may suspend or terminate your access to the App at any time if we reasonably believe you have violated these Terms. You may stop using the App and delete your account at any time. Sections of these Terms that by their nature should survive termination (including Disclaimers and Limitation of Liability) will survive.
      </Section>

      <Section title="8. Changes to These Terms" palette={palette}>
        We may revise these Terms from time to time. If we make material changes, we will notify you by posting the updated Terms within the App and updating the "Last updated" date above. Your continued use of the App after changes take effect constitutes your acceptance of the revised Terms.
      </Section>

      <Section title="9. Contact Us" palette={palette}>
        If you have any questions about these Terms, please contact us at hello@upshift.app.
      </Section>

      <View style={[styles.copyrightBlock, { borderTopColor: palette.divider }]}>
        <Text style={[styles.copyright, { color: palette.textMuted }]}>
          © {new Date().getFullYear()} UpShift. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

function Section({ title, palette, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>{title}</Text>
      <Text style={[styles.sectionBody, { color: palette.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  updated: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
  },
  sectionBody: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 22,
  },
  copyrightBlock: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  copyright: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    textAlign: 'center',
  },
});
