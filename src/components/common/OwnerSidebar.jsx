// Dark sidebar navigation for owner role
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/owner/dashboard', label: 'Dashboard', icon: '⬜' },
  { to: '/owner/branches', label: 'Branches', icon: '🏢' },
  { to: '/owner/staff', label: 'Staff', icon: '👥' },
  { to: '/owner/permissions', label: 'Permissions', icon: '🔐' },
  { to: '/owner/reports', label: 'Reports', icon: '📊' },
];

export default function OwnerSidebar() {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col flex-shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-sm font-bold">R</div>
          <span className="font-semibold text-lg">RestaurantOS</span>
        </div>
        <div className="mt-2 text-xs text-gray-400">Owner Portal</div>
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="text-sm font-medium text-white">{userProfile?.name ?? 'Owner'}</div>
        <div className="text-xs text-gray-400 mt-0.5 capitalize">{userProfile?.role ?? 'owner'}</div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
