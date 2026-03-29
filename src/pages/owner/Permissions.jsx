// Owner: manage per-staff permission toggles with timeline audit log
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, updateDoc, doc, addDoc,
  serverTimestamp, query, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

const PERMISSIONS = [
  { key: 'createTasks',            label: 'Create Tasks' },
  { key: 'viewOtherBranches',      label: 'View Other Branches' },
  { key: 'accessAIInsights',       label: 'AI Insights' },
  { key: 'manageStaffAccounts',    label: 'Manage Staff' },
  { key: 'viewPerformanceReports', label: 'Reports' },
  { key: 'changeShiftSchedules',   label: 'Shift Schedules' },
];

const ROLE_DEFAULTS = {
  owner:          { createTasks: true,  viewOtherBranches: true,  accessAIInsights: true,  manageStaffAccounts: true,  viewPerformanceReports: true,  changeShiftSchedules: true  },
  trustedManager: { createTasks: true,  viewOtherBranches: true,  accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: true,  changeShiftSchedules: true  },
  manager:        { createTasks: true,  viewOtherBranches: false, accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: false, changeShiftSchedules: false },
  staff:          { createTasks: false, viewOtherBranches: false, accessAIInsights: false, manageStaffAccounts: false, viewPerformanceReports: false, changeShiftSchedules: false },
};

function getEffectivePermission(staffMember, permKey) {
  const overrides = staffMember.permissionOverrides ?? {};
  if (permKey in overrides) return overrides[permKey];
  return ROLE_DEFAULTS[staffMember.role]?.[permKey] ?? false;
}

// ── Toggle component ─────────────────────────────────────────────────────────
function OrangeToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none"
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--border2)',
        transition: 'background-color 200ms ease',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)', transition: 'transform 200ms ease' }}
      />
    </button>
  );
}

// ── Audit timeline entry ─────────────────────────────────────────────────────
function AuditEntry({ entry }) {
  const ts = entry.timestamp?.toDate
    ? entry.timestamp.toDate()
    : entry.timestamp ? new Date(entry.timestamp) : null;

  return (
    <div className="flex gap-3">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
        <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--border)', minHeight: '16px' }} />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: 'var(--text)' }}>
          <span className="font-semibold">{entry.changedByName}</span>
          {' '}
          <span style={{ color: 'var(--text-sub)' }}>changed</span>
          {' '}
          <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
            {PERMISSIONS.find((p) => p.key === entry.permission)?.label ?? entry.permission}
          </span>
          {' '}
          <span style={{ color: 'var(--text-sub)' }}>for</span>
          {' '}
          <span className="font-semibold">{entry.targetStaffName}</span>
          {' '}
          <span style={{ color: 'var(--text-sub)' }}>→</span>
          {' '}
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={
              entry.newValue
                ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                : { backgroundColor: 'var(--surface2)', color: 'var(--text-faint)' }
            }
          >
            {entry.newValue ? 'ON' : 'OFF'}
          </span>
        </p>
        {ts && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {ts.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Permissions() {
  const { user, userProfile } = useAuth();
  const [staff,      setStaff]      = useState([]);
  const [branches,   setBranches]   = useState([]);
  const [auditLog,   setAuditLog]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [savingKey,  setSavingKey]  = useState(null);
  const [showAudit,  setShowAudit]  = useState(false);

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
    const saveKey  = `${staffMember.id}:${permKey}`;
    setSavingKey(saveKey);
    try {
      const overrides = { ...(staffMember.permissionOverrides ?? {}), [permKey]: newValue };
      await updateDoc(doc(db, 'staff', staffMember.id), { permissionOverrides: overrides });
      await addDoc(collection(db, 'permissionAuditLog'), {
        changedBy: user.uid, changedByName: userProfile?.name ?? 'Owner',
        targetStaffId: staffMember.id, targetStaffName: staffMember.name,
        permission: permKey, oldValue, newValue, timestamp: serverTimestamp(),
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
    <div className="space-y-6">

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          Manage individual staff permissions with role defaults
        </p>
        <button
          onClick={() => setShowAudit((v) => !v)}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={
            showAudit
              ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
              : { backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
          }
        >
          {showAudit ? 'Hide Audit Log' : 'Audit Log'}
        </button>
      </div>

      {/* Audit log — timeline style */}
      {showAudit && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
            Permission Changes
          </h3>
          {auditLog.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No changes recorded yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {auditLog.map((entry) => (
                <AuditEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Permissions table */}
      {activeStaff.length === 0 ? (
        <EmptyState icon="🔐" title="No active staff" message="Add staff members to manage their permissions." />
      ) : (
        <div
          className="rounded-xl overflow-x-auto"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface2)' }}>
                <th
                  className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide sticky left-0"
                  style={{ color: 'var(--text-sub)', backgroundColor: 'var(--surface2)', minWidth: '180px' }}
                >
                  Staff Member
                </th>
                {PERMISSIONS.map((p) => (
                  <th
                    key={p.key}
                    className="px-3 py-3 font-semibold text-center text-xs uppercase tracking-wide"
                    style={{ color: 'var(--text-sub)', minWidth: '90px' }}
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStaff.map((s, idx) => (
                <tr
                  key={s.id}
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  <td
                    className="px-5 py-3.5 sticky left-0"
                    style={{ backgroundColor: 'inherit' }}
                  >
                    <div className="font-medium" style={{ color: 'var(--text)' }}>{s.name}</div>
                    <div className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-faint)' }}>
                      {s.role} · {branchName(s.branchId)}
                    </div>
                  </td>
                  {PERMISSIONS.map((p) => {
                    const effective  = getEffectivePermission(s, p.key);
                    const isOverride = s.permissionOverrides && p.key in s.permissionOverrides;
                    const isSaving   = savingKey === `${s.id}:${p.key}`;
                    return (
                      <td key={p.key} className="px-3 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <OrangeToggle
                            checked={effective}
                            onChange={() => handleToggle(s, p.key)}
                            disabled={isSaving}
                          />
                          {isOverride && (
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              override
                            </span>
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
