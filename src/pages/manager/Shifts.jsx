// Manager: create shifts and view them in a weekly calendar
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';

// Get the Monday of the week containing the given date
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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emptyForm = { date: '', startTime: '', endTime: '', assignedStaff: [] };

export default function Shifts() {
  const { branchId } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
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

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));

  const shiftsOnDay = (date) =>
    shifts.filter((s) => s.date === formatDate(date));

  const staffName = (id) => staff.find((s) => s.id === id)?.name ?? id;

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
    if (!form.assignedStaff.length) {
      toast.error('Please assign at least one staff member');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'shifts'), {
        branchId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        assignedStaff: form.assignedStaff,
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

  if (loading) return <LoadingSpinner message="Loading shifts..." />;

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const todayStr = formatDate(new Date());

  return (
    <div>
      <PageHeader
        title="Shifts"
        subtitle="Weekly shift schedule for your branch"
        action={
          <button
            onClick={() => { setForm(emptyForm); setModalOpen(true); }}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + New Shift
          </button>
        }
      />

      {/* Week navigator */}
      <div className="flex items-center gap-4 mb-5">
        <button onClick={prevWeek} className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-sm">←</button>
        <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
        <button onClick={nextWeek} className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-sm">→</button>
      </div>

      {/* Weekly calendar */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {weekDays.map((day, i) => {
          const dayShifts = shiftsOnDay(day);
          const isToday = formatDate(day) === todayStr;
          return (
            <div
              key={i}
              className={`bg-white rounded-xl p-3 border min-h-[120px] ${
                isToday ? 'border-emerald-400 shadow-sm' : 'border-gray-200'
              }`}
            >
              <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-emerald-600' : 'text-gray-500'}`}>
                <div>{DAYS[i]}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-emerald-600' : 'text-gray-800'}`}>
                  {day.getDate()}
                </div>
              </div>
              <div className="space-y-1">
                {dayShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="bg-emerald-50 border border-emerald-200 rounded p-1 text-xs cursor-pointer group relative"
                    onClick={() => setDeleteTarget(shift)}
                  >
                    <div className="font-medium text-emerald-800">{shift.startTime}–{shift.endTime}</div>
                    <div className="text-emerald-600 truncate">
                      {shift.assignedStaff?.map(staffName).join(', ')}
                    </div>
                    <div className="hidden group-hover:flex absolute top-0 right-0 p-0.5">
                      <span className="text-red-400 text-xs">✕</span>
                    </div>
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
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Shift">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assign Staff</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded p-1.5">
                  <input
                    type="checkbox"
                    checked={form.assignedStaff.includes(s.id)}
                    onChange={() => toggleStaff(s.id)}
                    className="rounded text-emerald-600"
                  />
                  <span className="text-sm text-gray-700">{s.name}</span>
                  <span className="text-xs text-gray-400 capitalize">{s.role}</span>
                </label>
              ))}
              {staff.length === 0 && <p className="text-sm text-gray-400">No active staff in this branch.</p>}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Shift'}
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
