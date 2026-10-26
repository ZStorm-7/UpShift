import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import purchases from '../services/purchases';
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
  // Sends a reset link. Always resolves the same way whether or not the email
  // has an account, so it can't be used to discover who is registered.
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  // Re-reads the account from Firebase and reports whether the email is verified.
  refreshEmailVerified: () => Promise<boolean>;
  emailVerified: boolean;
  // Re-enters the password: required before deleting the account.
  reauthenticate: (password: string) => Promise<void>;
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
  resetPassword: async () => {},
  resendVerification: async () => {},
  refreshEmailVerified: async () => false,
  emailVerified: false,
  reauthenticate: async () => {},
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
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Fire and forget: a failed verification email must not fail sign-up.
    sendEmailVerification(credential.user).catch(() => {});
  }

  const [emailVerified, setEmailVerified] = useState(false);
  useEffect(() => { setEmailVerified(!!authUser?.emailVerified); }, [authUser]);

  async function resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e: any) {
      // Hide "no such user" so the response is identical either way; surface
      // problems the user can act on (bad format, offline, rate limited).
      if (e?.code === 'auth/user-not-found') return;
      throw e;
    }
  }

  async function resendVerification() {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }

  async function refreshEmailVerified() {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const verified = !!auth.currentUser.emailVerified;
    setEmailVerified(verified);
    return verified;
  }

  async function reauthenticate(password: string) {
    const user = auth.currentUser;
    if (!user?.email) throw new Error('No signed-in user');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
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
    purchases.reset().catch(() => {});
    setProfile(null);
  }

  return (
    <UserContext.Provider
      value={{
        authUser, authLoading, profile, setProfile, signUp, logIn, logOut, loadProfile,
        resetPassword, resendVerification, refreshEmailVerified, emailVerified, reauthenticate,
      }}>
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