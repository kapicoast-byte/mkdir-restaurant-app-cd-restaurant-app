// Owner: performance reports across all branches
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  'in progress': 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  'pending photo review': 'bg-purple-100 text-purple-700',
};

export default function Reports() {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsubB = onSnapshot(
      query(collection(db, 'branches'), where('ownerId', '==', user.uid)),
      (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubT = onSnapshot(collection(db, 'tasks'), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubS = onSnapshot(collection(db, 'staff'), (snap) =>
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubB(); unsubT(); unsubS(); };
  }, [user]);

  const staffName = (id) => staff.find((s) => s.id === id)?.name ?? '—';

  // Task completion stats per branch
  const branchReports = branches.map((branch) => {
    const branchTasks = tasks.filter((t) => t.branchId === branch.id);
    const total = branchTasks.length;
    const completed = branchTasks.filter((t) => t.status === 'completed').length;
    const overdue = branchTasks.filter(
      (t) => t.status !== 'completed' && t.dueTime && new Date(t.dueTime) < new Date()
    ).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;
    return { branch, total, completed, overdue, completionRate };
  });

  // Top performers (staff with highest completion rate, min 1 task)
  const staffStats = staff.map((s) => {
    const sTasks = tasks.filter((t) => t.assignedTo === s.id);
    const total = sTasks.length;
    const completed = sTasks.filter((t) => t.status === 'completed').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : null;
    return { ...s, total, completed, rate };
  }).filter((s) => s.total > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  if (loading) return <LoadingSpinner message="Loading reports..." />;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Performance overview across all branches" />

      {/* Branch completion summary */}
      <h2 className="text-base font-semibold text-gray-800 mb-3">Branch Performance</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {branchReports.map(({ branch, total, completed, overdue, completionRate }) => (
          <div key={branch.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-1">{branch.name}</h3>
            <p className="text-xs text-gray-500 mb-4">{branch.location}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xl font-bold text-gray-800">{total}</div>
                <div className="text-xs text-gray-500">Total Tasks</div>
              </div>
              <div>
                <div className="text-xl font-bold text-green-600">{completed}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div>
                <div className={`text-xl font-bold ${overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{overdue}</div>
                <div className="text-xs text-gray-500">Overdue</div>
              </div>
            </div>
            {completionRate !== null && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Completion Rate</span>
                  <span className="font-medium">{completionRate}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      completionRate >= 75 ? 'bg-green-500' : completionRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        {branches.length === 0 && (
          <p className="text-sm text-gray-500 col-span-3">No branches found.</p>
        )}
      </div>

      {/* Staff performance table */}
      <h2 className="text-base font-semibold text-gray-800 mb-3">Staff Performance</h2>
      {staffStats.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-500 text-sm border border-gray-200">
          No task data available yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Staff Member</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Branch</th>
                <th className="text-center px-5 py-3 font-semibold text-gray-600">Tasks Assigned</th>
                <th className="text-center px-5 py-3 font-semibold text-gray-600">Completed</th>
                <th className="text-center px-5 py-3 font-semibold text-gray-600">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffStats.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{s.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">
                    {branches.find((b) => b.id === s.branchId)?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center text-gray-800">{s.total}</td>
                  <td className="px-5 py-3.5 text-center text-green-700 font-medium">{s.completed}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.rate >= 75 ? 'bg-green-100 text-green-700' : s.rate >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {s.rate}%
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
