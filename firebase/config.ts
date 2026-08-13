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
export const db = getFirestore(app);
