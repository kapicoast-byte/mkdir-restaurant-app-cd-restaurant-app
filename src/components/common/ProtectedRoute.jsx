// Guards routes by auth state and role.
//
// Redirect table:
//   Not signed in                          → /login
//   Signed in, profile error               → /login  (can't determine role safely)
//   Signed in, wrong role for this route   → dashboardForRole(role)
//   Signed in, correct role                → renders children
//
// While auth/profile is loading, shows a centered spinner.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Returns the correct home path for any role, used for cross-role redirects.
function dashboardForRole(role) {
  if (role === 'owner')                             return '/owner/dashboard';
  if (role === 'manager' || role === 'trustedManager') return '/manager/dashboard';
  // kitchen / floor / cleaning / staff → staff portal
  return '/staff/home';
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, userProfile, profileError, loading } = useAuth();

  // Still resolving auth state or fetching the Firestore profile
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Not signed in at all
  if (!user) return <Navigate to="/login" replace />;

  // Signed in but profile failed to load (permission-denied, missing doc after retries, etc.)
  // Sending to /login so the user sees a clean state rather than a broken page.
  if (profileError || !userProfile) return <Navigate to="/login" replace />;

  // Role check — redirect to their own dashboard if they hit the wrong section
  if (allowedRoles && !allowedRoles.includes(userProfile.role)) {
    console.warn(
      `[ProtectedRoute] Role "${userProfile.role}" not in [${allowedRoles.join(', ')}] — redirecting to ${dashboardForRole(userProfile.role)}`
    );
    return <Navigate to={dashboardForRole(userProfile.role)} replace />;
  }

  return children;
}
