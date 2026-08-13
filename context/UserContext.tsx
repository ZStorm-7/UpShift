import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase/config';

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
};

type UserContextType = {
  authUser: User | null;
  authLoading: boolean;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
};

const UserContext = createContext<UserContextType>({
  authUser: null,
  authLoading: true,
  profile: null,
  setProfile: () => {},
  signUp: async () => {},
  logIn: async () => {},
  logOut: async () => {},
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
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logOut() {
    await signOut(auth);
    setProfile(null);
  }

  return (
    <UserContext.Provider
      value={{ authUser, authLoading, profile, setProfile, signUp, logIn, logOut }}>
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