// Staff Settings — profile card, language selector, theme toggle, log out.
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';
import { LANGUAGES } from '../../i18n/translations';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Friendly role labels ──────────────────────────────────────────────────────
const ROLE_LABELS = {
  kitchen:  'Kitchen Staff',
  floor:    'Floor Staff',
  cleaning: 'Cleaning Staff',
  manager:  'Manager',
  staff:    'Staff',
};

function friendlyRole(role) {
  return ROLE_LABELS[role?.toLowerCase()] ?? role ?? '—';
}

// ── Logout Confirm Modal ──────────────────────────────────────────────────────
function LogoutModal({ th, t, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${th.cardBg} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">👋</div>
          <h3 className={`font-bold text-lg ${th.text}`}>{t('confirmLogoutTitle')}</h3>
          <p className={`text-sm mt-1 ${th.textSub}`}>{t('confirmLogoutMsg')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium ${th.border} ${th.text}`}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StaffSettings() {
  const { t, lang, isDark, toggleTheme, th } = useStaffCtx();
  const { userProfile, logout }               = useAuth();
  const navigate = useNavigate();

  const [saving,           setSaving]           = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [showLogout,       setShowLogout]       = useState(false);
  const [showRemoveDevice, setShowRemoveDevice] = useState(false);

  const hasQuickLogin = (() => {
    try { return !!JSON.parse(localStorage.getItem('staffQuickLogin'))?.credentialId; }
    catch { return false; }
  })();

  const staffId   = userProfile?.staffId   ?? null;
  const staffCode = userProfile?.staffCode ?? null;
  const branchName = userProfile?.branchName ?? userProfile?.branch ?? null;

  // ── Language change ────────────────────────────────────────────────────────
  const handleLanguageChange = async (code) => {
    if (!staffId || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'staff', staffId), { preferredLanguage: code });
      // Non-fatal mirror to /users doc
      if (userProfile?.uid) {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          preferredLanguage: code,
        }).catch(() => {});
      }
      // Toast in the newly selected language (t() will update after onSnapshot)
    } catch {
      toast.error('Could not save language preference');
    } finally {
      setSaving(false);
    }
  };

  // ── Copy staff code ────────────────────────────────────────────────────────
  const copyCode = () => {
    if (!staffCode) return;
    navigator.clipboard.writeText(staffCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    setShowLogout(false);
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Sign out failed');
    }
  };

  // ── Section helpers ────────────────────────────────────────────────────────
  const SectionTitle = ({ label }) => (
    <p className={`px-5 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider ${th.textFaint}`}>
      {label}
    </p>
  );

  return (
    <div className={`min-h-full ${th.pageBg}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`px-5 pt-10 pb-5 ${th.cardBg} border-b ${th.border}`}>
        <h1 className={`text-2xl font-bold ${th.text}`}>{t('settings')}</h1>
      </div>

      {/* ── Profile section ─────────────────────────────────────────────── */}
      <SectionTitle label={t('profile')} />
      <div className={`${th.cardBg} border-y ${th.border}`}>

        {/* Name */}
        <div className={`px-5 py-4 border-b ${th.border}`}>
          <p className={`text-xs ${th.textSub} mb-0.5`}>{t('profile')}</p>
          <p className={`text-xl font-bold ${th.text}`}>{userProfile?.name ?? '—'}</p>
        </div>

        {/* Role */}
        <div className={`px-5 py-4 flex items-center justify-between border-b ${th.border}`}>
          <p className={`text-sm ${th.textSub}`}>Role</p>
          <p className={`text-sm font-medium ${th.text}`}>{friendlyRole(userProfile?.role)}</p>
        </div>

        {/* Staff code + copy */}
        {staffCode && (
          <div className={`px-5 py-4 flex items-center justify-between border-b ${th.border}`}>
            <div>
              <p className={`text-xs ${th.textSub} mb-0.5`}>{t('staffCode')}</p>
              <p className={`text-base font-mono font-bold tracking-widest ${th.text}`}>{staffCode}</p>
            </div>
            <button
              onClick={copyCode}
              className={`ml-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                copied
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : `${th.altBg} ${th.border} ${th.textSub}`
              }`}
            >
              {copied ? t('copied') : '📋 Copy'}
            </button>
          </div>
        )}

        {/* Branch */}
        {branchName && (
          <div className={`px-5 py-4 flex items-center justify-between`}>
            <p className={`text-sm ${th.textSub}`}>{t('branch')}</p>
            <p className={`text-sm font-medium ${th.text}`}>{branchName}</p>
          </div>
        )}
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <SectionTitle label={t('appearance')} />
      <div className={`${th.cardBg} border-y ${th.border} px-5 py-4 flex items-center justify-between`}>
        <div>
          <p className={`text-sm font-medium ${th.text}`}>
            {isDark ? t('darkMode') : t('lightMode')}
          </p>
          <p className={`text-xs mt-0.5 ${th.textSub}`}>{isDark ? '🌙' : '☀️'}</p>
        </div>
        {/* Toggle switch */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${
            isDark ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              isDark ? 'translate-x-8' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* ── Language selector ─────────────────────────────────────────── */}
      <SectionTitle label={t('language')} />
      <div className={`${th.cardBg} border-y ${th.border}`}>
        <div className="grid grid-cols-3 gap-px bg-gray-200 dark:bg-gray-700">
          {LANGUAGES.map((l) => {
            const isActive = lang === l.code;
            return (
              <button
                key={l.code}
                disabled={saving}
                onClick={() => handleLanguageChange(l.code)}
                dir={l.dir}
                className={`px-3 py-4 text-center text-sm font-medium transition-colors disabled:opacity-40
                  ${isActive
                    ? 'bg-indigo-600 text-white'
                    : `${th.cardBg} ${th.text} active:opacity-70`
                  }`}
              >
                {l.nativeName}
                {isActive && <span className="block text-xs mt-0.5 opacity-80">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Device section ─────────────────────────────────────────────── */}
      {hasQuickLogin && (
        <>
          <SectionTitle label="This Device" />
          <div className={`${th.cardBg} border-y ${th.border} px-5 py-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${th.text}`}>Fingerprint Login</p>
                <p className={`text-xs mt-0.5 ${th.textSub}`}>Biometric quick-login is enabled on this device</p>
              </div>
              <button
                onClick={() => setShowRemoveDevice(true)}
                className="ml-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-red-50 active:bg-red-100 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Log Out button ─────────────────────────────────────────────── */}
      <div className="px-5 py-6">
        <button
          onClick={() => setShowLogout(true)}
          className="w-full h-14 bg-red-500 active:bg-red-600 text-white text-base font-semibold rounded-2xl transition-colors"
        >
          {t('logout')}
        </button>
      </div>

      <div className="h-4" />

      {/* ── Remove device confirm modal ───────────────────────────────── */}
      {showRemoveDevice && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={() => setShowRemoveDevice(false)}>
          <div
            className={`w-full max-w-sm rounded-2xl p-6 ${th.cardBg} shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className={`font-bold text-lg ${th.text}`}>Remove This Device?</h3>
              <p className={`text-sm mt-1 ${th.textSub}`}>
                Fingerprint login will be removed from this device. You can re-enable it by logging in with your staff code.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveDevice(false)}
                className={`flex-1 py-3 rounded-xl border text-sm font-medium ${th.border} ${th.text}`}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('staffQuickLogin');
                  setShowRemoveDevice(false);
                  toast.success('Device removed');
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout confirm modal ───────────────────────────────────────── */}
      {showLogout && (
        <LogoutModal
          th={th}
          t={t}
          onConfirm={handleLogout}
          onClose={() => setShowLogout(false)}
        />
      )}
    </div>
  );
}
