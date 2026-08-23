import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { UserProvider, useUser } from './context/UserContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { colors } from './theme/colors';
import { useAppFonts } from './theme/fonts';
import { beat, splash as splashBeats } from './animation/motion';
import Splash from './components/Splash';
import BootSkeleton from './components/BootSkeleton';
import WelcomeScreen from './screens/WelcomeScreen';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import DashboardScreen from './screens/DashboardScreen';
import NutritionScreen from './screens/NutritionScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import WorkoutSummaryScreen from './screens/WorkoutSummaryScreen';
import HistoryScreen from './screens/HistoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FriendsScreen from './screens/FriendsScreen';
import ChallengesScreen from './screens/ChallengesScreen';

const Stack = createNativeStackNavigator();

// Decides which screen to land on when the app first opens: if Firebase
// already has a signed-in user, skip Welcome/Auth entirely and go straight
// to Dashboard (or Onboarding, if that user has no saved profile yet).
function RootNavigator() {
  const { authUser, authLoading, loadProfile } = useUser();
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      setCheckingProfile(false);
      return;
    }

    setCheckingProfile(true);
    // The .catch matters more than it looks. If this read rejects — offline
    // with no cached copy, or rules denying it — the old code never reached
    // setCheckingProfile(false), so the app sat on its full-screen spinner
    // forever with no retry and no way out but force-quitting. Treating a
    // failed read as "no profile" would be worse than useless: it routes the
    // user into Onboarding, whose save has no merge and would overwrite the
    // profile they already have. So a failure sends them to Welcome instead,
    // where signing in retries the whole thing.
    loadProfile(authUser.uid)
      .then(setHasProfile)
      .catch(() => setLoadFailed(true))
      .finally(() => setCheckingProfile(false));
  }, [authUser, authLoading]);

  if (authLoading || checkingProfile) {
    // Skeletons, not a spinner.
    //
    // This used to render a full-screen animated gear, which was wrong twice
    // over. The design notes are explicit — "Skeletons over spinners: the
    // Dashboard reads from Firebase, so show the layout's shape immediately"
    // — and a spinner is a worse answer here anyway: it says "wait" without
    // saying what for, and because it sits where the splash just was, a slow
    // auth check reads as the splash having broken into a loading screen.
    // The skeleton says "the Dashboard is coming and this is its shape",
    // which is both true and the thing the user wants to know.
    //
    // GearSpinner still exists in components/ but is no longer rendered
    // anywhere. It is kept, not deleted, because the design does reserve a
    // spinner for one case — "only for genuinely indeterminate waits like a
    // Firebase write" — and that case has no UI yet. If nothing claims it,
    // delete the file rather than letting an unused component rot.
    return <BootSkeleton />;
  }

  // On a failed profile read, land on Welcome rather than guessing. Guessing
  // "no profile" would send an existing user into Onboarding and overwrite
  // the profile they already have.
  const initialRouteName =
    !authUser || loadFailed ? 'Welcome' : hasProfile ? 'Dashboard' : 'Onboarding';

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        // Fade, not slide. The design's reasoning, which I agree with: a
        // horizontal slide implies hierarchy — you went one level deeper and
        // you'll come back out. UpShift isn't shaped that way. The Dashboard
        // is a hub and Nutrition/Workout/History are siblings hanging off it,
        // so sliding between them is describing a structure the app doesn't
        // have.
        animation: 'fade',
        // iOS honours this; Android's fragment transition uses the system
        // duration and ignores it. Close enough that the two don't read as
        // different apps.
        animationDuration: beat.screenTransition,
        // Stops the white flash between screens on Android — the default
        // container background is the theme's, not ours.
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Nutrition" component={NutritionScreen} />
      <Stack.Screen name="Workout" component={WorkoutScreen} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
      <Stack.Screen name="Challenges" component={ChallengesScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  // When the JS bundle finished evaluating. The splash budget is measured
  // from here, so a slow cold start eats into the sequence instead of adding
  // to it — see the `budget` prop on Splash.
  const bootedAt = useRef(Date.now());

  // Fonts. The splash is the cover for this: the faces download and register
  // while the chevron is drawing itself, so by the time the layer lifts the
  // serif is ready and nothing re-flows.
  //
  // `fontError` is caught but not fatal. Losing the serif makes the app look
  // wrong; refusing to boot makes it useless — so a font failure falls back
  // to the system face and the app runs.
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsSettled = fontsLoaded || !!fontError;

  // Nothing at all until the faces settle. Rendering the tree first would
  // paint every screen in the system font and then snap to the serif a beat
  // later — the exact flash-of-unstyled-text the splash is here to hide.
  // A bare background, not a spinner: this window is normally under 200ms and
  // anything that appears in it is a flicker rather than information.
  if (!fontsSettled) {
    return <View style={styles.boot} />;
  }

  return (
    <UserProvider>
      <LanguageProvider>
        {/* The navigator mounts immediately and loads underneath the splash,
            so the 1.7s is spent doing the auth check and the first Firestore
            read rather than waiting. */}
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        {!splashDone && (
          <Splash
            budget={splashBeats.total - (Date.now() - bootedAt.current)}
            onDone={() => setSplashDone(true)}
          />
        )}
      </LanguageProvider>
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  // The pre-font window. Just the app's background, so the transition into
  // the splash is a continuation of one black field rather than a cut.
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
