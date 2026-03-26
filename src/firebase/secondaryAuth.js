// Helper that runs Firebase Auth operations (create user, sign in, update password)
// inside a short-lived secondary Firebase app instance so the primary app's
// currently signed-in user is never disturbed.
//
// Usage:
//   const uid = await withSecondaryAuth(async (tempAuth) => {
//     const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
//     return cred.user.uid;
//   });
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './config';

let counter = 0;

export async function withSecondaryAuth(callback) {
  // Unique name prevents "already exists" errors if called concurrently
  const appName = `secondary-${Date.now()}-${++counter}`;
  const tempApp = initializeApp(firebaseConfig, appName);
  const tempAuth = getAuth(tempApp);
  try {
    return await callback(tempAuth);
  } finally {
    // Always clean up the temporary app regardless of success or failure
    try { await deleteApp(tempApp); } catch { /* ignore cleanup errors */ }
  }
}
