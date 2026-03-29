// Shell layout for the staff portal — mobile-first, orange design system
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { StaffProvider, THEMES } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LANGUAGES } from '../../i18n/translations';
import toast from 'react-hot-toast';

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const CheckInIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);

const ShiftsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const SettingsIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/staff/home',     Icon: HomeIcon,     labelKey: 'home'     },
  { to: '/staff/checkin',  Icon: CheckInIcon,  labelKey: 'checkIn'  },
  { to: '/staff/shifts',   Icon: ShiftsIcon,   labelKey: 'shifts'   },
  { to: '/staff/settings', Icon: SettingsIcon, labelKey: 'settings' },
];

export default function StaffLayout() {
  const { logout }               = useAuth();
  const navigate                 = useNavigate();
  const { t, lang }              = useTranslation();
  const { isDark, toggleTheme }  = useTheme();
  const th = isDark ? THEMES.dark : THEMES.light;

  const dir = LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';

  const ctxValue = { t, lang, isDark, toggleTheme, th };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success(t('logout'));
    } catch {
      toast.error('Sign out failed');
    }
  };

  return (
    <StaffProvider value={ctxValue}>
      <div
        className={`min-h-screen flex flex-col ${th.pageBg}`}
        dir={dir}
      >
        {/* ── Scrollable content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto pb-20">
          <Outlet />
        </main>

        {/* ── Fixed bottom navigation ────────────────────────────────── */}
        <nav
          className={`fixed bottom-0 inset-x-0 z-50 ${th.navBg} flex`}
          style={{
            height: 'calc(64px + env(safe-area-inset-bottom))',
            paddingBottom: 'env(safe-area-inset-bottom)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {NAV.map(({ to, Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center pt-1"
            >
              {({ isActive }) => (
                <>
                  {/* Orange dot indicator above active icon */}
                  <div
                    className="w-1 h-1 rounded-full mb-1 transition-all"
                    style={{ backgroundColor: isActive ? 'var(--color-primary)' : 'transparent' }}
                  />
                  <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-faint)' }}>
                    <Icon />
                  </span>
                  <span
                    className="text-xs font-medium mt-0.5 leading-none"
                    style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-faint)' }}
                  >
                    {t(labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </StaffProvider>
  );
}
