// Manager: create, edit, delete, and filter tasks for their branch
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const STATUSES = ['pending', 'in progress', 'pending photo review', 'completed', 'overdue'];

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  'in progress': 'bg-blue-100 text-blue-700',
  'pending photo review': 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

const emptyForm = {
  title: '',
  description: '',
  assignedTo: '',
  dueTime: '',
  requiresPhoto: false,
};

export default function Tasks() {
  const { branchId, user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!branchId) return;
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId)),
      (snap) => { setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId), where('isActive', '==', true)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubTasks(); unsubStaff(); };
  }, [branchId]);

  const openAdd = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (t) => {
    setEditTarget(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      assignedTo: t.assignedTo ?? '',
      dueTime: t.dueTime ? new Date(t.dueTime).toISOString().slice(0, 16) : '',
      requiresPhoto: t.requiresPhoto ?? false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        assignedTo: form.assignedTo,
        dueTime: form.dueTime ? new Date(form.dueTime).toISOString() : null,
        requiresPhoto: form.requiresPhoto,
        branchId,
      };
      if (editTarget) {
        await updateDoc(doc(db, 'tasks', editTarget.id), payload);
        toast.success('Task updated');
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...payload,
          status: 'pending',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
        toast.success('Task created');
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'tasks', deleteTarget.id));
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const staffName = (id) => staff.find((s) => s.id === id)?.name ?? '—';

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  if (loading) return <LoadingSpinner message="Loading tasks..." />;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Manage and track all tasks for your branch"
        action={
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + New Task
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {['all', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === s
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState icon="✅" title="No tasks here" message={filter === 'all' ? 'Create your first task to get started.' : `No tasks with status "${filter}".`} />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((t) => (
            <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{t.title}</h3>
                  {t.requiresPhoto && (
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">Photo required</span>
                  )}
                </div>
                {t.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{t.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>👤 {staffName(t.assignedTo)}</span>
                  {t.dueTime && (
                    <span className={new Date(t.dueTime) < new Date() && t.status !== 'completed' ? 'text-red-500 font-medium' : ''}>
                      ⏰ {new Date(t.dueTime).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <select
                  value={t.status}
                  onChange={(e) => handleStatusChange(t.id, e.target.value)}
                  className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(t)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                  <button onClick={() => setDeleteTarget(t)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Form Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Task' : 'New Task'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Clean kitchen surfaces"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="Optional task details..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
              <select
                required
                value={form.assignedTo}
                onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select staff</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date &amp; Time</label>
              <input
                type="datetime-local"
                value={form.dueTime}
                onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, requiresPhoto: !f.requiresPhoto }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.requiresPhoto ? 'bg-emerald-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.requiresPhoto ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <label className="text-sm font-medium text-gray-700">Requires photo proof</label>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
