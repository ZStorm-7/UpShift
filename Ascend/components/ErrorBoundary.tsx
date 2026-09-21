// ErrorBoundary — the last line of defense against a crash taking the whole
// app down to a white/blank screen with zero explanation.
//
// React error boundaries can only be class components — there is still no
// hook equivalent for catching a render-phase throw in a descendant, in
// React 19 or otherwise. This one wraps ThemedNavigator (see App.tsx): a
// crash anywhere in the navigator tree is caught here instead of unmounting
// the entire app, and "Try again" re-renders the SAME subtree fresh rather
// than requiring a real app restart.
//
// "Our team has been notified" is made literally true, not just reassuring
// copy: componentDidCatch writes a best-effort crash report to Firestore
// (write-only from the client — see firestore.rules' crashReports rule,
// mirroring the existing onboardingEvents/reports pattern). It's fire-and-
// forget and never throws back into the boundary itself — a broken network
// at the exact moment of a crash shouldn't compound into a second failure.

import { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { colors } from '../theme/colors';
import { spacing, radius, type } from '../theme/tokens';
import { Button } from './ui';
import haptics from '../services/haptics';

type Props = { children: ReactNode };
type State = { hasError: boolean };

function reportCrash(error: Error, componentStack: string | null | undefined) {
  try {
    addDoc(collection(db, 'crashReports'), {
      uid: auth.currentUser?.uid ?? null,
      message: String(error?.message ?? error).slice(0, 1000),
      stack: String(error?.stack ?? '').slice(0, 2000),
      componentStack: String(componentStack ?? '').slice(0, 2000),
      platform: Platform.OS,
      createdAt: serverTimestamp(),
    }).catch(() => {
      // Best-effort. A crash report that fails to send is still a crash the
      // user sees a real screen for — it just doesn't reach us this time.
    });
  } catch {
    // Never let reporting itself throw back into the boundary.
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportCrash(error, info.componentStack);
  }

  handleRetry = () => {
    haptics.selection();
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <MaintenanceScreen onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

// A plain, static-color screen — deliberately NOT usePalette(). This has to
// render even if the crash that triggered it happened somewhere inside the
// theme system itself, so it can't depend on any app context being intact.
function MaintenanceScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root} accessible accessibilityRole="alert">
      <View style={styles.iconCircle}>
        <Ionicons name="construct" size={36} color={colors.danger} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        Our team has been notified and is already looking into it. Your data is safe — nothing
        you've logged is lost.
      </Text>
      <Button label="Try again" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    marginBottom: spacing.sm,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: {
    minWidth: 180,
  },
});
