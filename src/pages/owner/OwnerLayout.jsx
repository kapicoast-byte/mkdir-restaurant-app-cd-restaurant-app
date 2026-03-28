// Wrapper layout for all owner pages — sidebar + main content area
import { Outlet } from 'react-router-dom';
import OwnerSidebar from '../../components/common/OwnerSidebar';

export default function OwnerLayout() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <OwnerSidebar />
      <main
        className="flex-1 p-8 overflow-auto"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <Outlet />
      </main>
    </div>
  );
}
