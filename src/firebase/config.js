// Firebase v9 modular SDK configuration
import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Primary app — the owner's session lives here
const app = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// Startup diagnostic — visible in DevTools console on every page load.
// Helps confirm the Storage bucket is wired up correctly.
console.log('[Firebase] Initialized. Storage bucket:', firebaseConfig.storageBucket ?? '⚠️ MISSING — check VITE_FIREBASE_STORAGE_BUCKET');

// Secondary app — used to create / update staff Firebase Auth accounts
// without disturbing the owner's primary session.
// Always call signOut(secondaryAuth) after each operation.
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
export const secondaryAuth = getAuth(secondaryApp);

// Persist the primary session across page refreshes
setPersistence(auth, browserLocalPersistence);

export default app;
