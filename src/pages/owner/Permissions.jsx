// Owner: manage per-staff permission toggles with full audit log
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, updateDoc, doc, addDoc,
  serverTimestamp, query, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

// All toggleable permissions
const PERMISSIONS = [
  { key: 'createTasks', label: 'Create Tasks' },
  { key: 'viewOtherBranches', label: 'View Other Branches' },
  { key: 'accessAIInsights', label: 'Access AI Insights' },
  { key: 'manageStaffAccounts', label: 'Manage Staff Accounts' },
  { key: 'viewPerformanceReports', label: 'View Performance Reports' },
  { key: 'changeShiftSchedules', label: 'Change Shift Schedules' },
];

// Default permissions per role
const ROLE_DEFAULTS = {
  owner:          { createTasks: true, viewOtherBranches: true, accessAIInsights: true, manageStaffAccounts: true, viewPerformanceReports: true, changeShiftSchedules: true },
  trustedManager: { createTasks: true, viewOtherBranches: true, accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: true, changeShiftSchedules: true },
  manager:        { createTasks: true, viewOtherBranches: false, accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: false, changeShiftSchedules: false },
  staff:          { createTasks: false, viewOtherBranches: false, accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: false, changeShiftSchedules: false },
};

function getEffectivePermission(staffMember, permKey) {
  const overrides = staffMember.permissionOverrides ?? {};
  if (permKey in overrides) return overrides[permKey];
  return ROLE_DEFAULTS[staffMember.role]?.[permKey] ?? false;
}

export default function Permissions() {
  const { user, userProfile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null); // "{staffId}:{permKey}"
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), orderBy('name')),
      (snap) => { setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLog = onSnapshot(
      query(collection(db, 'permissionAuditLog'), orderBy('timestamp', 'desc'), limit(50)),
      (snap) => setAuditLog(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubStaff(); unsubBranches(); unsubLog(); };
  }, []);

  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';

  const handleToggle = async (staffMember, permKey) => {
    const oldValue = getEffectivePermission(staffMember, permKey);
    const newValue = !oldValue;
    const saveKey = `${staffMember.id}:${permKey}`;
    setSavingKey(saveKey);
    try {
      const overrides = { ...(staffMember.permissionOverrides ?? {}), [permKey]: newValue };
      await updateDoc(doc(db, 'staff', staffMember.id), { permissionOverrides: overrides });

      // Write audit log entry
      await addDoc(collection(db, 'permissionAuditLog'), {
        changedBy: user.uid,
        changedByName: userProfile?.name ?? 'Owner',
        targetStaffId: staffMember.id,
        targetStaffName: staffMember.name,
        permission: permKey,
        oldValue,
        newValue,
        timestamp: serverTimestamp(),
      });

      toast.success(`${permKey} ${newValue ? 'enabled' : 'disabled'} for ${staffMember.name}`);
    } catch {
      toast.error('Failed to update permission');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <LoadingSpinner message="Loading permissions..." />;

  const activeStaff = staff.filter((s) => s.isActive);

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Manage individual staff permissions with role defaults"
        action={
          <button
            onClick={() => setShowAudit((v) => !v)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {showAudit ? 'Hide Audit Log' : 'View Audit Log'}
          </button>
        }
      />

      {/* Audit Log Panel */}
      {showAudit && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Permission Audit Log</h3>
          {auditLog.length === 0 ? (
            <p className="text-sm text-gray-500">No audit entries yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-xs text-gray-600 border-b border-gray-100 pb-2">
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{entry.changedByName}</span>
                    {' '}changed{' '}
                    <span className="font-medium text-indigo-600">{entry.permission}</span>
                    {' '}for{' '}
                    <span className="font-medium text-gray-800">{entry.targetStaffName}</span>
                    {' '}from{' '}
                    <span className={entry.oldValue ? 'text-green-600' : 'text-gray-400'}>{entry.oldValue ? 'ON' : 'OFF'}</span>
                    {' '}to{' '}
                    <span className={entry.newValue ? 'text-green-600' : 'text-gray-400'}>{entry.newValue ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="text-gray-400 whitespace-nowrap">
                    {entry.timestamp?.toDate
                      ? entry.timestamp.toDate().toLocaleString()
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Permissions Table */}
      {activeStaff.length === 0 ? (
        <EmptyState icon="🔐" title="No active staff" message="Add staff members to manage their permissions." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[180px]">Staff Member</th>
                {PERMISSIONS.map((p) => (
                  <th key={p.key} className="px-3 py-3 font-semibold text-gray-600 text-center min-w-[100px] text-xs">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeStaff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.role} · {branchName(s.branchId)}</div>
                  </td>
                  {PERMISSIONS.map((p) => {
                    const effective = getEffectivePermission(s, p.key);
                    const isOverride = s.permissionOverrides && p.key in s.permissionOverrides;
                    const saveKey = `${s.id}:${p.key}`;
                    const isSaving = savingKey === saveKey;
                    return (
                      <td key={p.key} className="px-3 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleToggle(s, p.key)}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                              effective ? 'bg-indigo-600' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                effective ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          {isOverride && (
                            <span className="text-[10px] text-orange-500 font-medium">override</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
