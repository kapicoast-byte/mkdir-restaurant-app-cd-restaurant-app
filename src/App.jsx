// Root app component — sets up routing, auth provider, and toast notifications
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';

// Auth
import Login from './pages/Login';

// Owner pages
import OwnerLayout from './pages/owner/OwnerLayout';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import Branches from './pages/owner/Branches';
import OwnerStaff from './pages/owner/OwnerStaff';
import Permissions from './pages/owner/Permissions';
import Reports from './pages/owner/Reports';

// Manager pages
import ManagerLayout from './pages/manager/ManagerLayout';
import ManagerDashboard from './pages/manager/ManagerDashboard';
import Tasks from './pages/manager/Tasks';
import ManagerStaff from './pages/manager/ManagerStaff';
import Shifts from './pages/manager/Shifts';
import CheckIns from './pages/manager/CheckIns';

// Staff pages
import StaffLayout   from './pages/staff/StaffLayout';
import StaffHome     from './pages/staff/StaffHome';
import StaffCheckIn  from './pages/staff/StaffCheckIn';
import StaffShifts   from './pages/staff/StaffShifts';
import StaffSettings from './pages/staff/StaffSettings';

const OWNER_ROLES   = ['owner'];
const MANAGER_ROLES = ['manager', 'trustedManager'];
const STAFF_ROLES   = ['staff'];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Global toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '14px', borderRadius: '10px', padding: '12px 16px' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />

        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Owner routes */}
          <Route
            path="/owner"
            element={
              <ProtectedRoute allowedRoles={OWNER_ROLES}>
                <OwnerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<OwnerDashboard />} />
            <Route path="branches" element={<Branches />} />
            <Route path="staff" element={<OwnerStaff />} />
            <Route path="permissions" element={<Permissions />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          {/* Manager routes (manager + trustedManager) */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute allowedRoles={MANAGER_ROLES}>
                <ManagerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ManagerDashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="staff" element={<ManagerStaff />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="checkins" element={<CheckIns />} />
          </Route>

          {/* Staff routes */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <StaffLayout />
              </ProtectedRoute>
            }
          >
            <Route index                element={<Navigate to="home" replace />} />
            <Route path="home"          element={<StaffHome />} />
            <Route path="checkin"       element={<StaffCheckIn />} />
            <Route path="shifts"        element={<StaffShifts />} />
            <Route path="settings"      element={<StaffSettings />} />
            {/* Legacy redirect — old /staff/dashboard links still work */}
            <Route path="dashboard"     element={<Navigate to="/staff/home" replace />} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
