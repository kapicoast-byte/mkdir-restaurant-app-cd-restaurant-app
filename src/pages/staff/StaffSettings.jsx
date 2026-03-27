// Staff Settings — language selector, dark mode toggle, profile, sign-out
// This page is fully functional from day 1 since it uses only local state
// and a single Firestore write for language preference.
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';
import { LANGUAGES } from '../../i18n/translations';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function StaffSettings() {
  const { t, lang, isDark, toggleTheme, th } = useStaffCtx();
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pull staffId + staffCode from userProfile
  const staffId   = userProfile?.staffId ?? null;
  const staffCode = userProfile?.staffCode ?? null; // may not be present in /users

  const handleLanguageChange = async (code) => {
    if (!staffId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'staff', staffId), { preferredLanguage: code });
      // Also mirror to /users/{uid} so other parts of the app see it
      await updateDoc(doc(db, 'users', userProfile.uid ?? ''), {
        preferredLanguage: code,
      }).catch(() => {}); // non-fatal if uid not available
    } catch {
      toast.error('Could not save language preference');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Sign out failed');
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Row component helpers ─────────────────────────────────────────────────
  const SectionTitle = ({ label }) => (
    <p className={`px-5 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider ${th.textFaint}`}>
      {label}
    </p>
  );

  const Row = ({ children }) => (
    <div className={`${th.cardBg} border-b ${th.border} px-5 py-4 flex items-center justify-between`}>
      {children}
    </div>
  );

  return (
    <div className={`min-h-full ${th.pageBg}`}>
      {/* Header */}
      <div className={`px-5 pt-10 pb-6 ${th.cardBg} border-b ${th.border}`}>
        <h1 className={`text-2xl font-bold ${th.text}`}>{t('settings')}</h1>
      </div>

      {/* ── Profile section ─────────────────────────────────────────────── */}
      <SectionTitle label={userProfile?.name ?? '—'} />
      <Row>
        <span className={`text-sm ${th.textSub}`}>Role</span>
        <span className={`text-sm font-medium ${th.text} capitalize`}>
          {userProfile?.role ?? '—'}
        </span>
      </Row>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <SectionTitle label={t('darkMode')} />
      <Row>
        <span className={`text-sm font-medium ${th.text}`}>{t('darkMode')}</span>
        {/* Toggle switch */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
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
      </Row>

      {/* ── Language ─────────────────────────────────────────────────────── */}
      <SectionTitle label={t('language')} />
      <div className={`${th.cardBg} border-b ${th.border}`}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            disabled={saving}
            onClick={() => handleLanguageChange(l.code)}
            className={`w-full flex items-center justify-between px-5 py-4 border-b ${th.border} last:border-b-0
              transition-colors active:opacity-70 disabled:opacity-40`}
          >
            <span
              className={`text-base font-medium ${th.text}`}
              dir={l.dir}
            >
              {l.nativeName}
            </span>
            {lang === l.code && (
              <span className="text-indigo-500 text-xl">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sign Out ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-6">
        <button
          onClick={handleLogout}
          className="w-full h-16 bg-red-500 hover:bg-red-600 active:bg-red-700
            text-white text-base font-semibold rounded-2xl transition-colors"
        >
          {t('logout')}
        </button>
      </div>

      {/* Bottom padding for nav */}
      <div className="h-4" />
    </div>
  );
}
