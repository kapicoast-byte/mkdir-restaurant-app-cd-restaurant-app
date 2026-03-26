// Auth context — exposes current user, role, branchId, and loading state throughout the app
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null); // Firestore /users/{uid}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for Firebase Auth state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      // Listen for real-time Firestore user profile updates
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const unsubscribeProfile = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) {
          setUserProfile({ id: snap.id, ...snap.data() });
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      });

      return unsubscribeProfile;
    });

    return unsubscribeAuth;
  }, []);

  // Sign in with email + password
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  // Sign out
  const logout = () => signOut(auth);

  const value = {
    user,
    userProfile,
    role: userProfile?.role ?? null,
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
