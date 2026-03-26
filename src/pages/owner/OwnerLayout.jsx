// Wrapper layout for all owner pages — sidebar + main content area
import { Outlet } from 'react-router-dom';
import OwnerSidebar from '../../components/common/OwnerSidebar';

export default function OwnerLayout() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <OwnerSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
