// Staff dashboard — placeholder for Phase 2 staff-facing UI
// Accessible by any authenticated user with role: staff (kitchen, floor, cleaning, etc.)
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function StaffDashboard() {
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
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8 text-center">
        {/* Avatar */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
          <span className="text-3xl">👋</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Welcome, {userProfile?.name ?? 'Staff Member'}
        </h1>
        <p className="text-sm text-gray-500 mb-1 capitalize">{userProfile?.role}</p>

        {/* Phase 2 placeholder */}
        <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-5">
          <div className="text-2xl mb-2">🚧</div>
          <p className="text-sm font-semibold text-indigo-800 mb-1">Staff Portal — Coming Soon</p>
          <p className="text-xs text-indigo-600">
            Your task list, check-in, and shift features will be available here in Phase 2.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="mt-6 w-full py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
