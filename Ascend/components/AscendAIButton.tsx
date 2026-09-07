// AscendAIButton — the floating entry point to Ascend AI, pinned to the
// bottom-right of the app.
//
// Mounted once alongside the NavigationContainer (see App.tsx) rather than
// per-screen, so it's reachable from anywhere without every screen having
// to render its own copy. It hides itself on the screens where a persistent
// floating button would be wrong: the pre-auth flow (nothing to ask about
// yet), the AI screen itself, and the full-bleed camera screen where it
// would sit on top of the live preview.
//
// Route name and navigation both arrive as PROPS rather than from
// useNavigationState/useNavigation. Those hooks require the calling
// component to be rendered *inside* a navigator's screen, and this one
// deliberately isn't — being a sibling of the navigator is what lets it
// float above every screen. Calling them here threw "Couldn't get the
// navigation state. Is your component inside a navigator?" and took the
// whole app down. App.tsx owns the container ref and the onStateChange
// subscription instead, and hands both down.

import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, layout } from '../theme/tokens';
import { usePalette } from '../theme/themedColors';
import haptics from '../services/haptics';

const HIDDEN_ON = new Set([
  'Welcome', 'Auth', 'Subscription', 'Liability', 'Onboarding',
  'AscendAI', 'Birthday', 'VerifyEmail',
]);

export default function AscendAIButton({
  routeName,
  onPress,
}: {
  routeName?: string;
  onPress: () => void;
}) {
  const palette = usePalette();

  if (!routeName || HIDDEN_ON.has(routeName)) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => { haptics.selection(); onPress(); }}
        style={[styles.button, { backgroundColor: palette.accent, borderColor: palette.accentBorder }]}
        accessibilityRole="button"
        accessibilityLabel="Ask Ascend AI">
        <Ionicons name="sparkles" size={22} color={palette.textOnAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    zIndex: 40,
  },
  button: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: layout.hairline,
    // Shadow so it reads as floating above the content it overlaps rather
    // than as part of whatever screen is behind it.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
