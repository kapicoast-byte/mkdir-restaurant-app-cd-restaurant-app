// Driver portal layout — top bar + 3-tab bottom nav, mobile-first, orange theme
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'D';
}

const NAV = [
  {
    to: '/driver/dashboard',
    emoji: '🚗',
    label: 'My Trips',
  },
  {
    to: '/driver/navigate',
    emoji: '📍',
    label: 'Navigate',
  },
  {
    to: '/driver/settings',
    emoji: '⚙️',
    label: 'Settings',
  },
];

export default function DriverLayout() {
  const { userProfile, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Sign out failed');
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 flex-shrink-0"
        style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
          >
            🚗
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Driver Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface2)' }}
            aria-label="Toggle theme"
          >
            <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
          </button>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
          >
            {getInitials(userProfile?.name ?? '')}
          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* ── Bottom nav ───────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 flex"
        style={{
          height: 'calc(64px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {NAV.map(({ to, emoji, label }) => (
          <NavLink key={to} to={to} className="flex-1 flex flex-col items-center justify-center pt-1 transition-opacity active:opacity-70">
            {({ isActive }) => (
              <>
                <span className="text-xl leading-none mb-0.5"
                  style={{ filter: isActive ? 'none' : 'grayscale(1) opacity(0.45)' }}>
                  {emoji}
                </span>
                <span
                  className="text-xs font-semibold leading-none mt-0.5"
                  style={{ color: isActive ? '#F97316' : 'var(--text-faint)' }}
                >
                  {label}
                </span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full mt-1" style={{ backgroundColor: '#F97316' }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
