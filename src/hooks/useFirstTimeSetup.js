// Runs once on app startup: checks if any users exist in Firestore.
// If none, creates the default owner account in Firebase Auth + Firestore,
// then signs out so the login page is ready to use.
//
// NOTE: The default password below is an initial credential. Change it
// via Firebase Console → Authentication after first login.
import { useEffect, useState } from 'react';
import {
  collection, getDocs, query, limit, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../firebase/config';

const DEFAULT_EMAIL    = 'jayanthpasala10@gmail.com';
const DEFAULT_PASSWORD = 'jayanth@12345';
const DEFAULT_NAME     = 'Admin Owner';

export function useFirstTimeSetup() {
  // Start as true so the login form is hidden until the check completes
  const [settingUp, setSettingUp] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Check whether any user profiles exist (1-document read)
        const snap = await getDocs(query(collection(db, 'users'), limit(1)));

        if (!snap.empty) {
          // Users already exist — nothing to do
          return;
        }

        // No users found — create the default owner account
        const credential = await createUserWithEmailAndPassword(
          auth,
          DEFAULT_EMAIL,
          DEFAULT_PASSWORD
        );

        // Write the Firestore profile document
        await setDoc(doc(db, 'users', credential.user.uid), {
          name:      DEFAULT_NAME,
          email:     DEFAULT_EMAIL,
          role:      'owner',
          branchId:  '',
          createdAt: serverTimestamp(),
        });

        // Sign out so the user lands on the login page normally.
        // createUserWithEmailAndPassword auto signs in — we undo that here.
        await signOut(auth);
      } catch (err) {
        // If the Auth account already exists but the Firestore doc is missing,
        // auth/email-already-in-use is expected — just continue to login.
        if (err.code !== 'auth/email-already-in-use') {
          console.error('[FirstTimeSetup] unexpected error:', err);
        }
      } finally {
        if (!cancelled) setSettingUp(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []); // runs exactly once on mount

  return settingUp;
}
