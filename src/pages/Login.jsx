// Login page — modern split layout
//
// Desktop: left brand panel (orange gradient) + right form panel (white/dark)
// Mobile:  compact orange header at top, form below (single column)
//
// Security rules:
//   • Login ONLY happens on explicit user interaction (button tap / form submit)
//   • No render-time redirects — navigate() is only inside event handlers
//   • localStorage is cleared on logout; activeSessionUid locks cross-user sessions
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, limit,
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useFirstTimeSetup } from '../hooks/useFirstTimeSetup';
import toast from 'react-hot-toast';

export function staffAuthEmail(staffCode) {
  return `${staffCode.toLowerCase()}@staff.restaurant.app`;
}

const QUICK_LOGIN_KEY    = 'staffQuickLogin';
const ACTIVE_SESSION_UID = 'activeSessionUid';

function dashboardForRole(role) {
  if (role === 'owner') return '/owner/dashboard';
  if (role === 'manager' || role === 'trustedManager') return '/manager/dashboard';
  return '/staff/home';
}

// ── WebAuthn ─────────────────────────────────────────────────────────────────

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

async function platformAuthAvailable() {
  if (typeof window === 'undefined') return false;
  if (typeof window.PublicKeyCredential === 'undefined') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

async function registerBiometric(staffName, staffEmail) {
  console.log('[WebAuthn] WebAuthn available:', !!window.PublicKeyCredential);
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  console.log('[WebAuthn] Platform authenticator available:', available);
  if (!available) throw new DOMException('No platform authenticator', 'NotSupportedError');

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userId = new TextEncoder().encode(staffEmail);
  const rpId   = window.location.hostname;
  console.log('[WebAuthn] Using rpId:', rpId);
  console.log('[WebAuthn] Starting credential creation...');

  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Restaurant Staff Manager', id: rpId },
        user: { id: userId, name: staffEmail, displayName: staffName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7   },
          { type: 'public-key', alg: -257  },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
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
      challenge, rpId,
      allowCredentials: [{ type: 'public-key', id: base64urlDecode(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!credential;
}

// ── Brand logo SVG (fork + checkmark) ────────────────────────────────────────
function BrandLogo({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Fork tines */}
      <line x1="14" y1="7"  x2="14" y2="19" stroke="white" strokeWidth="3"   strokeLinecap="round" />
      <line x1="10" y1="7"  x2="10" y2="15" stroke="white" strokeWidth="3"   strokeLinecap="round" />
      <line x1="18" y1="7"  x2="18" y2="15" stroke="white" strokeWidth="3"   strokeLinecap="round" />
      {/* Fork curve */}
      <path d="M10 15 Q14 19 18 15" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Fork handle */}
      <line x1="14" y1="19" x2="14" y2="47" stroke="white" strokeWidth="3"   strokeLinecap="round" />
      {/* Checkmark */}
      <path d="M26 32 l6 6 L46 20" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ── Install Banner ────────────────────────────────────────────────────────────
function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIos,  setShowIos]              = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIos && !isStandalone) setShowIos(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || (!deferredPrompt && !showIos)) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setDismissed(true);
  };

  return (
    <div
      className="flex items-center gap-3 text-white text-sm px-4 py-3 rounded-xl mb-5"
      style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
    >
      <span className="text-lg shrink-0">📲</span>
      <span className="flex-1">
        {showIos
          ? <>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></>
          : <>Install <strong>RestaurantOS</strong> for quick access</>
        }
      </span>
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#EA580C' }}
        >
          Install
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="text-xl leading-none opacity-70 hover:opacity-100 shrink-0">×</button>
    </div>
  );
}

// ── Biometric Setup Modal ─────────────────────────────────────────────────────
function BiometricSetupModal({ staffName, staffEmail, staffCode, role, onDone }) {
  const [state, setState] = useState('checking');

  useEffect(() => {
    platformAuthAvailable().then((ok) => {
      console.log('[WebAuthn] BiometricSetupModal — available:', ok);
      if (!ok) { onDone(); return; }
      setState('prompt');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnroll = async () => {
    setState('enrolling');
    try {
      const credentialId = await registerBiometric(staffName, staffEmail);
      localStorage.setItem(QUICK_LOGIN_KEY, JSON.stringify({ name: staffName, role, email: staffEmail, code: staffCode, credentialId }));
      setState('done');
    } catch (err) {
      console.log('[WebAuthn] Enrolment failed:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'NotSupportedError') { onDone(); return; }
      setState('error');
    }
  };

  if (state === 'checking') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        {state === 'prompt' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">🔐</div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Enable Fingerprint Login</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>Log in instantly next time with your fingerprint.</p>
            </div>
            <button onClick={handleEnroll} className="w-full py-3 text-white font-semibold rounded-xl" style={{ background: 'var(--color-primary)' }}>
              Set Up Fingerprint
            </button>
            <button onClick={onDone} className="w-full py-2.5 text-sm" style={{ color: 'var(--text-sub)' }}>Maybe later</button>
          </>
        )}
        {state === 'enrolling' && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: 'var(--color-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-sub)' }}>Follow your device prompt…</p>
          </div>
        )}
        {state === 'done' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Fingerprint Enabled</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>You can now log in with a tap.</p>
            </div>
            <button onClick={onDone} className="w-full py-3 text-white font-semibold rounded-xl" style={{ background: 'var(--color-primary)' }}>Continue</button>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Setup Failed</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>You can still log in with your staff code.</p>
            </div>
            <button onClick={onDone} className="w-full py-3 font-semibold rounded-xl" style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)' }}>Continue with Code</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Quick Login Card ──────────────────────────────────────────────────────────
function QuickLoginCard() {
  const navigate = useNavigate();
  const [tapping, setTapping]               = useState(false);
  const [error, setError]                   = useState('');
  const [authAvailable, setAuthAvailable]   = useState(null);

  const stored = (() => { try { return JSON.parse(localStorage.getItem(QUICK_LOGIN_KEY)); } catch { return null; } })();

  useEffect(() => {
    if (!stored?.credentialId) return;
    platformAuthAvailable().then((ok) => { console.log('[QuickLogin] Platform auth available:', ok); setAuthAvailable(ok); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stored?.credentialId || authAvailable === null) return null;

  const handleTap = async () => {
    setError(''); setTapping(true);
    try {
      const ok = await verifyBiometric(stored.credentialId);
      if (!ok) throw new Error('Biometric verification returned false');
      await signInWithEmailAndPassword(auth, stored.email, stored.code);
      navigate(dashboardForRole(stored.role), { replace: true });
    } catch (err) {
      console.log('[QuickLogin] Failed:', err.name, err.message);
      setError('Fingerprint not recognised. Use your staff code below.');
      setTapping(false);
    }
  };

  return (
    <div
      className="mb-5 rounded-xl p-4 text-center space-y-3"
      style={{ backgroundColor: 'var(--color-primary-faint)', border: '1px solid var(--color-primary-light)' }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>Welcome back</p>
      <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{stored.name}</p>
      {authAvailable ? (
        <button
          onClick={handleTap}
          disabled={tapping}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-opacity"
          style={{ background: 'var(--color-primary)' }}
        >
          <span className="text-lg">👆</span>
          {tapping ? 'Verifying…' : 'Tap to Login'}
        </button>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-sub)' }}>Use your staff code below.</p>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-error)' }}>{error}</p>}
    </div>
  );
}

// ── Staff Code Form ───────────────────────────────────────────────────────────
function StaffLoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode]                   = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState('');
  const [showBiometric, setShowBiometric] = useState(false);
  const biometricPayload = useRef(null);

  // QR: pre-fill only — no auto-submit
  useEffect(() => {
    const qrCode = searchParams.get('code');
    if (qrCode) setCode(qrCode.trim().toUpperCase());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const entered = code.trim().toUpperCase();
    console.log('Step 1 - Code:', entered);
    if (!entered) { setError('Please enter your staff code.'); return; }
    setSubmitting(true);

    let staffDoc, staffData;
    try {
      const snap = await getDocs(query(collection(db, 'staff'), where('staffCode', '==', entered), limit(1)));
      console.log('Step 2 - Docs found:', snap.size);
      if (snap.empty) { setError('Invalid code. Please check and try again.'); setSubmitting(false); return; }
      staffDoc = snap.docs[0];
      staffData = staffDoc.data();
    } catch (err) {
      console.log('Firestore error:', err.code, err.message);
      setError(err.code === 'permission-denied'
        ? 'System configuration issue. Contact your manager.'
        : 'Could not reach the server. Check your connection.');
      setSubmitting(false); return;
    }

    if (!staffData.isActive) {
      setError('Your account has been deactivated. Contact your manager.');
      setSubmitting(false); return;
    }

    const email = staffAuthEmail(entered);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, entered);
      const uid  = cred.user.uid;
      console.log('Step 3 - Auth uid:', uid);

      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        await setDoc(doc(db, 'users', uid), {
          name: staffData.name, email, role: staffData.role,
          branchId: staffData.branchId, staffId: staffDoc.id, createdAt: serverTimestamp(),
        });
      }

      localStorage.setItem(ACTIVE_SESSION_UID, uid);

      const existing = (() => { try { return JSON.parse(localStorage.getItem(QUICK_LOGIN_KEY)); } catch { return null; } })();
      const webAuthnOk = await platformAuthAvailable();

      if (webAuthnOk && !existing?.credentialId) {
        biometricPayload.current = { name: staffData.name, email, code: entered, role: staffData.role };
        setShowBiometric(true);
        setSubmitting(false);
        return;
      }

      if (existing) {
        localStorage.removeItem(QUICK_LOGIN_KEY);
        localStorage.setItem(QUICK_LOGIN_KEY, JSON.stringify({ ...existing, code: entered, email, name: staffData.name, role: staffData.role }));
      }

      navigate(dashboardForRole(staffData.role), { replace: true });
    } catch (err) {
      console.log('Auth error:', err.code, err.message);
      setError(
        err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential'
          ? 'Login account not found. Ask your manager to reset your code.'
          : err.code === 'auth/wrong-password'
          ? 'Code mismatch. Ask your manager to reset your code.'
          : 'Login failed. Please try again.'
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="STF-XXXX"
            maxLength={8}
            className="w-full text-center font-mono font-bold text-xl uppercase tracking-widest transition-all"
            style={{
              height: '52px',
              borderRadius: '8px',
              border: error ? '1.5px solid var(--color-error)' : '1.5px solid var(--border2)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              padding: '0 16px',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15)'; }}
            onBlur={e => { e.target.style.borderColor = error ? 'var(--color-error)' : 'var(--border2)'; e.target.style.boxShadow = 'none'; }}
          />
          {error && (
            <p className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full text-white font-semibold text-sm transition-opacity disabled:opacity-60"
          style={{ height: '52px', borderRadius: '8px', background: submitting ? 'var(--color-primary-dark)' : 'var(--color-primary)' }}
        >
          {submitting ? 'Checking…' : 'Login'}
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
            navigate(dashboardForRole(biometricPayload.current?.role), { replace: true });
          }}
        />
      )}
    </>
  );
}

// ── Admin / Owner Form ────────────────────────────────────────────────────────
function AdminLoginForm() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]         = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {
    height: '52px',
    borderRadius: '8px',
    border: '1.5px solid var(--border2)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    padding: '0 16px',
    width: '100%',
    outline: 'none',
    fontSize: '14px',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cred     = await login(form.email.trim(), form.password);
      const uid      = cred.user.uid;
      localStorage.setItem(ACTIVE_SESSION_UID, uid);
      const snap     = await getDoc(doc(db, 'users', uid));
      const role     = snap.data()?.role ?? 'staff';
      navigate(dashboardForRole(role), { replace: true });
    } catch (err) {
      toast.error(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Invalid email or password.'
          : err.code === 'auth/user-not-found'
          ? 'No account found with this email.'
          : 'Login failed. Please try again.'
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>
          Email address
        </label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="you@restaurant.com"
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border2)'; e.target.style.boxShadow = 'none'; }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>
          Password
        </label>
        <input
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="••••••••"
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border2)'; e.target.style.boxShadow = 'none'; }}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full text-white font-semibold text-sm transition-opacity disabled:opacity-60"
        style={{ height: '52px', borderRadius: '8px', background: 'var(--color-primary)' }}
      >
        {submitting ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}

// ── Root Login page ───────────────────────────────────────────────────────────
export default function Login() {
  const settingUp = useFirstTimeSetup();
  const [tab, setTab] = useState('staff');

  if (settingUp) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)' }}>
        <div className="text-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrandLogo size={40} />
          </div>
          <h1 className="text-2xl font-bold mb-3">RestaurantOS</h1>
          <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60" />
            Setting up…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Left / Top: Brand panel ──────────────────────────────────────── */}
      <div
        className="flex flex-col items-center justify-center px-8 py-12 md:w-[45%] md:min-h-screen"
        style={{ background: 'linear-gradient(145deg, #F97316 0%, #EA580C 55%, #C2410C 100%)' }}
      >
        {/* Install banner — only on the brand panel (mobile top area) */}
        <div className="w-full max-w-xs md:max-w-sm">
          <InstallBanner />
        </div>

        {/* Logo icon */}
        <div
          className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
        >
          <BrandLogo size={48} />
        </div>

        {/* App name */}
        <h1 className="text-white font-bold text-3xl md:text-4xl tracking-tight mb-3 text-center">
          RestaurantOS
        </h1>

        {/* Tagline */}
        <p className="text-white/75 text-base md:text-lg text-center leading-relaxed max-w-xs">
          Smart task management<br className="hidden md:block" /> for your team
        </p>

        {/* Feature dots — desktop only */}
        <div className="hidden md:flex flex-col gap-3 mt-10 w-full max-w-xs">
          {[
            ['✓', 'Real-time task tracking'],
            ['✓', 'Staff check-in & shifts'],
            ['✓', 'Photo verification'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3 text-white/80 text-sm">
              <span className="text-white font-bold">{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right / Bottom: Form panel ───────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-10 md:px-12"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="w-full max-w-sm">

          {/* Tabs */}
          <div
            className="flex mb-8 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            {[['staff', 'Staff Login'], ['admin', 'Admin Login']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-all"
                style={tab === key
                  ? { backgroundColor: 'var(--surface)', color: 'var(--color-primary)', boxShadow: 'var(--shadow)', fontWeight: 600 }
                  : { backgroundColor: 'transparent', color: 'var(--text-sub)' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'staff' ? (
            <div>
              <QuickLoginCard />
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Welcome back</h2>
                <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
                  Enter your staff code to continue
                </p>
              </div>
              <StaffLoginForm />
              <p className="text-xs text-center mt-5" style={{ color: 'var(--text-faint)' }}>
                Lost your code? Ask your manager or owner.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Admin Login</h2>
                <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
                  Sign in with your owner or manager account
                </p>
              </div>
              <AdminLoginForm />
              <p className="text-xs text-center mt-5" style={{ color: 'var(--text-faint)' }}>
                Contact your administrator for access.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
