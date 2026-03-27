// Auth context — exposes current user, role, branchId, and loading state throughout the app.
// Profile loading order:
//   1. Try /users/{uid}  — created at login time for all users
//   2. If missing, fall back to /staff where authUid == uid
//      and auto-create /users/{uid} from the staff document so
//      future loads succeed without touching this fallback again.
//   3. Only show an error after both attempts fail.
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  doc, onSnapshot,
  collection, query, where, getDocs, limit,
  setDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous profile listener whenever auth state changes
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(firebaseUser);
      setProfileError(null);

      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      // ── Primary: real-time listener on /users/{uid} ──────────────────────
      const userDocRef = doc(db, 'users', firebaseUser.uid);

      unsubscribeProfile = onSnapshot(
        userDocRef,
        async (snap) => {
          console.log('[AuthContext] Auth uid:', firebaseUser.uid);
          console.log('[AuthContext] /users snapshot exists:', snap.exists());

          if (snap.exists()) {
            const profile = { id: snap.id, uid: snap.id, ...snap.data() };
            console.log('[AuthContext] User profile loaded:', profile);
            setUserProfile(profile);
            setProfileError(null);
            setLoading(false);
            return;
          }

          // ── /users doc missing — try /staff fallback ─────────────────────
          console.warn('[AuthContext] /users/{uid} not found for', firebaseUser.uid,
            '— falling back to /staff lookup');

          try {
            const staffSnap = await getDocs(
              query(
                collection(db, 'staff'),
                where('authUid', '==', firebaseUser.uid),
                limit(1),
              )
            );

            console.log('[AuthContext] /staff fallback query result count:', staffSnap.size);

            if (!staffSnap.empty) {
              const staffDoc  = staffSnap.docs[0];
              const staffData = staffDoc.data();

              console.log('[AuthContext] Found matching staff doc:', staffDoc.id, staffData);

              // Build a minimal /users profile from the staff document
              const newProfile = {
                name:      staffData.name     ?? '—',
                email:     firebaseUser.email ?? '',
                role:      staffData.role     ?? 'staff',
                branchId:  staffData.branchId ?? null,
                staffId:   staffDoc.id,
                staffCode: staffData.staffCode ?? null,
                createdAt: serverTimestamp(),
              };

              // Persist it so subsequent loads use the fast primary path
              await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
              console.log('[AuthContext] Created /users/{uid} from staff document');

              // onSnapshot will fire again with the new doc — no need to setUserProfile manually
            } else {
              // Truly no profile found anywhere
              console.error(
                '[AuthContext] No profile found in /users or /staff for uid:', firebaseUser.uid,
                '\nError if any: none (document simply does not exist)',
                '\nUser profile from Firestore:', null,
              );
              setProfileError('no_profile');
              setUserProfile(null);
              setLoading(false);
            }
          } catch (err) {
            console.error('[AuthContext] Error during /staff fallback lookup:', err);
            console.error('[AuthContext] Auth uid:', firebaseUser.uid);
            console.error('[AuthContext] User profile from Firestore:', null);
            console.error('[AuthContext] Error if any:', err);
            setProfileError(err.code ?? 'unknown');
            setUserProfile(null);
            setLoading(false);
          }
        },
        (err) => {
          // onSnapshot error — almost always permission-denied
          console.error('[AuthContext] onSnapshot error reading /users/{uid}:', err);
          console.error('[AuthContext] Auth uid:', firebaseUser.uid);
          console.error('[AuthContext] User profile from Firestore:', null);
          console.error('[AuthContext] Error if any:', err);
          setProfileError(err.code ?? 'snapshot_error');
          setUserProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  const value = {
    user,
    userProfile,
    profileError,
    role:     userProfile?.role     ?? null,
    branchId: userProfile?.branchId ?? null,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
