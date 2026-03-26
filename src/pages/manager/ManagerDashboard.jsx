// Manager dashboard — today's tasks, active staff, missed check-ins
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageHeader from '../../components/common/PageHeader';

const todayStr = () => new Date().toDateString();

function StatCard({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function ManagerDashboard() {
  const { branchId } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId)),
      (snap) => { setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );

    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId), where('isActive', '==', true)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubCheckIns = onSnapshot(
      query(collection(db, 'checkIns'), where('branchId', '==', branchId)),
      (snap) => setCheckIns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubTasks(); unsubStaff(); unsubCheckIns(); };
  }, [branchId]);

  const now = new Date();

  // Today's tasks
  const todayTasks = tasks.filter((t) => {
    if (!t.dueTime) return false;
    return new Date(t.dueTime).toDateString() === todayStr();
  });

  const totalToday = todayTasks.length;
  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const pendingToday = todayTasks.filter((t) => t.status === 'pending').length;
  const overdueToday = todayTasks.filter(
    (t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < now
  ).length;

  // Today's check-ins
  const todayCheckIns = checkIns.filter((c) => {
    if (!c.timestamp) return false;
    return new Date(c.timestamp?.toDate?.() ?? c.timestamp).toDateString() === todayStr();
  });
  const missedToday = todayCheckIns.filter((c) => c.status === 'missed').length;

  // Recent task list
  const recentTasks = [...tasks]
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() ?? new Date(0);
      const tb = b.createdAt?.toDate?.() ?? new Date(0);
      return tb - ta;
    })
    .slice(0, 5);

  const statusColor = {
    pending: 'bg-yellow-100 text-yellow-700',
    'in progress': 'bg-blue-100 text-blue-700',
    'pending photo review': 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  const staffName = (id) => staff.find((s) => s.id === id)?.name ?? '—';

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div>
      <PageHeader
        title="Manager Dashboard"
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      />

      {/* Today's task stats */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Today's Tasks</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total" value={totalToday} />
        <StatCard label="Completed" value={completedToday} color="text-green-600" />
        <StatCard label="Pending" value={pendingToday} color="text-yellow-600" />
        <StatCard label="Overdue" value={overdueToday} color={overdueToday > 0 ? 'text-red-600' : 'text-gray-400'} />
      </div>

      {/* Staff & check-in stats */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Staff Overview</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard label="Active Staff Today" value={staff.length} color="text-indigo-600" />
        <StatCard label="Missed Check-ins" value={missedToday} color={missedToday > 0 ? 'text-red-600' : 'text-gray-400'} />
      </div>

      {/* Recent tasks */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Tasks</h2>
      {recentTasks.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-500 text-sm border border-gray-200">
          No tasks yet. Go to Tasks to create your first task.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Task</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Assigned To</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Due</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentTasks.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{t.title}</td>
                  <td className="px-5 py-3.5 text-gray-600">{staffName(t.assignedTo)}</td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {t.dueTime ? new Date(t.dueTime).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
