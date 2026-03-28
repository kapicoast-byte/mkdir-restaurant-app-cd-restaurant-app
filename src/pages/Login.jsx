// Login page with two tabs:
//   "Staff Login"  (default) — single STF-XXXX code field
//   "Owner / Admin" — email + password
//
// Extra features:
//   • InstallBanner   — beforeinstallprompt (Android/Chrome) + iOS guidance
//   • QuickLoginCard  — biometric "Welcome back" card from localStorage
//   • QR auto-login   — ?code=STF-XXXX param auto-fills and submits
//   • BiometricSetup  — after first login, offers fingerprint enrolment
//
// Staff code flow:
//   1. Query /staff where staffCode == entered code
//   2. Validate isActive
//   3. Sign into Firebase Auth using the stable staff email + code-as-password
//   4. AuthContext loads /users/{uid} and redirects based on role
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

// ── localStorage key ────────────────────────────────────────────────────────
const QUICK_LOGIN_KEY = 'staffQuickLogin';

// ── WebAuthn helpers ────────────────────────────────────────────────────────

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Returns true if platform biometrics are available on this device
async function platformAuthAvailable() {
  if (typeof window === 'undefined') return false;
  if (typeof window.PublicKeyCredential === 'undefined') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function registerBiometric(staffName, staffEmail) {
  console.log('[WebAuthn] WebAuthn available:', !!window.PublicKeyCredential);

  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  console.log('[WebAuthn] Platform authenticator available:', available);

  if (!available) throw new DOMException('No platform authenticator', 'NotSupportedError');

  // challenge must be a Uint8Array
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // user.id must be a Uint8Array — use the email as a stable, unique identifier
  const userId = new TextEncoder().encode(staffEmail);

  // rpId must exactly match window.location.hostname (critical for Android / traefik.me)
  const rpId = window.location.hostname;
  console.log('[WebAuthn] Using rpId:', rpId);
  console.log('[WebAuthn] Starting credential creation...');

  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Restaurant Staff Manager',
          id:   rpId,
        },
        user: {
          id:          userId,
          name:        staffEmail,
          displayName: staffName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7   }, // ES256
          { type: 'public-key', alg: -257  }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification:        'required',
          residentKey:             'preferred',
        },
        timeout: 60000,
      },
    });
  } catch (error) {
    console.log('[WebAuthn] WebAuthn error:', error.name, error.message);
    throw error;
  }

  console.log('[WebAuthn] Credential created:', credential?.id);
  return base64urlEncode(credential.rawId);
}

async function verifyBiometric(credentialId) {
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const rpId = window.location.hostname;
  console.log('[WebAuthn] Verify — rpId:', rpId);

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [{ type: 'public-key', id: base64urlDecode(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!credential;
}

// ── Install Banner ───────────────────────────────────────────────────────────
function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIos, setShowIos]               = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  useEffect(() => {
    // Android / Chrome / Edge
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari — not installable via JS; show manual guidance instead
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (isIos && !isInStandaloneMode) setShowIos(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed) return null;
  if (!deferredPrompt && !showIos) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 bg-indigo-600 text-white text-sm px-4 py-3 rounded-xl mb-4 shadow">
      <span className="text-lg">📲</span>
      <div className="flex-1">
        {showIos
          ? <span>Install app: tap <strong>Share</strong> → <strong>Add to Home Screen</strong></span>
          : <span>Install <strong>RestaurantOS</strong> for quick access</span>
        }
      </div>
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="bg-white text-indigo-600 font-semibold text-xs px-3 py-1.5 rounded-lg shrink-0"
        >
          Install
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="text-indigo-200 hover:text-white text-lg leading-none shrink-0 ml-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Biometric Setup Modal ────────────────────────────────────────────────────
// Checks platform authenticator availability on mount and skips silently if
// WebAuthn is not available — staff can always use their code instead.
function BiometricSetupModal({ staffName, staffEmail, staffCode, role, onDone }) {
  // 'checking' → 'prompt' | 'unavailable' | 'enrolling' | 'done' | 'error'
  const [state, setState] = useState('checking');

  useEffect(() => {
    platformAuthAvailable().then((available) => {
      console.log('[WebAuthn] BiometricSetupModal — platform auth available:', available);
      if (!available) {
        // Skip silently — don't show an error, just call onDone immediately
        onDone();
      } else {
        setState('prompt');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnroll = async () => {
    setState('enrolling');
    try {
      const credentialId = await registerBiometric(staffName, staffEmail);
      localStorage.setItem(QUICK_LOGIN_KEY, JSON.stringify({
        name: staffName,
        role,
        email: staffEmail,
        code:  staffCode,
        credentialId,
      }));
      setState('done');
    } catch (err) {
      console.log('[WebAuthn] Enrolment failed:', err.name, err.message);
      // NotAllowedError = user cancelled; NotSupportedError = hardware missing
      // Either way, skip silently — no error shown to staff
      if (err.name === 'NotAllowedError' || err.name === 'NotSupportedError') {
        onDone();
      } else {
        setState('error');
      }
    }
  };

  // Don't render anything while checking or if skipping
  if (state === 'checking' || state === 'unavailable') return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        {state === 'prompt' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-2">🔐</div>
              <h2 className="text-lg font-bold text-gray-900">Enable Fingerprint Login</h2>
              <p className="text-sm text-gray-500 mt-1">
                Log in instantly next time with just your fingerprint — no code needed.
              </p>
            </div>
            <button
              onClick={handleEnroll}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Set Up Fingerprint
            </button>
            <button
              onClick={onDone}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Maybe later
            </button>
          </>
        )}
        {state === 'enrolling' && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
            <p className="text-sm text-gray-600">Follow your device prompt…</p>
          </div>
        )}
        {state === 'done' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <h2 className="text-lg font-bold text-gray-900">Fingerprint Enabled</h2>
              <p className="text-sm text-gray-500 mt-1">You can now log in with a tap.</p>
            </div>
            <button
              onClick={onDone}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-2">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900">Setup Failed</h2>
              <p className="text-sm text-gray-500 mt-1">Fingerprint setup failed. You can still log in with your staff code.</p>
            </div>
            <button
              onClick={onDone}
              className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Continue with Code
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Quick Login Card (biometric returning-user) ─────────────────────────────
function QuickLoginCard() {
  const navigate   = useNavigate();
  const { userProfile, loading } = useAuth();
  const [tapping, setTapping]           = useState(false);
  const [error, setError]               = useState('');
  const [authAvailable, setAuthAvailable] = useState(null); // null = checking

  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(QUICK_LOGIN_KEY)); }
    catch { return null; }
  })();

  // Check platform authenticator availability once on mount
  useEffect(() => {
    if (!stored?.credentialId) return;
    platformAuthAvailable().then((ok) => {
      console.log('[QuickLogin] Platform authenticator available:', ok);
      setAuthAvailable(ok);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect once profile loads after sign-in
  if (!loading && userProfile) {
    const role = userProfile.role;
    if (role === 'owner') {
      navigate('/owner/dashboard', { replace: true });
    } else if (role === 'manager' || role === 'trustedManager') {
      navigate('/manager/dashboard', { replace: true });
    } else {
      navigate('/staff/home', { replace: true });
    }
  }

  // No stored credential → nothing to show
  if (!stored?.credentialId) return null;
  // Still checking availability → don't flash anything
  if (authAvailable === null) return null;

  const handleTap = async () => {
    setError('');
    setTapping(true);
    try {
      const ok = await verifyBiometric(stored.credentialId);
      if (!ok) throw new Error('Biometric verification returned false');
      await signInWithEmailAndPassword(auth, stored.email, stored.code);
      // AuthContext will detect the sign-in and redirect
    } catch (err) {
      console.log('[QuickLogin] Biometric failed:', err.name, err.message);
      setError('Fingerprint not recognised. Use your staff code below.');
      setTapping(false);
    }
  };

  return (
    <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center space-y-3">
      <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Welcome back</p>
      <p className="text-lg font-bold text-gray-900">{stored.name}</p>

      {authAvailable ? (
        <button
          onClick={handleTap}
          disabled={tapping}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <span className="text-xl">👆</span>
          {tapping ? 'Verifying…' : 'Tap to Login'}
        </button>
      ) : (
        <p className="text-xs text-indigo-400">Use your staff code below to sign in.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Staff code login form ────────────────────────────────────────────────────
function StaffLoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile, loading } = useAuth();
  const [code, setCode]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [showBiometric, setShowBiometric] = useState(false);
  const biometricPayload = useRef(null); // holds data after successful login
  const autoSubmitted    = useRef(false);

  // QR auto-login: read ?code= param on mount
  useEffect(() => {
    const qrCode = searchParams.get('code');
    if (qrCode && !autoSubmitted.current) {
      const upper = qrCode.trim().toUpperCase();
      setCode(upper);
      autoSubmitted.current = true;
      // Trigger submit after state settles
      setTimeout(() => {
        document.getElementById('staff-login-form')?.requestSubmit();
      }, 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect once the profile is ready after a successful sign-in
  if (!loading && userProfile && !showBiometric) {
    const role = userProfile.role;
    if (role === 'owner') {
      navigate('/owner/dashboard', { replace: true });
    } else if (role === 'manager' || role === 'trustedManager') {
      navigate('/manager/dashboard', { replace: true });
    } else {
      navigate('/staff/home', { replace: true });
    }
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
        console.error('[StaffLogin] FIX NEEDED: Firestore rules block unauthenticated reads on /staff.');
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
    const email = staffAuthEmail(entered);
    console.log('Step 9 - Attempting Firebase auth sign in with email:', email);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, entered);
      console.log('Step 10 - Auth success, uid:', cred.user.uid);

      // ── Step 4: Ensure /users/{uid} exists ─────────────────────────────────
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

      // ── Step 5: Offer biometric enrolment if not already stored ───────────
      const existingQuickLogin = (() => {
        try { return JSON.parse(localStorage.getItem(QUICK_LOGIN_KEY)); }
        catch { return null; }
      })();

      const webAuthnAvailable = await platformAuthAvailable();

      if (webAuthnAvailable && !existingQuickLogin?.credentialId) {
        // Store payload for use inside the modal
        biometricPayload.current = {
          name:  staffData.name,
          email,
          code:  entered,
          role:  staffData.role,
        };
        setShowBiometric(true);
        setSubmitting(false);
        return; // don't redirect yet — modal handles it
      }

      // If already enrolled or WebAuthn unavailable, just update stored code
      if (existingQuickLogin) {
        localStorage.setItem(QUICK_LOGIN_KEY, JSON.stringify({
          ...existingQuickLogin,
          code:  entered,
          email,
          name:  staffData.name,
          role:  staffData.role,
        }));
      }

      // AuthContext onAuthStateChanged picks up the new session → redirect fires above

    } catch (authErr) {
      console.log('ERROR caught:', authErr.code, authErr.message);
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        console.error('[StaffLogin] Firebase Auth account not found. Expected email:', email);
        setError('Login account not found. Please ask your manager to reset your staff code.');
      } else if (authErr.code === 'auth/wrong-password') {
        console.error('[StaffLogin] Password mismatch — stored code and Auth password are out of sync.');
        setError('Code mismatch. Please ask your manager to reset your staff code.');
      } else {
        setError('Login failed. Please try again or contact your manager.');
      }
      setSubmitting(false);
    }
  };

  return (
    <>
      <form id="staff-login-form" onSubmit={handleSubmit} className="space-y-5">
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

      {showBiometric && biometricPayload.current && (
        <BiometricSetupModal
          staffName={biometricPayload.current.name}
          staffEmail={biometricPayload.current.email}
          staffCode={biometricPayload.current.code}
          role={biometricPayload.current.role}
          onDone={() => {
            setShowBiometric(false);
            // Now let the redirect fire via userProfile being set
          }}
        />
      )}
    </>
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
    if (role === 'owner') {
      navigate('/owner/dashboard', { replace: true });
    } else if (role === 'manager' || role === 'trustedManager') {
      navigate('/manager/dashboard', { replace: true });
    } else {
      // staff / kitchen / floor / cleaning
      navigate('/staff/home', { replace: true });
    }
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
        {/* Install banner — shown above the card */}
        <InstallBanner />

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
                {/* Biometric quick-login card — only shown if credential exists */}
                <QuickLoginCard />
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
