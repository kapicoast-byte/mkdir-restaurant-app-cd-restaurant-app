// Manager sidebar — always dark, orange accent
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: '▦'  },
  { to: '/manager/tasks',     label: 'Tasks',      icon: '✓'  },
  { to: '/manager/staff',     label: 'Staff',      icon: '👥' },
  { to: '/manager/shifts',    label: 'Shifts',     icon: '🗓️' },
  { to: '/manager/checkins',  label: 'Check-ins',  icon: '📍' },
];

export default function ManagerSidebar() {
  const { userProfile, logout } = useAuth();

  return (
    <aside
      className="w-60 min-h-screen flex flex-col flex-shrink-0"
      style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Brand */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            R
          </div>
          <span className="font-semibold text-base" style={{ color: 'var(--sidebar-text)' }}>
            RestaurantOS
          </span>
        </div>
        <div className="mt-1.5 text-xs" style={{ color: 'var(--sidebar-text-sub)' }}>
          Manager Portal
        </div>
      </div>

      {/* User info */}
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="text-sm font-medium" style={{ color: 'var(--sidebar-text)' }}>
          {userProfile?.name ?? 'Manager'}
        </div>
        <div className="text-xs mt-0.5 capitalize" style={{ color: 'var(--sidebar-text-sub)' }}>
          {userProfile?.role ?? 'manager'}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={({ isActive }) =>
              isActive
                ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                : { color: 'var(--sidebar-text)' }
            }
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: '12px' }}>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--sidebar-text-sub)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--sidebar-text-sub)'; }}
        >
          <span>↩</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
