// Manager: view branch staff and their performance summaries
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

export default function ManagerStaff() {
  const { branchId } = useAuth();
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) return;
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId)),
      (snap) => { setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubCheckins = onSnapshot(
      query(collection(db, 'checkIns'), where('branchId', '==', branchId)),
      (snap) => setCheckIns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubStaff(); unsubTasks(); unsubCheckins(); };
  }, [branchId]);

  // Compute per-staff performance metrics
  const staffWithStats = staff.map((s) => {
    const sTasks = tasks.filter((t) => t.assignedTo === s.id);
    const total = sTasks.length;
    const completed = sTasks.filter((t) => t.status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;

    const sCheckIns = checkIns.filter((c) => c.staffId === s.id);
    const totalCheckIns = sCheckIns.length;
    const missedCheckIns = sCheckIns.filter((c) => c.status === 'missed').length;
    const checkInCompliance = totalCheckIns > 0 ? Math.round(((totalCheckIns - missedCheckIns) / totalCheckIns) * 100) : null;

    return { ...s, total, completed, completionRate, totalCheckIns, missedCheckIns, checkInCompliance };
  });

  if (loading) return <LoadingSpinner message="Loading staff..." />;

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Your branch's staff members and performance"
      />

      {staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff in this branch" message="Ask your owner to add staff to your branch." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staffWithStats.map((s) => (
            <div key={s.id} className={`bg-white rounded-xl p-5 shadow-sm border ${s.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{s.role}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Task completion */}
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Task Completion</span>
                  <span className="font-medium text-gray-700">
                    {s.completionRate !== null ? `${s.completionRate}%` : 'No tasks'}
                  </span>
                </div>
                {s.completionRate !== null && (
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${
                        s.completionRate >= 75 ? 'bg-green-500' : s.completionRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${s.completionRate}%` }}
                    />
                  </div>
                )}

                {/* Check-in compliance */}
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>Check-in Compliance</span>
                  <span className="font-medium text-gray-700">
                    {s.checkInCompliance !== null ? `${s.checkInCompliance}%` : 'No data'}
                  </span>
                </div>
                {s.checkInCompliance !== null && (
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${
                        s.checkInCompliance >= 80 ? 'bg-green-500' : s.checkInCompliance >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${s.checkInCompliance}%` }}
                    />
                  </div>
                )}

                <div className="flex gap-4 pt-2 text-xs text-gray-500 border-t border-gray-100 mt-2">
                  <span>{s.total} tasks assigned</span>
                  <span>{s.missedCheckIns} missed check-ins</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
