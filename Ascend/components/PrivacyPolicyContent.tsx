// The actual policy text, shared between PrivacyPolicyScreen (its own full
// screen) and SettingsScreen (which expands it inline below the "Privacy
// policy" row rather than navigating away). One copy of the text so the two
// surfaces can never drift out of sync with each other.
//
// NOT legal advice. This is a genuine best-effort policy covering what the
// app actually does (sign-in providers, AI photo processing, crash
// reporting, optional Health data, push tokens, subscriptions) in the shape
// a real privacy policy takes — GDPR-style rights, a CCPA "we don't sell
// data" statement, named subprocessors, HealthKit's required non-advertising
// commitment — but it still needs a lawyer's review against your specific
// jurisdiction(s) and App Store/Play Store submission before shipping. Keep
// this in sync with reality: if a data source or third-party processor is
// added or removed from the app, this file has to change with it, or the
// policy stops being true.

import { Text, View, StyleSheet } from 'react-native';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import type { Palette } from '../theme/themedColors';

export default function PrivacyPolicyContent({ palette }: { palette: Palette }) {
  return (
    <View style={styles.content}>
      <Text style={[styles.updated, { color: palette.textMuted }]}>Last updated: September 12, 2026</Text>

      <Section title="1. Introduction" palette={palette}>
        UpShift ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, who we share it with, and the choices and rights you have. By using our mobile application ("App"), you agree to the collection and use of information as described here. We collect only what the App actually needs to work — nothing is gathered "just in case."
      </Section>

      <Section title="2. Information We Collect" palette={palette}>
        <Bold>Account information:</Bold> your email address and password, or — if you choose one of our other sign-in options — the name, email address, and unique account identifier shared with us by Google, Apple, or your phone carrier (for phone-number sign-in) when you authenticate through them. We never see or store your Google/Apple password.{'\n\n'}
        <Bold>Profile information:</Bold> name, nickname, date of birth, height, weight, gender, activity level, fitness goals, and any physical conditions you choose to share during onboarding.{'\n\n'}
        <Bold>Health and fitness data you log:</Bold> meals, workouts, water intake, sleep, and weight entries you enter yourself.{'\n\n'}
        <Bold>Health and fitness data from connected sources:</Bold> if you choose to connect Apple Health or Android Health Connect, we import the specific data types you approve (for example steps, workouts, weight, or sleep) directly from that source. This is entirely optional, off by default, and only active for data types you explicitly grant permission for. See Section 11 for how this data is used.{'\n\n'}
        <Bold>Food photos:</Bold> if you use the camera or "describe your meal" features to log food, the photo or text description you provide is sent to Google's Gemini AI service to identify the food and estimate its nutrition. We don't retain a permanent copy of these images ourselves beyond what's needed to complete that request.{'\n\n'}
        <Bold>Usage data:</Bold> how you use the App — quests completed, streaks, screens visited — used to keep the App working and to improve it.{'\n\n'}
        <Bold>Device and diagnostic information:</Bold> device type, operating system version, and — only when the App encounters an error — a crash report (the error message and a technical stack trace) so we can find and fix the problem. Crash reports do not include your profile data.{'\n\n'}
        <Bold>Push notification token:</Bold> if you enable notifications, a device-specific token used solely to deliver notifications you've opted into (reminders, new-message alerts). One token per device, cleared when you sign out.
      </Section>

      <Section title="3. Third-Party Sign-In" palette={palette}>
        If you sign in with Google, Apple, or your phone number instead of creating a password, that provider authenticates you and shares only the minimum information needed to create your account (typically your name and email, or your phone number). We never receive your password or account credentials from these providers. Apple's Sign in with Apple additionally lets you share a private relay email address instead of your real one — if you choose that option, we only ever see the relay address.
      </Section>

      <Section title="4. How We Use Your Information" palette={palette}>
        We use the information we collect to:{'\n\n'}
        • Provide, maintain, and improve the App{'\n'}
        • Calculate your personalized calorie, water, and activity targets{'\n'}
        • Personalize your experience, including age-appropriate content for users 13–17{'\n'}
        • Track your fitness progress and generate insights and history charts{'\n'}
        • Display your first name, last initial, avatar, level, and XP on the leaderboard{'\n'}
        • Send you notifications you've opted into (streaks, quests, bedtime reminders, new messages){'\n'}
        • Process subscriptions and payments through the App Store or Play Store{'\n'}
        • Diagnose and fix crashes and technical problems{'\n'}
        • Respond to your requests and provide customer support{'\n\n'}
        We do not use your health or fitness data — logged or imported from Apple Health/Health Connect — for advertising, and we do not sell it to data brokers or advertisers.
      </Section>

      <Section title="5. Third-Party Service Providers" palette={palette}>
        We rely on the following third parties to operate the App, each of whom processes data on our behalf under their own privacy and security commitments:{'\n\n'}
        • <Bold>Google Firebase</Bold> (authentication, database, and crash reporting infrastructure){'\n'}
        • <Bold>Google Gemini AI</Bold> (food photo and description recognition — receives only the image/text you submit for that purpose){'\n'}
        • <Bold>Cloudinary</Bold> (profile photo storage, if you upload one){'\n'}
        • <Bold>RevenueCat</Bold> (subscription and purchase management){'\n'}
        • <Bold>Apple / Google</Bold> (Sign in with Apple, Google Sign-In, Apple Health, Android Health Connect — only for the features you actively choose to use){'\n\n'}
        We do not permit any of these providers to use your data for their own advertising purposes.
      </Section>

      <Section title="6. Information Sharing" palette={palette}>
        We do not sell, rent, or trade your personal information. We may share limited information in the following circumstances:{'\n\n'}
        <Bold>Leaderboard:</Bold> only your first name, last initial, avatar, level, and XP are publicly visible. Your weight, age, meals, email, and health data are never shared there.{'\n\n'}
        <Bold>Friends and messages:</Bold> if you use the friends/messaging features, your chosen display name and the messages you send are visible to the friend you're messaging — never to anyone outside that conversation.{'\n\n'}
        <Bold>Service providers:</Bold> as described in Section 5, under confidentiality obligations, and only as needed to provide the App's features.{'\n\n'}
        <Bold>Legal requirements:</Bold> if required by law, legal process, or to protect the rights, safety, or property of UpShift or our users.{'\n\n'}
        <Bold>Business transfers:</Bold> if UpShift is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction, subject to this policy's continued protections.
      </Section>

      <Section title="7. Data Security" palette={palette}>
        We use industry-standard security measures, including encryption in transit and at rest, to protect your information. No method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.
      </Section>

      <Section title="8. Data Retention" palette={palette}>
        We retain your personal information for as long as your account is active or as needed to provide the App's features. Deleting your account removes your profile and logged data; some information may be retained briefly afterward where required for legal, security, or fraud-prevention purposes. You can request account deletion at any time (Settings, or by contacting us).
      </Section>

      <Section title="9. Your Privacy Rights" palette={palette}>
        Depending on where you live, you may have the right to:{'\n\n'}
        • Access and receive a copy of your personal information{'\n'}
        • Correct inaccurate or incomplete data{'\n'}
        • Delete your data or your entire account{'\n'}
        • Export your data in a portable format{'\n'}
        • Object to or restrict certain processing{'\n'}
        • Withdraw consent for optional features (like Health data, at any time, from Settings){'\n'}
        • Opt out of non-essential notifications{'\n\n'}
        <Bold>California residents:</Bold> we do not sell or share your personal information for cross-context behavioral advertising, so there is nothing to opt out of under the CCPA/CPRA in that respect — you still retain the access, deletion, and correction rights above.{'\n\n'}
        To exercise any of these rights, contact us using the details in Section 14.
      </Section>

      <Section title="10. International Data Transfers" palette={palette}>
        Our service providers may process and store data in countries other than your own, including the United States. Where required, we rely on appropriate safeguards (such as standard contractual clauses) to protect information transferred internationally.
      </Section>

      <Section title="11. Health Data (Apple Health / Android Health Connect)" palette={palette}>
        Connecting Apple Health or Android Health Connect is entirely optional and off by default. If you connect it, we only read the specific data types you approve, and only to display that information back to you inside the App and use it in your own calorie/activity calculations. We do not use Health data for advertising or marketing, we do not share it with advertisers or data brokers, and you can disconnect it at any time from Settings — doing so stops any further access immediately.
      </Section>

      <Section title="12. Notifications" palette={palette}>
        Push and local notifications (streak reminders, bedtime reminders, new-message alerts) are entirely opt-in and can be turned off at any time in Settings or your device's system settings, without affecting your ability to use the rest of the App.
      </Section>

      <Section title="13. Children's Privacy and Age Requirements" palette={palette}>
        The App is not intended for children under 13, and we do not knowingly collect information from anyone under that age — our onboarding blocks account creation outright for a birthdate under 13. Users 13–17 get an age-appropriate experience: no extreme diet or workout recommendations, and disclaimers reminding them the App is for general fitness and wellness, not medical advice. If we become aware we've collected information from a child under 13, we will delete it promptly — contact us if you believe this has happened.
      </Section>

      <Section title="14. Changes to This Policy" palette={palette}>
        We may update this Privacy Policy from time to time. We'll notify you of material changes by posting the updated policy in the App and updating the "Last updated" date above. Continued use of the App after a change is posted means you accept the update.
      </Section>

      <Section title="15. Contact Us" palette={palette}>
        Questions about this Privacy Policy, or want to exercise one of your rights from Section 9? Contact us at hello@upshift.app.
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
