// Manager: check-in schedules + today's timeline status view
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const todayStr = new Date().toDateString();

const AVATAR_BG = {
  owner: '#F97316', trustedManager: '#8B5CF6', manager: '#3B82F6',
  staff: '#6B7280', kitchen: '#22C55E', floor: '#F59E0B', cleaning: '#94A3B8',
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
};

// ── Status circle ─────────────────────────────────────────────────────────────
function StatusCircle({ status, name, role }) {
  const initials = getInitials(name);
  const bg = AVATAR_BG[role] ?? AVATAR_BG.staff;

  let borderColor, glow = false, pulse = false;
  if (status === 'checked_in')   { borderColor = '#22C55E'; }
  else if (status === 'missed')  { borderColor = '#EF4444'; }
  else if (status === 'due_now') { borderColor = 'var(--color-primary)'; pulse = true; }
  else                           { borderColor = 'var(--border2)'; }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ${pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: bg, boxShadow: `0 0 0 2px ${borderColor}` }}
        title={name}
      >
        {initials}
        {/* Status dot */}
        <div
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
          style={{
            backgroundColor: status === 'checked_in' ? '#22C55E'
              : status === 'missed' ? '#EF4444'
              : status === 'due_now' ? 'var(--color-primary)'
              : 'var(--border2)',
            borderColor: 'var(--surface)',
          }}
        />
      </div>
      <span className="text-xs text-center truncate max-w-[52px]" style={{ color: 'var(--text-faint)', fontSize: '10px' }}>
        {name?.split(' ')[0]}
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CheckIns() {
  const { branchId } = useAuth();
  const [schedules,    setSchedules]    = useState([]);
  const [checkIns,     setCheckIns]     = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [form,         setForm]         = useState({ time: '', locationLabel: '', appliesTo: [] });
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab,    setActiveTab]    = useState('today');

  useEffect(() => {
    if (!branchId) return;
    const unsubSch = onSnapshot(
      query(collection(db, 'checkInSchedules'), where('branchId', '==', branchId)),
      (snap) => { setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubCI = onSnapshot(
      query(collection(db, 'checkIns'), where('branchId', '==', branchId)),
      (snap) => setCheckIns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId), where('isActive', '==', true)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubSch(); unsubCI(); unsubStaff(); };
  }, [branchId]);

  const staffName = (id) => staff.find((s) => s.id === id)?.name ?? id;
  const staffObj  = (id) => staff.find((s) => s.id === id);

  const toggleStaff = (id) =>
    setForm((f) => ({
      ...f,
      appliesTo: f.appliesTo.includes(id)
        ? f.appliesTo.filter((s) => s !== id)
        : [...f.appliesTo, id],
    }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.appliesTo.length) { toast.error('Select at least one staff member'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'checkInSchedules'), {
        branchId, time: form.time, locationLabel: form.locationLabel.trim(),
        appliesTo: form.appliesTo, createdAt: serverTimestamp(),
      });
      toast.success('Check-in schedule created');
      setModalOpen(false);
      setForm({ time: '', locationLabel: '', appliesTo: [] });
    } catch {
      toast.error('Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'checkInSchedules', deleteTarget.id));
      toast.success('Schedule deleted');
    } catch {
      toast.error('Failed to delete schedule');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Today's check-ins
  const todayCheckIns = checkIns.filter((c) => {
    const ts = c.timestamp?.toDate?.() ?? (c.timestamp ? new Date(c.timestamp) : null);
    return ts && ts.toDateString() === todayStr;
  });

  // Per-staff status for today
  const staffTodayStatus = staff.map((s) => {
    const sCI = todayCheckIns.filter((c) => c.staffId === s.id);
    const latest = sCI.sort((a, b) => {
      const ta = a.timestamp?.toDate?.() ?? new Date(0);
      const tb = b.timestamp?.toDate?.() ?? new Date(0);
      return tb - ta;
    })[0];
    const status = latest
      ? (latest.status === 'missed' ? 'missed' : 'checked_in')
      : 'upcoming';
    return { ...s, checkIn: latest, status };
  });

  // Build timeline from schedules, sorted by time
  const sortedSchedules = [...schedules].sort((a, b) => a.time.localeCompare(b.time));
  const nowHHMM = new Date().toTimeString().slice(0, 5);

  const timelineSlots = sortedSchedules.map((sch) => {
    const isPast   = sch.time < nowHHMM;
    const isDueNow = !isPast && Math.abs(
      parseInt(sch.time.replace(':', ''), 10) - parseInt(nowHHMM.replace(':', ''), 10)
    ) <= 10;

    const members = (sch.appliesTo ?? []).map((sid) => {
      const s     = staffObj(sid);
      const ciRec = todayCheckIns.find((c) => c.staffId === sid);
      let status;
      if (ciRec)           status = ciRec.status === 'missed' ? 'missed' : 'checked_in';
      else if (isDueNow)   status = 'due_now';
      else if (isPast)     status = 'missed';
      else                 status = 'upcoming';
      return { sid, name: s?.name ?? sid, role: s?.role ?? 'staff', status };
    });

    return { ...sch, members, isPast, isDueNow };
  });

  if (loading) return <LoadingSpinner message="Loading check-ins…" />;

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          Monitor staff attendance and check-in compliance
        </p>
        <button
          onClick={() => { setForm({ time: '', locationLabel: '', appliesTo: [] }); setModalOpen(true); }}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + New Schedule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 w-fit" style={{ backgroundColor: 'var(--surface2)' }}>
        {[
          { key: 'today', label: "Today's Status" },
          { key: 'schedules', label: 'Schedules' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={
              activeTab === key
                ? { backgroundColor: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' }
                : { color: 'var(--text-sub)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Today's status — timeline view */}
      {activeTab === 'today' && (
        staffTodayStatus.length === 0 ? (
          <EmptyState icon="📍" title="No active staff" message="No staff are active in this branch yet." />
        ) : (
          <div className="space-y-3">
            {timelineSlots.length > 0 ? (
              // Timeline from schedules
              timelineSlots.map((slot, i) => (
                <div
                  key={slot.id}
                  className="rounded-xl p-4 flex items-start gap-4"
                  style={{
                    backgroundColor: slot.isDueNow ? 'var(--color-primary-faint)' : 'var(--surface)',
                    border: `1px solid ${slot.isDueNow ? 'var(--color-primary-light)' : 'var(--border)'}`,
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  {/* Time */}
                  <div
                    className="w-14 text-center flex-shrink-0"
                  >
                    <div
                      className="text-base font-bold font-mono"
                      style={{ color: slot.isDueNow ? 'var(--color-primary)' : 'var(--text)' }}
                    >
                      {slot.time}
                    </div>
                    {slot.isDueNow && (
                      <div className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Now</div>
                    )}
                  </div>

                  {/* Divider */}
                  <div
                    className="w-px self-stretch flex-shrink-0"
                    style={{ backgroundColor: slot.isDueNow ? 'var(--color-primary)' : 'var(--border)' }}
                  />

                  {/* Location + staff avatars */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                      {slot.locationLabel || 'Check-in'}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {slot.members.map((m) => (
                        <StatusCircle key={m.sid} status={m.status} name={m.name} role={m.role} />
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // Fallback: plain staff list when no schedules configured
              <div className="space-y-2">
                {staffTodayStatus.map((s) => {
                  const isMissed = s.status === 'missed' || !s.checkIn;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-xl px-5 py-4"
                      style={{
                        backgroundColor: isMissed ? '#FEF2F2' : 'var(--surface)',
                        border: `1px solid ${isMissed ? '#FECACA' : 'var(--border)'}`,
                        boxShadow: 'var(--shadow)',
                      }}
                    >
                      <div>
                        <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{s.name}</div>
                        <div className="text-xs capitalize mt-0.5" style={{ color: 'var(--text-faint)' }}>{s.role}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {s.checkIn?.timestamp && (
                          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                            {(s.checkIn.timestamp?.toDate?.() ?? new Date(s.checkIn.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={isMissed
                            ? { backgroundColor: '#FEE2E2', color: '#DC2626' }
                            : { backgroundColor: '#F0FDF4', color: '#16A34A' }
                          }
                        >
                          {isMissed ? 'Not recorded' : 'Checked In'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 pt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
              {[
                { color: '#22C55E', label: '✅ Checked in' },
                { color: '#EF4444', label: '❌ Missed' },
                { color: 'var(--color-primary)', label: '🟠 Due now' },
                { color: 'var(--border2)', label: '⬜ Upcoming' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )
      )}

      {/* Schedules tab */}
      {activeTab === 'schedules' && (
        schedules.length === 0 ? (
          <EmptyState icon="📅" title="No check-in schedules" message="Create a schedule to track staff attendance." />
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface2)' }}>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Time</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Location</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Applies To</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((sch, i) => (
                  <tr
                    key={sch.id}
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                  >
                    <td className="px-5 py-3.5 font-mono font-semibold" style={{ color: 'var(--text)' }}>{sch.time}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-sub)' }}>{sch.locationLabel}</td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-sub)' }}>
                      {sch.appliesTo?.map(staffName).join(', ') ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setDeleteTarget(sch)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#EF4444' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                        onMouseLeave={e => e.currentTarget.style.color = '#EF4444'}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* New Schedule Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Check-in Schedule">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Check-in Time</label>
              <input
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Location Label</label>
              <input
                required
                value={form.locationLabel}
                onChange={(e) => setForm((f) => ({ ...f, locationLabel: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Main Entrance"
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-sub)' }}>Applies To</label>
            <div
              className="space-y-1 max-h-44 overflow-y-auto rounded-lg p-2"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <input
                    type="checkbox"
                    checked={form.appliesTo.includes(s.id)}
                    onChange={() => toggleStaff(s.id)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                </label>
              ))}
              {staff.length === 0 && (
                <p className="text-sm text-center py-2" style={{ color: 'var(--text-faint)' }}>
                  No active staff in this branch.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm rounded-lg transition-colors"
              style={{ color: 'var(--text-sub)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition-colors"
              style={{ backgroundColor: 'var(--color-primary)' }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'; }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
            >
              {saving ? 'Saving…' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Schedule"
        message={`Delete check-in schedule at ${deleteTarget?.time} (${deleteTarget?.locationLabel})?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
