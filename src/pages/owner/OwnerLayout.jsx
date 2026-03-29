// Owner layout — 260px sidebar + 64px topbar + mobile hamburger drawer
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

// ── Tiny SVG icon helper ─────────────────────────────────────────────────────
function Icon({ children, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const DashboardIcon   = () => <Icon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></Icon>;
const BranchesIcon    = () => <Icon><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Icon>;
const StaffIcon       = () => <Icon><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></Icon>;
const PermissionsIcon = () => <Icon><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></Icon>;
const ReportsIcon     = () => <Icon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Icon>;
const TripsIcon       = () => <Icon><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></Icon>;
const MenuIcon        = () => <Icon><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></Icon>;
const SunIcon         = () => <Icon><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></Icon>;
const MoonIcon        = () => <Icon><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></Icon>;
const BellIcon        = () => <Icon><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></Icon>;
const SignOutIcon     = () => <Icon><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Icon>;
const CloseIcon       = () => <Icon><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>;

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/owner/dashboard',   label: 'Dashboard',   Icon: DashboardIcon },
  { to: '/owner/branches',    label: 'Branches',    Icon: BranchesIcon },
  { to: '/owner/staff',       label: 'Staff',       Icon: StaffIcon },
  { to: '/owner/permissions', label: 'Permissions', Icon: PermissionsIcon },
  { to: '/owner/reports',     label: 'Reports',     Icon: ReportsIcon },
  { to: '/owner/trips',       label: 'Trips',       Icon: TripsIcon },
];

const PAGE_TITLES = {
  '/owner/dashboard':   'Dashboard',
  '/owner/branches':    'Branches',
  '/owner/staff':       'Staff',
  '/owner/permissions': 'Permissions',
  '/owner/reports':     'Reports',
  '/owner/trips':       'Trips',
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'O';
}

// ── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({ onNavClick }) {
  const { userProfile, logout } = useAuth();

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
      {/* Brand */}
      <div className="px-5 py-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            R
          </div>
          <span className="font-semibold text-base" style={{ color: 'var(--sidebar-text)' }}>
            RestaurantOS
          </span>
        </div>
        <div className="mt-1.5 text-xs" style={{ color: 'var(--sidebar-text-sub)' }}>
          Owner Portal
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, Icon: NavIcon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-transition"
            style={({ isActive }) =>
              isActive
                ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                : { color: 'var(--sidebar-text)' }
            }
            onMouseEnter={(e) => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.backgroundColor = '';
              }
            }}
          >
            <NavIcon />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + sign out */}
      <div className="px-3 pb-4 flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: '12px' }}>
        <div className="px-3 py-2 mb-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>
            {userProfile?.name ?? 'Owner'}
          </div>
          <div className="text-xs capitalize mt-0.5" style={{ color: 'var(--sidebar-text-sub)' }}>
            {userProfile?.role ?? 'owner'}
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--sidebar-text-sub)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--sidebar-text-sub)'; }}
        >
          <SignOutIcon />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────
export default function OwnerLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { userProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Owner';
  const initials  = getInitials(userProfile?.name ?? '');

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>

      {/* Desktop sidebar — fixed, always visible on md+ */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-30"
        style={{ width: '260px', borderRight: '1px solid var(--sidebar-border)' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className="fixed inset-y-0 left-0 z-50 md:hidden flex flex-col"
        style={{
          width: '260px',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ color: 'var(--sidebar-text-sub)', backgroundColor: 'var(--sidebar-hover)' }}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
        <SidebarContent onNavClick={() => setDrawerOpen(false)} />
      </aside>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-h-screen" style={{ paddingLeft: 0 }}>
        <div className="md:ml-[260px] flex flex-col flex-1">

          {/* Topbar */}
          <header
            className="h-16 flex items-center px-4 md:px-6 gap-3 flex-shrink-0 sticky top-0 z-20"
            style={{
              backgroundColor: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
              style={{ color: 'var(--text-sub)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>

            {/* Page title */}
            <h1
              className="flex-1 text-lg font-semibold truncate"
              style={{ color: 'var(--text)' }}
            >
              {pageTitle}
            </h1>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--text-sub)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                aria-label="Toggle theme"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </button>

              {/* Notification bell */}
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--text-sub)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                aria-label="Notifications"
              >
                <BellIcon />
              </button>

              {/* Owner avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 cursor-default select-none"
                style={{ background: 'var(--color-primary)' }}
                title={userProfile?.name ?? 'Owner'}
              >
                {initials}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-6 overflow-auto" style={{ backgroundColor: 'var(--bg)' }}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
