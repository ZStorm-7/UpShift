import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { UserProvider, useUser } from './context/UserContext';
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

const Stack = createNativeStackNavigator();

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
    </Stack.Navigator>
  );
}

function ThemedNavigator() {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
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

  if (!fontsSettled) return <View style={styles.boot} />;

  return (
    <UserProvider>
      <ThemeProvider>
        <SubscriptionProvider>
          <LanguageProvider>
            <ThemedNavigator />
            {!splashDone && (
              <Splash
                budget={splashBeats.total - (Date.now() - bootedAt.current)}
                onDone={() => setSplashDone(true)}
              />
            )}
          </LanguageProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  // Bare black for the pre-font window — doesn't yet know the user's
  // theme (loaded from Firestore after auth), so matches the splash/icon.
  boot: { flex: 1, backgroundColor: '#0A0A0A' },
});
