// Manager: weekly shift calendar — orange theme
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(date) { return date.toISOString().slice(0, 10); }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
};

const emptyForm = { date: '', startTime: '', endTime: '', assignedStaff: [] };

export default function Shifts() {
  const { branchId } = useAuth();
  const [shifts,       setShifts]       = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [weekStart,    setWeekStart]    = useState(() => getWeekStart(new Date()));
  const [modalOpen,    setModalOpen]    = useState(false);
  const [form,         setForm]         = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!branchId) return;
    const unsubShifts = onSnapshot(
      query(collection(db, 'shifts'), where('branchId', '==', branchId)),
      (snap) => { setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId), where('isActive', '==', true)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubShifts(); unsubStaff(); };
  }, [branchId]);

  const weekDays    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const prevWeek    = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek    = () => setWeekStart((w) => addDays(w, 7));
  const shiftsOnDay = (date) => shifts.filter((s) => s.date === fmtDate(date));
  const staffName   = (id) => staff.find((s) => s.id === id)?.name ?? id;

  const toggleStaff = (id) => {
    setForm((f) => ({
      ...f,
      assignedStaff: f.assignedStaff.includes(id)
        ? f.assignedStaff.filter((s) => s !== id)
        : [...f.assignedStaff, id],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.assignedStaff.length) { toast.error('Please assign at least one staff member'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'shifts'), {
        branchId, date: form.date, startTime: form.startTime,
        endTime: form.endTime, assignedStaff: form.assignedStaff,
        createdAt: serverTimestamp(),
      });
      toast.success('Shift created');
      setModalOpen(false);
      setForm(emptyForm);
    } catch {
      toast.error('Failed to create shift');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'shifts', deleteTarget.id));
      toast.success('Shift deleted');
    } catch {
      toast.error('Failed to delete shift');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) return <LoadingSpinner message="Loading shifts…" />;

  const todayStr  = fmtDate(new Date());
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          Weekly shift schedule for your branch
        </p>
        <button
          onClick={() => { setForm(emptyForm); setModalOpen(true); }}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + Add Shift
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevWeek}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
        >
          ←
        </button>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{weekLabel}</span>
        <button
          onClick={nextWeek}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
        >
          →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, i) => {
          const dayShifts = shiftsOnDay(day);
          const isToday   = fmtDate(day) === todayStr;
          return (
            <div
              key={i}
              className="rounded-xl p-2.5 min-h-[110px]"
              style={{
                backgroundColor: 'var(--surface)',
                border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--border)'}`,
                boxShadow: isToday ? '0 0 0 2px var(--color-primary-light)' : 'var(--shadow)',
              }}
            >
              {/* Day header */}
              <div className="mb-2">
                <div
                  className="text-xs font-semibold"
                  style={{ color: isToday ? 'var(--color-primary)' : 'var(--text-sub)' }}
                >
                  {DAYS[i]}
                </div>
                <div
                  className={`text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'text-white' : ''}`}
                  style={{
                    color: isToday ? '#FFFFFF' : 'var(--text)',
                    backgroundColor: isToday ? 'var(--color-primary)' : 'transparent',
                    fontSize: '14px',
                  }}
                >
                  {day.getDate()}
                </div>
              </div>

              {/* Shifts */}
              <div className="space-y-1">
                {dayShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="rounded-md p-1.5 cursor-pointer group relative text-xs"
                    style={{
                      backgroundColor: 'var(--color-primary-faint)',
                      border: '1px solid var(--color-primary-light)',
                    }}
                    onClick={() => setDeleteTarget(shift)}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    <div className="font-semibold leading-tight" style={{ color: 'var(--color-primary-dark)' }}>
                      {shift.startTime}–{shift.endTime}
                    </div>
                    <div className="truncate leading-tight mt-0.5" style={{ color: 'var(--color-primary)' }}>
                      {shift.assignedStaff?.map(staffName).join(', ')}
                    </div>
                    <span className="absolute top-0.5 right-1 hidden group-hover:inline text-red-400 text-xs">✕</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {shifts.length === 0 && (
        <EmptyState icon="🗓️" title="No shifts scheduled" message="Create your first shift to fill in the calendar." />
      )}

      {/* New shift modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Shift">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Start Time</label>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>End Time</label>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-sub)' }}>Assign Staff</label>
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
                    checked={form.assignedStaff.includes(s.id)}
                    onChange={() => toggleStaff(s.id)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs capitalize" style={{ color: 'var(--text-faint)' }}>{s.role}</span>
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
              {saving ? 'Saving…' : 'Create Shift'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Shift"
        message={`Delete this shift on ${deleteTarget?.date} (${deleteTarget?.startTime}–${deleteTarget?.endTime})?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
