// The actual policy text, shared between PrivacyPolicyScreen (its own full
// screen) and SettingsScreen (which expands it inline below the "Privacy
// policy" row rather than navigating away). One copy of the text so the two
// surfaces can never drift out of sync with each other.

import { Text, View, StyleSheet } from 'react-native';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import type { Palette } from '../theme/themedColors';

export default function PrivacyPolicyContent({ palette }: { palette: Palette }) {
  return (
    <View style={styles.content}>
      <Text style={[styles.updated, { color: palette.textMuted }]}>Last updated: August 30, 2026</Text>

      <Section title="1. Introduction" palette={palette}>
        UpShift ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application ("App"). By using the App, you agree to the collection and use of information in accordance with this policy.
      </Section>

      <Section title="2. Information We Collect" palette={palette}>
        <Bold>Account information:</Bold> When you create an account, we collect your name, email address, and authentication credentials.{'\n\n'}
        <Bold>Profile information:</Bold> Information you provide during onboarding such as age, weight, fitness goals, and dietary preferences.{'\n\n'}
        <Bold>Usage data:</Bold> We collect data about how you use the App, including meals logged, workouts completed, water intake, sleep data, and weight entries.{'\n\n'}
        <Bold>Device information:</Bold> We may collect device type, operating system version, and unique device identifiers for analytics and crash reporting purposes.
      </Section>

      <Section title="3. How We Use Your Information" palette={palette}>
        We use the information we collect to:{'\n\n'}
        • Provide, maintain, and improve the App{'\n'}
        • Personalize your experience and deliver tailored content{'\n'}
        • Track your fitness progress and generate insights{'\n'}
        • Display your first name, last initial, avatar, level, and XP on the leaderboard{'\n'}
        • Send you notifications about streaks, quests, and updates (if enabled){'\n'}
        • Process subscriptions and payments{'\n'}
        • Respond to your requests and provide customer support
      </Section>

      <Section title="4. Information Sharing" palette={palette}>
        We do not sell, trade, or rent your personal information to third parties. We may share limited information in the following circumstances:{'\n\n'}
        <Bold>Leaderboard:</Bold> Only your first name, last initial, avatar, level, and XP are publicly visible on the leaderboard. Your weight, age, meals, and email are never shared.{'\n\n'}
        <Bold>Service providers:</Bold> We may share information with trusted third-party service providers who assist us in operating the App (e.g., cloud hosting, analytics), subject to confidentiality obligations.{'\n\n'}
        <Bold>Legal requirements:</Bold> We may disclose information if required by law or in response to valid legal process.
      </Section>

      <Section title="5. Data Security" palette={palette}>
        We implement industry-standard security measures to protect your personal information, including encryption in transit and at rest. However, no method of electronic storage is 100% secure, and we cannot guarantee absolute security.
      </Section>

      <Section title="6. Data Retention" palette={palette}>
        We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us.
      </Section>

      <Section title="7. Your Rights" palette={palette}>
        You have the right to:{'\n\n'}
        • Access and review your personal information{'\n'}
        • Correct inaccurate data{'\n'}
        • Request deletion of your data{'\n'}
        • Opt out of non-essential notifications{'\n'}
        • Export your data in a portable format
      </Section>

      <Section title="8. Children's Privacy" palette={palette}>
        The App is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly.
      </Section>

      <Section title="9. Changes to This Policy" palette={palette}>
        We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy within the App. Your continued use of the App after changes are posted constitutes your acceptance of the updated policy.
      </Section>

      <Section title="10. Contact Us" palette={palette}>
        If you have any questions about this Privacy Policy, please contact us at hello@upshift.app.
      </Section>

      <View style={[styles.copyrightBlock, { borderTopColor: palette.divider }]}>
        <Text style={[styles.copyright, { color: palette.textMuted }]}>
          © {new Date().getFullYear()} UpShift. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

function Bold({ children }: { children: string }) {
  return <Text style={{ fontFamily: fontFamily.sansBold }}>{children}</Text>;
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
