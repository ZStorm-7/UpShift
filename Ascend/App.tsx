import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDoc } from 'firebase/firestore';
import { UserProvider, useUser } from './context/UserContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { LevelUpProvider } from './context/LevelUpContext';
import { ThemeProvider } from './theme/ThemeProvider';
import { usePalette } from './theme/themedColors';
import { useAppFonts } from './theme/fonts';
import { beat, splash as splashBeats } from './animation/motion';
import Splash from './components/Splash';
import BootSkeleton from './components/BootSkeleton';
import ConnectionFailedScreen from './components/ConnectionFailedScreen';
import ErrorBoundary from './components/ErrorBoundary';
import WelcomeScreen from './screens/WelcomeScreen';
import AuthMethodScreen from './screens/AuthMethodScreen';
import AuthScreen from './screens/AuthScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import SettingsScreen from './screens/SettingsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import OnboardingIntroScreen from './screens/OnboardingIntroScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import DashboardScreen from './screens/DashboardScreen';
import NutritionScreen from './screens/NutritionScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import WorkoutSummaryScreen from './screens/WorkoutSummaryScreen';
import HistoryScreen from './screens/HistoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FriendsScreen from './screens/FriendsScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import ChallengesScreen from './screens/ChallengesScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import LegalGateScreen, { legalAcceptanceDocRef } from './screens/LegalGateScreen';
import HealthSyncScreen from './screens/HealthSyncScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import WorkoutSensorScreen from './screens/WorkoutSensorScreen';
import SleepScreen from './screens/SleepScreen';
import WeightScreen from './screens/WeightScreen';
import BirthdayScreen from './screens/BirthdayScreen';
import OfflineBanner from './components/OfflineBanner';
import PushTokenRegistrar from './components/PushTokenRegistrar';

const Stack = createNativeStackNavigator();

// How long the boot sequence (auth state + profile/liability checks) gets
// before giving up and offering a manual retry instead of sitting on
// BootSkeleton forever. ~20s, per the explicit ask: long enough that a slow
// but working connection still gets in, short enough that a genuinely dead
// connection doesn't leave someone staring at a skeleton indefinitely.
const BOOT_TIMEOUT_MS = 20_000;

// Holds the native launch screen up until the JS Splash below is ready to
// take over. Without this call, the native splash can dismiss on its own
// schedule — on a real device that's a frame or two before RN has handed
// its root view a real layout, which is what read as the animation starting
// low/small and then "snapping" to fill the screen. Must run at module load,
// before the first render.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Landing route is now three-way, not two-way:
//   1. Signed out → Welcome
//   2. Signed in but no subscription/trial → Subscription
//   3. Signed in with subscription/trial but no profile → Onboarding
//   4. Signed in with everything → Dashboard
//
// SubscriptionScreen writes a trialStartedAt (or completes a purchase),
// then routes to Onboarding — so by the time a user reaches Onboarding
// they are already entitled.
function RootNavigator() {
  const { authUser, authLoading, loadProfile, emailVerified } = useUser();
  const { status: subStatus, isEntitled } = useSubscription();
  const palette = usePalette();
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // The consolidated legal acceptance (waiver + data consent + Privacy
  // Policy/ToS — see LegalGateScreen) lives in its own meta doc, not on the
  // main profile document — merging it into the profile doc would make that
  // document "exist" prematurely and corrupt the hasProfile check above.
  const [checkingLegal, setCheckingLegal] = useState(true);
  const [hasLegalAcceptance, setHasLegalAcceptance] = useState(false);
  // Bumped by the retry button below to re-run the effect right below it —
  // the one-shot loadProfile()/getDoc() calls in there are exactly the kind
  // of network call that can genuinely hang or fail on a bad connection, so
  // re-running them is a real retry, not just a UI reset.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setCheckingProfile(false);
      setCheckingLegal(false);
      return;
    }
    setCheckingProfile(true);
    loadProfile(authUser.uid)
      .then(setHasProfile)
      .catch(() => setLoadFailed(true))
      .finally(() => setCheckingProfile(false));

    setCheckingLegal(true);
    getDoc(legalAcceptanceDocRef(authUser.uid))
      .then(snap => setHasLegalAcceptance(snap.exists() && !!snap.data()?.accepted))
      // Fail open on a read error rather than trap a signed-in, entitled
      // user on a screen that can't tell whether they've already accepted.
      .catch(() => setHasLegalAcceptance(true))
      .finally(() => setCheckingLegal(false));
  }, [authUser, authLoading, retryTick]);

  const isLoading =
    authLoading || checkingProfile || checkingLegal || subStatus === 'loading';

  // If boot hasn't resolved within BOOT_TIMEOUT_MS, stop showing a skeleton
  // that implies "almost there" and show something honest instead. Re-arms
  // whenever isLoading goes back to true (a fresh boot attempt, or a retry)
  // and clears the moment loading actually finishes.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setBootTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setBootTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading, retryTick]);

  const retryBoot = () => {
    setBootTimedOut(false);
    setLoadFailed(false);
    setRetryTick(t => t + 1);
  };

  // BootSkeleton is for the FIRST boot only, and this distinction is the whole
  // bug it used to have. `isLoading` goes true again on every sign-in, because
  // the effect above re-arms checkingProfile/checkingLiability the moment
  // authUser appears. Returning BootSkeleton on that pass unmounted the entire
  // Stack.Navigator out from under AuthScreen while its own
  // navigation.replace() was still in flight — so the user was thrown back to
  // a freshly-remounted navigator at initialRouteName instead of landing on
  // Dashboard. (Tearing down a native stack mid-transition is also a crash
  // vector in react-native-screens, which is why it could take the app down
  // rather than merely bouncing it.)
  //
  // Once the navigator is up it stays up. Sign-in is navigated explicitly by
  // AuthScreen, and sign-out by SettingsScreen's navigation.reset to Welcome,
  // so nothing here needs to swap the tree to move the user.
  const [hasBooted, setHasBooted] = useState(false);
  useEffect(() => {
    if (!isLoading) setHasBooted(true);
  }, [isLoading]);

  // Checked before the plain BootSkeleton branch below — a timed-out first
  // boot should show the honest failure screen, not keep implying "almost
  // there" forever.
  if (isLoading && !hasBooted && bootTimedOut) {
    return <ConnectionFailedScreen onRetry={retryBoot} />;
  }

  if (isLoading && !hasBooted) return <BootSkeleton />;

  // Email verification is only ever FORCED once a real (paid) subscription
  // is in place — never during the app-side free trial. A trial user who
  // never verifies loses nothing but a reminder; a paying subscriber is
  // blocked here on every cold boot until they do, which is what catches
  // someone who bought a subscription, closed the app before verifying, and
  // came back later (the in-flow gate is SubscriptionScreen's own post-
  // purchase navigation — this is the belt to that braces).
  const needsEmailVerification =
    !!authUser && !emailVerified && (subStatus === 'active_monthly' || subStatus === 'active_annual');

  const initialRouteName =
    !authUser || loadFailed ? 'Welcome'
    : !isEntitled ? 'Subscription'
    : needsEmailVerification ? 'VerifyEmail'
    : !hasLegalAcceptance ? 'LegalGate'
    : hasProfile ? 'Dashboard' : 'Onboarding';

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: beat.screenTransition,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      {/* Reached from BOTH of Welcome's buttons with a `mode` param
          ('login' | 'signup') — the fork point between the Apple/Google/
          phone credential flows (handled on this screen itself) and the
          plain email/password form ('Auth', below), which it hands off to
          for "Continue with email". */}
      <Stack.Screen name="AuthMethod" component={AuthMethodScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      {/* initialParams carries hasProfile so an EXISTING account (one that
          predates this screen and so is missing the acceptance doc too)
          lands back on Dashboard after accepting, not Onboarding — this
          screen is reached by every account missing the doc, not just
          brand-new signups. */}
      <Stack.Screen name="LegalGate" component={LegalGateScreen} initialParams={{ hasProfile }} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      {/* Reached only via an explicit navigation.replace('OnboardingIntro')
          right after a brand-new signup (the Welcome/Auth flow's job, not
          this navigator's) — never from cold-boot routing above, so an
          existing user who hasn't finished onboarding lands straight back
          on the questions instead of seeing this preview every reopen. */}
      <Stack.Screen name="OnboardingIntro" component={OnboardingIntroScreen} />
      <Stack.Screen name="HealthSync" component={HealthSyncScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Nutrition" component={NutritionScreen} />
      <Stack.Screen name="Workout" component={WorkoutScreen} />
      <Stack.Screen name="WorkoutSensor" component={WorkoutSensorScreen} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Challenges" component={ChallengesScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
      <Stack.Screen name="Sleep" component={SleepScreen} />
      <Stack.Screen name="Weight" component={WeightScreen} />
      <Stack.Screen name="Birthday" component={BirthdayScreen} />
    </Stack.Navigator>
  );
}

function ThemedNavigator() {
  const palette = usePalette();

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* Above the navigator so it pushes content down rather than
          covering the top of whatever screen is showing. */}
      <OfflineBanner />
      <PushTokenRegistrar />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const bootedAt = useRef(Date.now());
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsSettled = fontsLoaded || !!fontError;

  // Hand off from the native launch screen to the JS Splash on the SAME
  // frame this component starts rendering it — any gap between the native
  // splash disappearing and this tree painting is exactly the low/wrong-size
  // flash this was chasing.
  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  if (!fontsSettled) return <View style={styles.boot} />;

  return (
    // GestureHandlerRootView has to wrap everything that uses
    // react-native-gesture-handler (the swipe-to-delete rows) — without it,
    // pan gestures silently never fire on Android and print a warning on iOS.
    // Outermost because it has to be an ancestor of every screen, not just
    // the ones with a swipeable row today.
    <GestureHandlerRootView style={styles.root}>
    {/* SafeAreaProvider is what makes useSafeAreaInsets() work anywhere below
        it. Without it every screen rendered from y=0, so the AppBar's back
        arrow and title sat underneath the status bar / notch on every device.
        react-native-safe-area-context was already a dependency; it had simply
        never been mounted. */}
    <SafeAreaProvider>
    <UserProvider>
      <ThemeProvider>
        <SubscriptionProvider>
          <LanguageProvider>
            {/* None of the four providers render a host view, so without this
                wrapper ThemedNavigator and Splash were bare siblings sitting
                directly on the native root — and an absolutely-positioned
                Splash resolves against whatever box that root happens to have
                on the frame it mounts. A definite flex:1 container gives both
                children one unambiguous full-screen parent to lay out in. */}
            {/* Inside LanguageProvider/ThemeProvider so the takeover can read
                the palette, but ABOVE the navigator so it renders over
                whatever screen is currently showing. */}
            <LevelUpProvider>
              <View style={styles.root}>
                {/* Wraps ONLY the navigator, not Splash — a crash caught
                    here should show the maintenance screen behind whatever
                    the splash is doing, not interrupt the boot animation
                    itself. "Try again" remounts this subtree fresh. */}
                <ErrorBoundary>
                  <ThemedNavigator />
                </ErrorBoundary>
                {!splashDone && (
                  <Splash
                    budget={splashBeats.total - (Date.now() - bootedAt.current)}
                    onDone={() => setSplashDone(true)}
                  />
                )}
              </View>
            </LevelUpProvider>
          </LanguageProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </UserProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Bare black for the pre-font window — doesn't yet know the user's
  // theme (loaded from Firestore after auth), so matches the splash/icon.
  boot: { flex: 1, backgroundColor: '#0A0A0A' },
  // Deliberately NO backgroundColor. This wrapper sits inside ThemeProvider
  // but reads from a static StyleSheet, so any colour hardcoded here can't
  // follow the light/dark palette — an earlier version pinned it to the dark
  // #0A0A0A, which painted a near-black ground beneath every screen in light
  // mode. ThemedNavigator already fills itself with palette.bg, and Splash
  // paints its own, so there is nothing left for this layer to colour.
  root: { flex: 1 },
});
