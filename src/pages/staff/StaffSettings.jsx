// Staff Settings — orange design system, large avatar, section icons, language picker
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useStaffCtx } from '../../context/StaffContext';
import { LANGUAGES } from '../../i18n/translations';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Role labels ───────────────────────────────────────────────────────────────
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

// ── Initials from name ────────────────────────────────────────────────────────
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

// ── Section icon circle ───────────────────────────────────────────────────────
function SectionIcon({ emoji }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
      style={{ backgroundColor: 'var(--color-primary-faint)', color: 'var(--color-primary)' }}
    >
      {emoji}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionTitle({ label }) {
  return (
    <p
      className="px-4 pt-6 pb-2 text-xs font-semibold uppercase tracking-widest"
      style={{ color: 'var(--text-faint)' }}
    >
      {label}
    </p>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────
function SettingRow({ icon, label, sub, right, onClick, danger, noBorder }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity disabled:cursor-default"
      style={{
        backgroundColor: 'var(--surface)',
        borderBottom: noBorder ? 'none' : '1px solid var(--border)',
      }}
    >
      {icon && <SectionIcon emoji={icon} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? '#DC2626' : 'var(--text)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>{sub}</p>}
      </div>
      {right}
    </button>
  );
}

// ── Orange toggle ─────────────────────────────────────────────────────────────
function OrangeToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative inline-flex h-7 w-12 items-center rounded-full flex-shrink-0"
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--border2, #D1D5DB)',
        transition: 'background-color 200ms',
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
        style={{
          transform: checked ? 'translateX(22px)' : 'translateX(4px)',
          transition: 'transform 200ms',
        }}
      />
    </button>
  );
}

// ── Logout confirm modal ──────────────────────────────────────────────────────
function LogoutModal({ t, onConfirm, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">👋</div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{t('confirmLogoutTitle')}</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>{t('confirmLogoutMsg')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: '#DC2626' }}
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Remove device confirm modal ───────────────────────────────────────────────
function RemoveDeviceModal({ t, onConfirm, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🗑️</div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Remove This Device?</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
            Fingerprint login will be removed. You can re-enable it by logging in with your staff code.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{ border: '1px solid var(--border)', color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: '#DC2626' }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StaffSettings() {
  const { t, lang, isDark, toggleTheme } = useStaffCtx();
  const { userProfile, logout }           = useAuth();
  const navigate = useNavigate();

  const [saving,           setSaving]           = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [showLogout,       setShowLogout]       = useState(false);
  const [showRemoveDevice, setShowRemoveDevice] = useState(false);

  const hasQuickLogin = (() => {
    try { return !!JSON.parse(localStorage.getItem('staffQuickLogin'))?.credentialId; }
    catch { return false; }
  })();

  const staffId    = userProfile?.staffId   ?? null;
  const staffCode  = userProfile?.staffCode ?? null;
  const branchName = userProfile?.branchName ?? userProfile?.branch ?? null;
  const name       = userProfile?.name ?? '';

  // ── Language change ────────────────────────────────────────────────────────
  const handleLanguageChange = async (code) => {
    if (!staffId || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'staff', staffId), { preferredLanguage: code });
      if (userProfile?.uid) {
        await updateDoc(doc(db, 'users', userProfile.uid), { preferredLanguage: code }).catch(() => {});
      }
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

  return (
    <div className="min-h-full pb-8" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Avatar header ──────────────────────────────────────────────── */}
      <div
        className="px-5 pt-12 pb-6 flex flex-col items-center text-center"
        style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Large orange avatar circle */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-3 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
        >
          {getInitials(name)}
        </div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{name || '—'}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>{friendlyRole(userProfile?.role)}</p>
        {branchName && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>📍 {branchName}</p>
        )}
      </div>

      {/* ── Profile section ─────────────────────────────────────────────── */}
      <SectionTitle label={t('profile')} />
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {staffCode && (
          <SettingRow
            icon="🪪"
            label={t('staffCode')}
            sub={staffCode}
            right={
              <button
                onClick={copyCode}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                style={copied
                  ? { backgroundColor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }
                  : { backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
                }
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            }
            noBorder={!branchName}
          />
        )}
        {branchName && (
          <SettingRow
            icon="🏪"
            label={t('branch')}
            sub={branchName}
            noBorder
          />
        )}
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <SectionTitle label={t('appearance')} />
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <SettingRow
          icon={isDark ? '🌙' : '☀️'}
          label={isDark ? t('darkMode') : t('lightMode')}
          sub={isDark ? 'Dark theme enabled' : 'Light theme enabled'}
          right={<OrangeToggle checked={isDark} onChange={toggleTheme} />}
          noBorder
        />
      </div>

      {/* ── Language ───────────────────────────────────────────────────── */}
      <SectionTitle label={t('language')} />
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="grid grid-cols-3">
          {LANGUAGES.map((l, idx) => {
            const isActive = lang === l.code;
            const isLast = idx === LANGUAGES.length - 1;
            return (
              <button
                key={l.code}
                disabled={saving}
                onClick={() => handleLanguageChange(l.code)}
                dir={l.dir}
                className="px-3 py-4 text-center text-sm font-medium transition-colors disabled:opacity-40 active:opacity-70"
                style={{
                  backgroundColor: isActive ? 'var(--color-primary)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  borderRight: (idx % 3 !== 2) ? '1px solid var(--border)' : 'none',
                }}
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
          <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <SettingRow
              icon="👆"
              label="Fingerprint Login"
              sub="Biometric quick-login is enabled"
              right={
                <button
                  onClick={() => setShowRemoveDevice(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                >
                  Remove
                </button>
              }
              noBorder
            />
          </div>
        </>
      )}

      {/* ── Log Out ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-6">
        <button
          onClick={() => setShowLogout(true)}
          className="w-full h-14 rounded-2xl text-white text-base font-semibold active:opacity-90 transition-opacity"
          style={{ backgroundColor: '#DC2626' }}
        >
          {t('logout')}
        </button>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showRemoveDevice && (
        <RemoveDeviceModal
          t={t}
          onConfirm={() => {
            localStorage.removeItem('staffQuickLogin');
            setShowRemoveDevice(false);
            toast.success('Device removed');
          }}
          onClose={() => setShowRemoveDevice(false)}
        />
      )}

      {showLogout && (
        <LogoutModal
          t={t}
          onConfirm={handleLogout}
          onClose={() => setShowLogout(false)}
        />
      )}
    </div>
  );
}
