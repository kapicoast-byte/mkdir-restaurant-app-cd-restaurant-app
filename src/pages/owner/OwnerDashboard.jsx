// Owner dashboard — branch health cards, total staff, task summaries
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';

// Compute health score: % of today's tasks that are completed
function computeHealthScore(tasks) {
  const todayStr = new Date().toDateString();
  const todayTasks = tasks.filter((t) => {
    if (!t.dueTime) return false;
    return new Date(t.dueTime).toDateString() === todayStr;
  });
  if (!todayTasks.length) return null;
  const completed = todayTasks.filter((t) => t.status === 'completed').length;
  return Math.round((completed / todayTasks.length) * 100);
}

function HealthBadge({ score }) {
  if (score === null) return <span className="text-xs text-gray-400">No tasks today</span>;
  const color = score >= 75 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{score}% complete</span>;
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Real-time listeners
    const unsubBranches = onSnapshot(
      query(collection(db, 'branches'), where('ownerId', '==', user.uid)),
      (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('isActive', '==', true)),
      (snap) => setAllStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        setAllTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );

    return () => {
      unsubBranches();
      unsubStaff();
      unsubTasks();
    };
  }, [user]);

  const totalActiveStaff = allStaff.length;
  const now = new Date();

  // Build per-branch stats
  const branchStats = branches.map((branch) => {
    const branchStaff = allStaff.filter((s) => s.branchId === branch.id);
    const branchTasks = allTasks.filter((t) => t.branchId === branch.id);
    const activeTasks = branchTasks.filter((t) => t.status !== 'completed');
    const overdueTasks = branchTasks.filter(
      (t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < now
    );
    const health = computeHealthScore(branchTasks);
    return { branch, staffCount: branchStaff.length, activeTasks: activeTasks.length, overdueTasks: overdueTasks.length, health };
  });

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div>
      <PageHeader
        title="Owner Dashboard"
        subtitle={`Overview of all branches — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
      />

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="text-3xl font-bold text-gray-900">{branches.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Branches</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="text-3xl font-bold text-indigo-600">{totalActiveStaff}</div>
          <div className="text-sm text-gray-500 mt-1">Active Staff</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="text-3xl font-bold text-orange-500">
            {branchStats.reduce((acc, b) => acc + b.overdueTasks, 0)}
          </div>
          <div className="text-sm text-gray-500 mt-1">Overdue Tasks</div>
        </div>
      </div>

      {/* Branch cards */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Branches</h2>

      {branches.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="No branches yet"
          message="Go to Branches to add your first restaurant branch."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branchStats.map(({ branch, staffCount, activeTasks, overdueTasks, health }) => (
            <div key={branch.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{branch.location}</p>
                </div>
                <HealthBadge score={health} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-800">{staffCount}</div>
                  <div className="text-xs text-gray-500">Staff</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">{activeTasks}</div>
                  <div className="text-xs text-gray-500">Active Tasks</div>
                </div>
                <div className="text-center">
                  <div className={`text-xl font-bold ${overdueTasks > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {overdueTasks}
                  </div>
                  <div className="text-xs text-gray-500">Overdue</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
