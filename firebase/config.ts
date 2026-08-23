import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Not secrets — see the mentor chat for why it's safe for these values to be public.
// Real protection lives in Firestore's security rules, not in hiding this file.
const firebaseConfig = {
  apiKey: 'AIzaSyBy2EWpZEjcxB9UezpYMumAY1vvfxDo-os',
  authDomain: 'upshift-3ec69.firebaseapp.com',
  projectId: 'upshift-3ec69',
  storageBucket: 'upshift-3ec69.firebasestorage.app',
  messagingSenderId: '133200431249',
  appId: '1:133200431249:web:2b4b4815eea9bc62ec9730',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Deliberately plain getFirestore(), NOT initializeFirestore(app, {
// localCache: persistentLocalCache(...) }) — that looks like the right call
// for "offline support" and IS the right call on web, but it does not work
// on React Native today. persistentLocalCache needs IndexedDB, which RN
// doesn't have; asking for it here doesn't error loudly, it fails silently
// and falls back to an in-memory-only cache, logging a warning that's easy
// to miss ("This platform is either missing IndexedDB..."). That's worse
// than not asking for it at all, because the code would visually claim
// offline persistence it doesn't actually provide. This is a real,
// currently-open gap in the Firebase JS SDK, not a config mistake — see
// https://github.com/firebase/firebase-js-sdk/issues/7947.
//
// What the app gets for free either way, with no config needed: a write
// made while offline during the CURRENT app session still queues in memory
// and replays automatically once the connection returns — that part of
// Firestore's offline behavior isn't RN-specific and needs nothing here.
// What it does NOT get is persistence across an app restart/kill while
// offline — the thing "offline support" usually implies, and the thing
// this comment exists to be honest about. The real fix is switching to the
// react-native-firebase library (a different package with native offline
// persistence), which is a bigger migration than a config change — see the
// roadmap doc for the tradeoff.
export const db = getFirestore(app);

// No `storage` export: Firebase Storage now requires the paid Blaze plan even
// for a few kilobytes, so profile photos go to Cloudinary instead. See
// services/cloudinary.ts. Auth and Firestore both still work fine on the
// no-cost Spark plan.
