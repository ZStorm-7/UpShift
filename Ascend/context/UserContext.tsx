import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDeviceId, ensureDeviceRegistered, startFreshSession, subscribeToSessionValidity } from '../firebase/sessions';
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
  // Generalized categories the user flagged during onboarding (e.g. "Heart
  // condition", "Joint or knee problems"), plus optional free text for
  // anything more specific than a category name can say. Both optional —
  // every profile created before this question existed simply has neither.
  physicalConditions?: string[];
  physicalNotes?: string;
  // Birthday, captured during onboarding — month/day only (no year, since
  // age is already collected separately and the birthday screen only needs
  // to know which calendar day to fire on). Optional: every profile from
  // before this question existed simply has neither.
  birthdayMonth?: number; // 1-12
  birthdayDay?: number;   // 1-31
  // User-set bedtime for the nightly wind-down reminder — see SleepScreen.
  // Defaults (22:00) apply when unset.
  bedtimeHour?: number;
  bedtimeMinute?: number;
  // Whether the bedtime reminder notification fires, independent of
  // `notificationsEnabled` — that flag is Settings' "Streak & quest
  // reminders" switch, and bedtime has nothing to do with streaks or quests.
  // Its own toggle lives on SleepScreen, next to the bedtime it controls.
  // Optional so every existing profile keeps getting the reminder it already
  // had; undefined means "on", matching every other opt-in-by-default flag.
  bedtimeReminderEnabled?: boolean;
  // The name other people see on the leaderboard and in friend lists.
  // Optional: when unset, screens fall back to "FirstName L." as before, so
  // every profile that predates this field keeps its existing display.
  displayName?: string;
  // Shown when someone taps this user on the leaderboard. Optional; the
  // profile view shows a "no bio yet" placeholder when empty.
  bio?: string;
  // User-chosen text scale, applied on top of the app's type sizes. 1 is
  // the default; see the Customize tab in Settings.
  fontScale?: number;
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
  // Fires Firebase's own verification email to whatever address the account
  // was created with. No-op (never throws to the caller in a way that
  // crashes the UI) if there's no signed-in user.
  sendVerificationEmail: () => Promise<void>;
  // Firebase doesn't push emailVerified changes to the auth-state listener —
  // it only updates the LOCAL user object after an explicit reload(), so a
  // screen asking "has this been verified yet" has to call this rather than
  // just re-reading authUser.emailVerified. Returns the fresh value AND
  // replaces `authUser` with the reloaded object so every other reader
  // (App.tsx's routing included) sees the same up-to-date flag.
  refreshEmailVerified: () => Promise<boolean>;
  emailVerified: boolean;
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
  sendVerificationEmail: async () => {},
  refreshEmailVerified: async () => false,
  emailVerified: false,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Tracked separately from authUser.emailVerified — see refreshEmailVerified
  // for why reading it straight off the User object doesn't pick up changes.
  const [emailVerified, setEmailVerified] = useState(false);

  // Registers once when the app starts. Fires with the current user
  // (or null) as soon as Firebase finishes checking for a saved
  // session, and again every time login state changes after that.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setEmailVerified(user?.emailVerified ?? false);
      setAuthLoading(false);
    });

    // Cleanup: stop listening if this provider ever unmounts.
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // A genuine new sign-up always starts a fresh, trusted session on this
    // device — see startFreshSession's comment on why this is distinct
    // from the reload-safe ensureDeviceRegistered used below.
    const deviceId = await getDeviceId();
    await startFreshSession(credential.user.uid, deviceId);
  }

  async function logIn(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const deviceId = await getDeviceId();
    await startFreshSession(credential.user.uid, deviceId);
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

  async function sendVerificationEmail() {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }

  async function refreshEmailVerified(): Promise<boolean> {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    // `reload` mutates the SDK's internal user object in place, so
    // `authUser` (a stale reference from the last auth-state event) never
    // sees the change on its own — `emailVerified` is tracked as separate
    // state specifically so a reader (App.tsx's routing included) can react
    // to it without depending on object-identity tricks.
    const verified = auth.currentUser.emailVerified;
    setEmailVerified(verified);
    return verified;
  }

  // Registers this device (reload-safe — see ensureDeviceRegistered) and
  // then listens for this SAME device being remotely signed out, either by
  // "log out of all devices" or by being individually revoked from the
  // Trusted Devices list. See firebase/sessions.ts for why this is done
  // entirely client-side rather than with a Cloud Function.
  useEffect(() => {
    if (!authUser) return;
    let unsubscribeValidity: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const deviceId = await getDeviceId();
      await ensureDeviceRegistered(authUser.uid, deviceId);
      if (cancelled) return;
      unsubscribeValidity = subscribeToSessionValidity(authUser.uid, deviceId, () => {
        signOut(auth).catch(() => {});
      });
    })();

    return () => {
      cancelled = true;
      unsubscribeValidity?.();
    };
  }, [authUser?.uid]);

  return (
    <UserContext.Provider
      value={{
        authUser, authLoading, profile, setProfile, signUp, logIn, logOut, loadProfile,
        sendVerificationEmail, refreshEmailVerified, emailVerified,
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