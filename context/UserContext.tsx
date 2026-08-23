import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
type UserProfile = {
  firstName: string;
  lastInitial: string;
  age: number;
  heightFeet: number;
  heightInches: number;
  weightLbs: number;
  gender: string;
  activityLevel: string;
  goal: string;
  waterGoalMl: number;
  calorieGoal: number;
  // Optional so existing profiles created before these features still load
  // fine — "no avatar yet" and "no language chosen yet" are valid states,
  // handled by defaulting to a placeholder icon / English wherever they're read.
  //
  // `avatar` empty/unset, or a legacy "preset:<emoji>" value from before the
  // emoji picker was removed, both mean the same thing to every screen: show
  // the colored-initials fallback instead. See components/Avatar.tsx.
  avatar?: string; // a Cloudinary photo URL, or empty/legacy for "no photo"
  // The user's chosen fill color for their initials avatar — one of
  // theme/colors.ts's avatarPalette entries. Unset means "use the
  // deterministic default for this uid", not "no color" — see
  // services/avatar.ts's getDefaultAvatarColor.
  avatarColor?: string;
  language?: string;
  // Local streak/quest-reminder notifications — see services/notifications.ts.
  // Optional, and undefined means "on": every existing profile predates this
  // field, and defaulting an unset flag to "off" would silently turn a
  // feature off for every current user instead of opting them in like a
  // freshly-added default should.
  notificationsEnabled?: boolean;
};

type UserContextType = {
  authUser: User | null;
  authLoading: boolean;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<string>;
  loadProfile: (uid: string) => Promise<boolean>;
  logOut: () => Promise<void>;
};

const UserContext = createContext<UserContextType>({
  authUser: null,
  authLoading: true,
  profile: null,
  setProfile: () => {},
  signUp: async () => {},
  logIn: async () => '',
  logOut: async () => {},
  loadProfile: async () => false,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Registers once when the app starts. Fires with the current user
  // (or null) as soon as Firebase finishes checking for a saved
  // session, and again every time login state changes after that.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });

    // Cleanup: stop listening if this provider ever unmounts.
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string) {
    await createUserWithEmailAndPassword(auth, email, password);
  }

  async function logIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.uid;
}
async function loadProfile(uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (snapshot.exists()) {
    setProfile(snapshot.data() as UserProfile);
    return true;
  }
  return false;
}

  async function logOut() {
    await signOut(auth);
    setProfile(null);
  }

  return (
    <UserContext.Provider
      value={{ authUser, authLoading, profile, setProfile, signUp, logIn, logOut, loadProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export function calculateWaterGoal(age: number): number {
  if (age <= 13) return 1700;
  if (age <= 18) return 2100;
  return 2500;
}

export function calculateCalorieGoal(
  age: number,
  weightLbs: number,
  heightFeet: number,
  heightInches: number,
  gender: string,
  activityLevel: string,
  goal: string
): number {
  const weightKg = weightLbs * 0.453592;
  const heightCm = (heightFeet * 30.48) + (heightInches * 2.54);

  let bmr: number;
  if (gender === 'Male') {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  } else {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  }

  const multipliers: Record<string, number> = {
    'Sedentary': 1.2,
    'Lightly active': 1.375,
    'Moderately active': 1.55,
    'Very active': 1.725,
  };
  const tdee = bmr * (multipliers[activityLevel] || 1.2);

  if (goal === 'Lose weight') return Math.round(tdee - 500);
  if (goal === 'Build muscle') return Math.round(tdee + 300);
  return Math.round(tdee);
}