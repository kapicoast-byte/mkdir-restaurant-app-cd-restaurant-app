// Redirects unauthenticated users to /login.
// If allowedRoles is provided and the user's role doesn't match,
// redirects them to their correct dashboard instead.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function dashboardForRole(role) {
  if (role === 'owner') return '/owner/dashboard';
  if (role === 'manager' || role === 'trustedManager') return '/manager/dashboard';
  return '/staff/home';
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && userProfile && !allowedRoles.includes(userProfile.role)) {
    return <Navigate to={dashboardForRole(userProfile.role)} replace />;
  }

  return children;
}
