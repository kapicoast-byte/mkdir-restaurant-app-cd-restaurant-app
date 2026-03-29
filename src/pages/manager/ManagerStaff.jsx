// Manager: view branch staff with avatars, role badges, and performance metrics
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

const AVATAR_BG = {
  owner: '#F97316', trustedManager: '#8B5CF6', manager: '#3B82F6',
  staff: '#6B7280', kitchen: '#22C55E', floor: '#F59E0B', cleaning: '#94A3B8',
  driver: '#06B6D4',
};

const ROLE_BADGE = {
  owner:          { bg: '#FFF7ED', color: '#EA580C', label: 'Owner' },
  trustedManager: { bg: '#F5F3FF', color: '#7C3AED', label: 'Trusted Mgr' },
  manager:        { bg: '#EFF6FF', color: '#2563EB', label: 'Manager' },
  staff:          { bg: '#F9FAFB', color: '#6B7280', label: 'Staff' },
  kitchen:        { bg: '#F0FDF4', color: '#16A34A', label: 'Kitchen' },
  floor:          { bg: '#FFFBEB', color: '#D97706', label: 'Floor' },
  cleaning:       { bg: '#F8FAFC', color: '#64748B', label: 'Cleaning' },
  driver:         { bg: '#ECFEFF', color: '#0891B2', label: 'Driver' },
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

function Avatar({ name, role, size = 48 }) {
  const bg = AVATAR_BG[role] ?? AVATAR_BG.staff;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.33, backgroundColor: bg }}
    >
      {getInitials(name)}
    </div>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Performance detail panel ─────────────────────────────────────────────────
function DetailPanel({ staffMember, onClose }) {
  if (!staffMember) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 z-50 space-y-4"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar name={staffMember.name} role={staffMember.role} size={48} />
          <div>
            <h3 className="font-bold" style={{ color: 'var(--text)' }}>{staffMember.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {(() => {
                const b = ROLE_BADGE[staffMember.role] ?? ROLE_BADGE.staff;
                return (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: b.bg, color: b.color }}>
                    {b.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-lg leading-none"
            style={{ color: 'var(--text-sub)', backgroundColor: 'var(--surface2)' }}
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span style={{ color: 'var(--text-sub)' }}>Task Completion</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {staffMember.completionRate !== null ? `${staffMember.completionRate}%` : 'No tasks'}
              </span>
            </div>
            {staffMember.completionRate !== null && (
              <ProgressBar value={staffMember.completionRate} color="var(--color-primary)" />
            )}
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span style={{ color: 'var(--text-sub)' }}>Check-in Compliance</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {staffMember.checkInCompliance !== null ? `${staffMember.checkInCompliance}%` : 'No data'}
              </span>
            </div>
            {staffMember.checkInCompliance !== null && (
              <ProgressBar
                value={staffMember.checkInCompliance}
                color={staffMember.checkInCompliance >= 80 ? '#22C55E' : staffMember.checkInCompliance >= 50 ? '#EAB308' : '#EF4444'}
              />
            )}
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-3 pt-3 text-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{staffMember.total}</div>
            <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Tasks</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: '#16A34A' }}>{staffMember.completed}</div>
            <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Done</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: staffMember.missedCheckIns > 0 ? '#EF4444' : 'var(--text-faint)' }}>
              {staffMember.missedCheckIns}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Missed</div>
          </div>
        </div>

        {staffMember.staffCode && (
          <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
            Code: <span className="font-mono font-semibold">{staffMember.staffCode}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ManagerStaff() {
  const { branchId } = useAuth();
  const [staff,    setStaff]    = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);

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

  const staffWithStats = staff.map((s) => {
    const sTasks  = tasks.filter((t) => t.assignedTo === s.id || t.assignedTo === s.authUid || t.assignedToStaffId === s.id);
    const total   = sTasks.length;
    const completed    = sTasks.filter((t) => t.status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;

    const sCheckIns = checkIns.filter((c) => c.staffId === s.id);
    const totalCI   = sCheckIns.length;
    const missedCI  = sCheckIns.filter((c) => c.status === 'missed').length;
    const checkInCompliance = totalCI > 0 ? Math.round(((totalCI - missedCI) / totalCI) * 100) : null;

    return { ...s, total, completed, completionRate, totalCheckIns: totalCI, missedCheckIns: missedCI, checkInCompliance };
  });

  if (loading) return <LoadingSpinner message="Loading staff…" />;

  const selectedFull = staffWithStats.find((s) => s.id === selected?.id);

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
        Staff in your branch — click a card to view performance details
      </p>

      {staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff in this branch" message="Ask your owner to add staff to your branch." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staffWithStats.map((s) => {
            const badge = ROLE_BADGE[s.role] ?? ROLE_BADGE.staff;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="rounded-xl p-5 text-left transition-shadow w-full"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                  opacity: s.isActive ? 1 : 0.6,
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={s.name} role={s.role} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{s.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={s.isActive
                          ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                          : { backgroundColor: 'var(--surface2)', color: 'var(--text-faint)' }
                        }
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-sub)' }}>Completion rate</span>
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>
                        {s.completionRate !== null ? `${s.completionRate}%` : '—'}
                      </span>
                    </div>
                    {s.completionRate !== null && (
                      <ProgressBar
                        value={s.completionRate}
                        color="var(--color-primary)"
                      />
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-sub)' }}>Check-in compliance</span>
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>
                        {s.checkInCompliance !== null ? `${s.checkInCompliance}%` : '—'}
                      </span>
                    </div>
                    {s.checkInCompliance !== null && (
                      <ProgressBar
                        value={s.checkInCompliance}
                        color={s.checkInCompliance >= 80 ? '#22C55E' : s.checkInCompliance >= 50 ? '#EAB308' : '#EF4444'}
                      />
                    )}
                  </div>
                </div>

                {s.staffCode && (
                  <p className="text-xs mt-3 font-mono" style={{ color: 'var(--text-faint)' }}>
                    {s.staffCode}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected && <DetailPanel staffMember={selectedFull} onClose={() => setSelected(null)} />}
    </div>
  );
}
