// Login page with two tabs:
//   "Staff Login"  (default) — single STF-XXXX code field
//   "Owner / Admin" — email + password
//
// Staff code flow:
//   1. Query /staff where staffCode == entered code
//   2. Validate isActive (codes never expire — only reset or deactivation stops access)
//   3. Sign into Firebase Auth using the stable staff email + code-as-password
//   4. AuthContext loads /users/{uid} and redirects based on role
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, limit, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useFirstTimeSetup } from '../hooks/useFirstTimeSetup';
import toast from 'react-hot-toast';

// Derives the stable Firebase Auth email for a staff member from their STF-XXXX code
export function staffAuthEmail(staffCode) {
  return `${staffCode.toLowerCase()}@staff.restaurant.app`;
}

// ── Staff code login form ────────────────────────────────────────────────────
function StaffLoginForm() {
  const navigate = useNavigate();
  const { userProfile, loading } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Redirect once the profile is ready after a successful sign-in
  if (!loading && userProfile) {
    const role = userProfile.role;
    if (role === 'owner') navigate('/owner/dashboard', { replace: true });
    else if (role === 'manager' || role === 'trustedManager') navigate('/manager/dashboard', { replace: true });
    else navigate('/staff/home', { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    console.log('Step 1 - Code entered:', code);

    const entered = code.trim().toUpperCase();

    console.log('Step 2 - Code after trim/uppercase:', entered);

    if (!entered) { setError('Please enter your staff code.'); return; }

    setSubmitting(true);

    // ── Step 1: Firestore lookup ─────────────────────────────────────────────
    // This query runs BEFORE the user is authenticated. Firestore security rules
    // must allow unauthenticated list on /staff for this to work.
    // Rule to add in Firebase Console if you see permission-denied errors:
    //   match /staff/{staffId} { allow list: if true; ... }
    let staffDoc, staffData;
    try {
      console.log('Step 3 - Querying Firestore /staff where staffCode ==', entered);
      const snap = await getDocs(
        query(collection(db, 'staff'), where('staffCode', '==', entered), limit(1))
      );
      console.log('Step 4 - Documents found:', snap.size);

      if (snap.empty) {
        console.log('Step 5 - No matching staff document found');
        setError('Invalid code. Please check and try again.');
        setSubmitting(false);
        return;
      }

      staffDoc  = snap.docs[0];
      staffData = staffDoc.data();
      console.log('Step 6 - Staff doc data:', staffData);
      console.log('Step 7 - isActive:', staffData.isActive);
      console.log('Step 8 - authUid:', staffData.authUid);

    } catch (queryErr) {
      console.log('ERROR caught:', queryErr.code, queryErr.message);
      if (queryErr.code === 'permission-denied') {
        console.error('[StaffLogin] Auth uid: (not yet signed in — this query runs before auth)');
        console.error('[StaffLogin] User profile from Firestore: null');
        console.error('[StaffLogin] Error if any:', queryErr);
        console.error('[StaffLogin] FIX NEEDED: Firestore rules block unauthenticated reads on /staff.');
        console.error('[StaffLogin] In Firebase Console → Firestore Rules, add to the /staff match block:');
        console.error('[StaffLogin]   allow list: if true;');
        setError('System configuration issue. Please contact your manager.');
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
      setSubmitting(false);
      return;
    }

    // ── Step 2: Validate the staff record ────────────────────────────────────
    if (!staffData.isActive) {
      console.log('ERROR caught: account-deactivated Your account has been deactivated.');
      setError('Your account has been deactivated. Please contact your manager.');
      setSubmitting(false);
      return;
    }

    // ── Step 3: Firebase Auth sign-in ────────────────────────────────────────
    // Email: staffCode.toLowerCase()@staff.restaurant.app
    // Password: the STF-XXXX code itself
    const email = staffAuthEmail(entered);
    console.log('Step 9 - Attempting Firebase auth sign in with email:', email);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, entered);
      console.log('Step 10 - Auth success, uid:', cred.user.uid);

      // ── Step 4: Ensure /users/{uid} exists ─────────────────────────────────
      // If it was never written (legacy record or creation race), create it now
      // so AuthContext can load the profile and redirect correctly.
      const uid      = cred.user.uid;
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        console.log('Step 11 - /users doc missing, creating from staff document');
        await setDoc(doc(db, 'users', uid), {
          name:      staffData.name,
          email,
          role:      staffData.role,
          branchId:  staffData.branchId,
          staffId:   staffDoc.id,
          createdAt: serverTimestamp(),
        });
      }
      // AuthContext onAuthStateChanged picks up the new session → redirect fires above

    } catch (authErr) {
      console.log('ERROR caught:', authErr.code, authErr.message);
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        console.error('[StaffLogin] Firebase Auth account not found. Expected email:', email);
        console.error('[StaffLogin] Ask the owner to click "Reset Code" for this staff member.');
        setError('Login account not found. Please ask your manager to reset your staff code.');
      } else if (authErr.code === 'auth/wrong-password') {
        console.error('[StaffLogin] Password mismatch — stored code and Auth password are out of sync.');
        console.error('[StaffLogin] Ask the owner to click "Reset Code" to re-sync them.');
        setError('Code mismatch. Please ask your manager to reset your staff code.');
      } else {
        setError('Login failed. Please try again or contact your manager.');
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Staff Code
        </label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="STF-XXXX"
          maxLength={8}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-xl font-mono font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm"
      >
        {submitting ? 'Checking code…' : 'Sign in with Code'}
      </button>
    </form>
  );
}

// ── Owner / Admin email+password form ────────────────────────────────────────
function OwnerLoginForm() {
  const { login, userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  // Redirect once profile loads after sign-in
  if (!loading && userProfile) {
    const role = userProfile.role;
    if (role === 'owner') navigate('/owner/dashboard', { replace: true });
    else if (role === 'manager' || role === 'trustedManager') navigate('/manager/dashboard', { replace: true });
    else navigate('/staff/home', { replace: true });
  }

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password);
    } catch (err) {
      const msg =
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Invalid email or password.'
          : err.code === 'auth/user-not-found'
          ? 'No account found with this email.'
          : 'Login failed. Please try again.';
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
        <input
          type="email"
          name="email"
          required
          value={form.email}
          onChange={handleChange}
          placeholder="you@restaurant.com"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
        <input
          type="password"
          name="password"
          required
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

// ── Root Login page ──────────────────────────────────────────────────────────
export default function Login() {
  const settingUp = useFirstTimeSetup();
  // Staff tab is the default view
  const [tab, setTab] = useState('staff');

  // ── "Setting up…" screen — blocks both tabs during first-time setup ────────
  if (settingUp) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-6">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">RestaurantOS</h1>
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400" />
            Setting up…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-3xl font-bold text-white">RestaurantOS</h1>
          <p className="text-gray-400 mt-1 text-sm">Staff Task Management Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setTab('staff')}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                tab === 'staff'
                  ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                  : 'bg-gray-50 text-gray-500 hover:text-gray-700'
              }`}
            >
              Staff Login
            </button>
            <button
              onClick={() => setTab('owner')}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                tab === 'owner'
                  ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                  : 'bg-gray-50 text-gray-500 hover:text-gray-700'
              }`}
            >
              Owner / Admin
            </button>
          </div>

          {/* Form area */}
          <div className="p-8">
            {tab === 'staff' ? (
              <>
                <p className="text-sm text-gray-500 mb-6 text-center">
                  Enter the STF-XXXX code provided by your manager.
                </p>
                <StaffLoginForm />
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  Sign in to your account
                </h2>
                <OwnerLoginForm />
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          {tab === 'staff'
            ? 'Lost your code? Contact your manager or owner.'
            : 'Contact your administrator for account access.'}
        </p>
      </div>
    </div>
  );
}
