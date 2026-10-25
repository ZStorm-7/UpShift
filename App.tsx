import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserProvider, useUser } from './context/UserContext';
import { BreakProvider, useBreak, takePendingBreak } from './context/BreakContext';
import { navigationRef } from './services/navigationRef';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { LanguageProvider } from './i18n/LanguageContext';
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
import BreakScreen from './screens/BreakScreen';
import BreaksSettingsScreen from './screens/BreaksSettingsScreen';
import BreaksInsightsScreen from './screens/BreaksInsightsScreen';
import CoachWidget from './components/CoachWidget';

const Stack = createNativeStackNavigator();

// Landing route is now three-way, not two-way:
//   1. Signed out → Welcome
//   2. Signed in but no subscription/trial → Subscription
//   3. Signed in with subscription/trial but no profile → Onboarding
//   4. Signed in with everything → Dashboard
//
// SubscriptionScreen asks the startTrial function to record the trial (or completes a purchase),
// then routes to Onboarding — so by the time a user reaches Onboarding
// they are already entitled.
function RootNavigator() {
  const { authUser, authLoading, loadProfile } = useUser();
  const { status: subStatus, isEntitled } = useSubscription();
  const palette = usePalette();
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { setCheckingProfile(false); return; }
    setCheckingProfile(true);
    loadProfile(authUser.uid)
      .then(setHasProfile)
      .catch(() => setLoadFailed(true))
      .finally(() => setCheckingProfile(false));
  }, [authUser, authLoading]);

  const isLoading = authLoading || checkingProfile || subStatus === 'loading';
  if (isLoading) return <BootSkeleton />;

  const initialRouteName =
    !authUser || loadFailed ? 'Welcome'
    : !isEntitled ? 'Subscription'
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
      <Stack.Screen name="Settings" component={SettingsScreen} />
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
      <Stack.Screen name="BreaksSettings" component={BreaksSettingsScreen} />
      <Stack.Screen name="BreaksInsights" component={BreaksInsightsScreen} />
      {/* The break is mandatory: no swipe-back, and the screen itself blocks the back button. */}
      <Stack.Screen
        name="Break"
        component={BreakScreen}
        options={{ gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: '#050A09' } }}
      />
    </Stack.Navigator>
  );
}

// Lets `upshift://break?pkg=...&label=...` open the break, which is how the
// Android service brings it to the front when the user is in another app.
const linking = {
  prefixes: ['upshift://'],
  config: { screens: { Break: 'break' } },
};

function ThemedNavigator() {
  const palette = usePalette();
  const { startBreak } = useBreak();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => {
          // A break requested during startup (before navigation existed).
          const pending = takePendingBreak();
          if (pending) startBreak(pending);
        }}>
        <RootNavigator />
        <CoachWidget />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const bootedAt = useRef(Date.now());
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsSettled = fontsLoaded || !!fontError;

  if (!fontsSettled) return <View style={styles.boot} />;

  // SafeAreaProvider at the root: components outside the navigator (the floating
  // AI coach) read insets too, and without a provider that throws.
  return (
    <SafeAreaProvider>
    <UserProvider>
      <ThemeProvider>
        <SubscriptionProvider>
          <LanguageProvider>
            <BreakProvider ready={splashDone}>
            <ThemedNavigator />
            {!splashDone && (
              <Splash
                budget={splashBeats.total - (Date.now() - bootedAt.current)}
                onDone={() => setSplashDone(true)}
              />
            )}
            </BreakProvider>
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
});
