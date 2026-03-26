// Manager: manage check-in schedules and view today's check-in status
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const todayStr = new Date().toDateString();

const emptyForm = { time: '', locationLabel: '', appliesTo: [] };

export default function CheckIns() {
  const { branchId } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'schedules'

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

  const toggleStaff = (id) => {
    setForm((f) => ({
      ...f,
      appliesTo: f.appliesTo.includes(id)
        ? f.appliesTo.filter((s) => s !== id)
        : [...f.appliesTo, id],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.appliesTo.length) {
      toast.error('Select at least one staff member');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'checkInSchedules'), {
        branchId,
        time: form.time,
        locationLabel: form.locationLabel.trim(),
        appliesTo: form.appliesTo,
        createdAt: serverTimestamp(),
      });
      toast.success('Check-in schedule created');
      setModalOpen(false);
      setForm(emptyForm);
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

  // Today's check-in status per staff
  const todayCheckIns = checkIns.filter((c) => {
    const ts = c.timestamp?.toDate?.() ?? (c.timestamp ? new Date(c.timestamp) : null);
    return ts ? ts.toDateString() === todayStr : false;
  });

  // For each active staff, find their latest check-in today
  const staffTodayStatus = staff.map((s) => {
    const sCheckIns = todayCheckIns.filter((c) => c.staffId === s.id);
    const latest = sCheckIns.sort((a, b) => {
      const ta = a.timestamp?.toDate?.() ?? new Date(0);
      const tb = b.timestamp?.toDate?.() ?? new Date(0);
      return tb - ta;
    })[0];
    return { ...s, checkIn: latest };
  });

  if (loading) return <LoadingSpinner message="Loading check-ins..." />;

  return (
    <div>
      <PageHeader
        title="Check-ins"
        subtitle="Monitor staff attendance and check-in compliance"
        action={
          <button
            onClick={() => { setForm(emptyForm); setModalOpen(true); }}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + New Schedule
          </button>
        }
      />

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {['today', 'schedules'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'today' ? "Today's Status" : 'Schedules'}
          </button>
        ))}
      </div>

      {/* Today's status tab */}
      {activeTab === 'today' && (
        <>
          {staffTodayStatus.length === 0 ? (
            <EmptyState icon="📍" title="No active staff" message="No staff are active in this branch yet." />
          ) : (
            <div className="space-y-3">
              {staffTodayStatus.map((s) => {
                const status = s.checkIn?.status;
                const isMissed = status === 'missed' || !s.checkIn;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between bg-white rounded-xl px-5 py-4 shadow-sm border ${
                      isMissed ? 'border-red-200 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500 capitalize">{s.role}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.checkIn && (
                        <span className="text-xs text-gray-400">
                          {(s.checkIn.timestamp?.toDate?.() ?? new Date(s.checkIn.timestamp)).toLocaleTimeString()}
                        </span>
                      )}
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isMissed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {isMissed ? 'Missed / Not recorded' : 'Checked In'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Schedules tab */}
      {activeTab === 'schedules' && (
        <>
          {schedules.length === 0 ? (
            <EmptyState icon="📅" title="No check-in schedules" message="Create a schedule to track staff attendance." />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Time</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Location</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Applies To</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map((sch) => (
                    <tr key={sch.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-gray-900">{sch.time}</td>
                      <td className="px-5 py-3.5 text-gray-600">{sch.locationLabel}</td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">
                        {sch.appliesTo?.map(staffName).join(', ') ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setDeleteTarget(sch)}
                          className="text-red-500 hover:text-red-700 font-medium text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* New Schedule Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Check-in Schedule">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
              <input
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Label</label>
              <input
                required
                value={form.locationLabel}
                onChange={(e) => setForm((f) => ({ ...f, locationLabel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Main Entrance"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Applies To</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded p-1.5">
                  <input
                    type="checkbox"
                    checked={form.appliesTo.includes(s.id)}
                    onChange={() => toggleStaff(s.id)}
                    className="rounded text-emerald-600"
                  />
                  <span className="text-sm text-gray-700">{s.name}</span>
                </label>
              ))}
              {staff.length === 0 && <p className="text-sm text-gray-400">No active staff in this branch.</p>}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Schedule'}
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
