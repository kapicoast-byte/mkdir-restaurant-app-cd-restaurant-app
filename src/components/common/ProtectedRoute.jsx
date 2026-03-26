// Redirects unauthenticated users to /login
// Optionally restricts to specific roles
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
    // Redirect to their proper dashboard if role doesn't match
    if (userProfile.role === 'owner') return <Navigate to="/owner/dashboard" replace />;
    return <Navigate to="/manager/dashboard" replace />;
  }

  return children;
}
