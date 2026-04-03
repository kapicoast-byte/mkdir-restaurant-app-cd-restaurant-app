// Driver Settings — profile, appearance, language, logout
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LANGUAGES } from '../../i18n/translations';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'D';
}

// ── OrangeToggle ──────────────────────────────────────────────────────────────
function OrangeToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative inline-flex h-7 w-12 items-center rounded-full flex-shrink-0"
      style={{
        backgroundColor: checked ? '#F97316' : 'var(--border)',
        transition: 'background-color 200ms',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
        style={{
          transform: checked ? 'translateX(22px)' : 'translateX(4px)',
          transition: 'transform 200ms',
          display: 'inline-block',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────
function SectionTitle({ label }) {
  return (
    <p
      style={{
        padding: '24px 16px 8px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-faint)',
        margin: 0,
      }}
    >
      {label}
    </p>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────
function SettingRow({ icon, label, value, right, noBorder }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        minHeight: 56,
        backgroundColor: 'var(--surface)',
        borderBottom: noBorder ? 'none' : '1px solid var(--border)',
        boxSizing: 'border-box',
      }}
    >
      {icon && (
        <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-faint)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {label}
        </p>
        {value && (
          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text)',
              margin: '1px 0 0',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </p>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

// ── Logout confirm bottom sheet ───────────────────────────────────────────────
function LogoutSheet({ onConfirm, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 24px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>👋</div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text)',
              margin: '0 0 6px',
            }}
          >
            Sign out?
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', margin: 0 }}>
            Are you sure you want to sign out?
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: 14,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text-sub)',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: 14,
              border: 'none',
              backgroundColor: '#DC2626',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DriverSettings() {
  const { userProfile, logout, user } = useAuth();
  const { isDark, toggleTheme }       = useTheme();
  const navigate                      = useNavigate();

  const [lang,       setLang]       = useState(userProfile?.preferredLanguage ?? 'en');
  const [saving,     setSaving]     = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const name = userProfile?.name ?? '';

  // ── Language change ────────────────────────────────────────────────────────
  const handleLanguageChange = async (code) => {
    if (saving) return;
    setSaving(true);
    try {
      if (userProfile?.id || userProfile?.staffId) {
        await updateDoc(
          doc(db, 'staff', userProfile.staffId ?? userProfile.id),
          { preferredLanguage: code },
        );
      }
      setLang(code);
    } catch {
      toast.error('Could not save language');
    } finally {
      setSaving(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Sign out failed');
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
        paddingBottom: 40,
      }}
    >
      {/* ── Orange gradient header ───────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          padding: '48px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 700,
            color: '#fff',
            marginBottom: 14,
            border: '3px solid rgba(255,255,255,0.5)',
          }}
        >
          {getInitials(name)}
        </div>

        {/* Name */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            margin: '0 0 8px',
          }}
        >
          {name || '—'}
        </h1>

        {/* Role badge */}
        <span
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 999,
            padding: '4px 14px',
            marginBottom: userProfile?.staffCode ? 8 : 0,
          }}
        >
          Driver
        </span>

        {/* Staff code */}
        {userProfile?.staffCode && (
          <p
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.8)',
              margin: '6px 0 0',
            }}
          >
            {userProfile.staffCode}
          </p>
        )}
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <SectionTitle label="Profile" />
      <div
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <SettingRow icon="🧑" label="Name" value={name || '—'} />
        {user?.email && (
          <SettingRow icon="📧" label="Email / Login" value={user.email} />
        )}
        <SettingRow
          icon="🏪"
          label="Branch"
          value={userProfile?.branchName ?? '—'}
          noBorder
        />
      </div>

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      <SectionTitle label="Appearance" />
      <div
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <SettingRow
          icon={isDark ? '🌙' : '☀️'}
          label={isDark ? 'Dark Mode' : 'Light Mode'}
          right={<OrangeToggle checked={isDark} onChange={toggleTheme} />}
          noBorder
        />
      </div>

      {/* ── Language ────────────────────────────────────────────────────────── */}
      <SectionTitle label="Language" />
      <div
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {LANGUAGES.map((l, idx) => {
            const isActive  = lang === l.code;
            const isLastRow = idx >= LANGUAGES.length - (LANGUAGES.length % 3 || 3);
            const isLastCol = idx % 3 === 2;
            return (
              <button
                key={l.code}
                disabled={saving}
                onClick={() => handleLanguageChange(l.code)}
                dir={l.dir}
                style={{
                  padding: '14px 12px',
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  backgroundColor: isActive ? '#F97316' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderBottom: isLastRow ? 'none' : '1px solid var(--border)',
                  borderRight: isLastCol ? 'none' : '1px solid var(--border)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  transition: 'background-color 150ms',
                  minHeight: 56,
                  boxSizing: 'border-box',
                }}
              >
                {l.nativeName}
                {isActive && (
                  <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.9 }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sign out button ──────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 0' }}>
        <button
          onClick={() => setShowLogout(true)}
          style={{
            width: '100%',
            minHeight: 56,
            borderRadius: 16,
            border: 'none',
            backgroundColor: '#DC2626',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
          }}
        >
          Sign Out
        </button>
      </div>

      {/* ── Logout confirm modal ──────────────────────────────────────────────── */}
      {showLogout && (
        <LogoutSheet
          onConfirm={handleLogout}
          onClose={() => setShowLogout(false)}
        />
      )}
    </div>
  );
}
