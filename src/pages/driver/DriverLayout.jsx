// Driver portal layout — minimal top bar + bottom nav, mobile-first
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

function Icon({ children }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

const HomeIcon     = () => <Icon><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></Icon>;
const HistoryIcon  = () => <Icon><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>;
const SettingsIcon = () => <Icon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></Icon>;

const NAV = [
  { to: '/driver/dashboard', Icon: HomeIcon,     label: 'My Trips'  },
  { to: '/driver/history',   Icon: HistoryIcon,  label: 'History'   },
  { to: '/driver/settings',  Icon: SettingsIcon, label: 'Settings'  },
];

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'D';
}

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
            style={{ backgroundColor: '#0D9488' }}
          >
            D
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
            style={{ backgroundColor: '#0D9488' }}
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
        {NAV.map(({ to, Icon: NavIcon, label }) => (
          <NavLink key={to} to={to} className="flex-1 flex flex-col items-center justify-center pt-1">
            {({ isActive }) => (
              <>
                <div
                  className="w-1 h-1 rounded-full mb-1 transition-all"
                  style={{ backgroundColor: isActive ? '#0D9488' : 'transparent' }}
                />
                <span style={{ color: isActive ? '#0D9488' : 'var(--text-faint)' }}>
                  <NavIcon />
                </span>
                <span
                  className="text-xs font-medium mt-0.5 leading-none"
                  style={{ color: isActive ? '#0D9488' : 'var(--text-faint)' }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
