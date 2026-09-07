import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
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
import WelcomeScreen from './screens/WelcomeScreen';
import AuthScreen from './screens/AuthScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import SettingsScreen from './screens/SettingsScreen';
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
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import MotivationScreen from './screens/MotivationScreen';
import LiabilityScreen, { liabilityDocRef } from './screens/LiabilityScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import WorkoutSensorScreen from './screens/WorkoutSensorScreen';
import SleepScreen from './screens/SleepScreen';
import WeightScreen from './screens/WeightScreen';
import BirthdayScreen from './screens/BirthdayScreen';
import AscendAIScreen from './screens/AscendAIScreen';
import OfflineBanner from './components/OfflineBanner';
import AscendAIButton from './components/AscendAIButton';

const Stack = createNativeStackNavigator();

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
  // The liability waiver lives in its own meta doc, not on the main
  // profile document — see LiabilityScreen's comment for why merging it
  // into the profile doc would corrupt the hasProfile check above.
  const [checkingLiability, setCheckingLiability] = useState(true);
  const [hasLiability, setHasLiability] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { setCheckingProfile(false); setCheckingLiability(false); return; }
    setCheckingProfile(true);
    loadProfile(authUser.uid)
      .then(setHasProfile)
      .catch(() => setLoadFailed(true))
      .finally(() => setCheckingProfile(false));

    setCheckingLiability(true);
    getDoc(liabilityDocRef(authUser.uid))
      .then(snap => setHasLiability(snap.exists() && !!snap.data()?.accepted))
      // Fail open on a read error rather than trap a signed-in, entitled
      // user on a screen that can't tell whether they've already accepted.
      .catch(() => setHasLiability(true))
      .finally(() => setCheckingLiability(false));
  }, [authUser, authLoading]);

  const isLoading = authLoading || checkingProfile || checkingLiability || subStatus === 'loading';

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
    : !hasLiability ? 'Liability'
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
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Liability" component={LiabilityScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
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
      <Stack.Screen name="Challenges" component={ChallengesScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="Motivation" component={MotivationScreen} />
      <Stack.Screen name="Sleep" component={SleepScreen} />
      <Stack.Screen name="Weight" component={WeightScreen} />
      <Stack.Screen name="Birthday" component={BirthdayScreen} />
      <Stack.Screen name="AscendAI" component={AscendAIScreen} />
    </Stack.Navigator>
  );
}

function ThemedNavigator() {
  const palette = usePalette();
  // The container ref + onStateChange are what let the floating AI button
  // know the current route and navigate, WITHOUT it having to be inside a
  // navigator itself — see AscendAIButton's comment for why the hook-based
  // version couldn't work there.
  // Typed loosely: this app has no generated route-param type map, so the
  // default generic resolves route names to `never`.
  const navigationRef = useNavigationContainerRef<any>();
  const [routeName, setRouteName] = useState<string | undefined>();

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* Above the navigator so it pushes content down rather than
          covering the top of whatever screen is showing. */}
      <OfflineBanner />
      <NavigationContainer
        ref={navigationRef}
        onReady={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
        onStateChange={() => setRouteName(navigationRef.getCurrentRoute()?.name)}>
        <RootNavigator />
      </NavigationContainer>
      {/* Sibling of the container, so it floats above every screen. */}
      <AscendAIButton
        routeName={routeName}
        onPress={() => navigationRef.navigate('AscendAI')}
      />
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
    // SafeAreaProvider is what makes useSafeAreaInsets() work anywhere below
    // it. Without it every screen rendered from y=0, so the AppBar's back
    // arrow and title sat underneath the status bar / notch on every device.
    // react-native-safe-area-context was already a dependency; it had simply
    // never been mounted.
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
                <ThemedNavigator />
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
