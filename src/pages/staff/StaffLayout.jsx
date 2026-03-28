// Shell layout for the staff portal.
// - Initialises the StaffContext (theme + language)
// - Full-height mobile-first layout: scrollable content above fixed bottom nav
// - Bottom nav: 80px, large tap targets, 4 tabs
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { StaffProvider, THEMES } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LANGUAGES } from '../../i18n/translations';
import toast from 'react-hot-toast';

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/staff/home',     icon: '🏠', labelKey: 'home'    },
  { to: '/staff/checkin',  icon: '✅', labelKey: 'checkIn' },
  { to: '/staff/shifts',   icon: '📅', labelKey: 'shifts'  },
  { to: '/staff/settings', icon: '⚙️', labelKey: 'settings'},
];

export default function StaffLayout() {
  const { logout }           = useAuth();
  const navigate             = useNavigate();
  const { t, lang }          = useTranslation();
  // Global theme — drives html.dark class via ThemeContext
  const { isDark, toggleTheme } = useTheme();
  const th = isDark ? THEMES.dark : THEMES.light;

  // Text direction: Urdu is RTL
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';

  // Context value passed to every child page
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
      {/*
        Outer wrapper fills the viewport.
        Content area scrolls; bottom nav is fixed.
        pb-20 (80px) keeps content from being hidden by the nav bar.
      */}
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
          className={`fixed bottom-0 inset-x-0 z-50 h-20 ${th.navBg} flex`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV.map(({ to, icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium
                 min-h-[64px] transition-colors
                 ${isActive ? th.navActive : th.navInactive}`
              }
            >
              {/* Icon: larger on active tab via inline style */}
              <span className="text-2xl leading-none">{icon}</span>
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </StaffProvider>
  );
}
