// Manager: create, edit, delete, and filter tasks for their branch.
// Includes a dedicated "Photo Review" tab for approving / rejecting
// tasks with status "pending photo review".
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

const STATUSES = ['pending', 'in progress', 'pending photo review', 'completed', 'overdue', 'flagged', 'photo rejected'];

const STATUS_COLORS = {
  'pending':              'bg-yellow-100 text-yellow-700',
  'in progress':          'bg-blue-100 text-blue-700',
  'pending photo review': 'bg-purple-100 text-purple-700',
  'completed':            'bg-green-100 text-green-700',
  'overdue':              'bg-red-100 text-red-700',
  'flagged':              'bg-orange-100 text-orange-700',
  'photo rejected':       'bg-red-100 text-red-600',
};

const emptyForm = {
  title: '',
  description: '',
  assignedTo: '',
  dueTime: '',
  type: 'general',
  requiresPhoto: false,
};

const TASK_TYPES = ['general', 'cleaning', 'kitchen', 'service', 'stock', 'maintenance'];

// ── Photo Review Card ─────────────────────────────────────────────────────────
function PhotoReviewCard({ task, staffName, onApprove, onReject }) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Purple accent for pending review */}
        <div className="h-1 bg-purple-400" />

        <div className="p-4 flex gap-4">
          {/* Thumbnail */}
          <button
            onClick={() => setLightbox(true)}
            className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-200 hover:opacity-80 transition-opacity"
            title="View full size"
          >
            {task.photoUrl ? (
              <img src={task.photoUrl} alt="Task proof" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">📷</div>
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">👤 {staffName}</p>
            {task.description && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</p>
            )}
          </div>
        </div>

        {/* Action row */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={() => onApprove(task)}
            className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => onReject(task)}
            className="flex-1 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
          >
            ❌ Reject
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && task.photoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none"
            onClick={() => setLightbox(false)}
          >
            ×
          </button>
          <img
            src={task.photoUrl}
            alt="Full size"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ── Rejection Modal ───────────────────────────────────────────────────────────
function RejectModal({ task, onConfirm, onClose, saving }) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg text-gray-900 mb-1">Reject Photo</h3>
        <p className="text-sm text-gray-500 mb-4">"{task?.title}"</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Why are you rejecting this?
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Photo is blurry, wrong area shown..."
          autoFocus
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || saving}
            className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Rejecting…' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { branchId, user } = useAuth();
  const [tasks,       setTasks]       = useState([]);
  const [staff,       setStaff]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('all');  // 'all' | 'photo_review' | status string
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(emptyForm);
  const [saving,      setSaving]      = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);  // task being rejected
  const [rejecting,   setRejecting]   = useState(false);

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
  const openEdit = (task) => {
    setEditTarget(task);
    setForm({
      title:         task.title,
      description:   task.description ?? '',
      assignedTo:    task.assignedTo ?? '',
      dueTime:       task.dueTime ? new Date(task.dueTime).toISOString().slice(0, 16) : '',
      type:          task.type ?? 'general',
      requiresPhoto: task.requiresPhoto ?? false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // form.assignedTo holds the Firestore staff doc id (used by the <select>).
      // Firestore security rules check  assignedTo == request.auth.uid  which is
      // the Firebase Auth uid — a different value.  Look it up from the staff list.
      const selectedStaff = staff.find((s) => s.id === form.assignedTo);
      const assignedToUid = selectedStaff?.authUid ?? form.assignedTo; // authUid = Firebase Auth uid

      const payload = {
        title:             form.title.trim(),
        description:       form.description.trim(),
        assignedTo:        assignedToUid,     // Firebase Auth UID — matches rules & staff portal query
        assignedToStaffId: form.assignedTo,   // Firestore doc ID  — for name display lookups
        dueTime:           form.dueTime ? new Date(form.dueTime).toISOString() : null,
        type:              form.type,
        requiresPhoto:     form.requiresPhoto,
        branchId,
      };
      if (editTarget) {
        await updateDoc(doc(db, 'tasks', editTarget.id), payload);
        toast.success('Task updated');
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...payload,
          status:    'pending',
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
    } catch {
      toast.error('Failed to update status');
    }
  };

  // ── Photo Review actions ───────────────────────────────────────────────────
  const handleApprove = async (task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), { status: 'completed' });
      toast.success('Photo approved — task marked complete');
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleRejectConfirm = async (reason) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await updateDoc(doc(db, 'tasks', rejectTarget.id), {
        status:          'photo rejected',
        rejectionReason: reason,
      });
      toast.success('Photo rejected — staff will be notified');
      setRejectTarget(null);
    } catch {
      toast.error('Failed to reject');
    } finally {
      setRejecting(false);
    }
  };

  // Resolves name from either a Firestore doc ID or a Firebase Auth UID.
  // New tasks store assignedToStaffId (doc id); legacy tasks may have only assignedTo.
  const staffName = (task) => {
    const docId  = task?.assignedToStaffId ?? task?.assignedTo;
    const authId = task?.assignedTo;
    return staff.find((s) => s.id === docId || s.authUid === authId)?.name ?? '—';
  };

  const pendingReviewTasks = tasks.filter((t) => t.status === 'pending photo review');

  const filteredTasks = activeTab === 'all'
    ? tasks
    : activeTab === 'photo_review'
      ? pendingReviewTasks
      : tasks.filter((t) => t.status === activeTab);

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

      {/* ── Filter tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-5">
        {/* Standard tabs */}
        {['all', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setActiveTab(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              activeTab === s
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === 'pending photo review' ? 'pending review' : s}
          </button>
        ))}
        {/* Photo Review tab */}
        <button
          onClick={() => setActiveTab('photo_review')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
            activeTab === 'photo_review'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
          }`}
        >
          📷 Photo Review
          {pendingReviewTasks.length > 0 && (
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
              activeTab === 'photo_review' ? 'bg-white text-purple-700' : 'bg-purple-600 text-white'
            }`}>
              {pendingReviewTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Photo Review view ────────────────────────────────────────────── */}
      {activeTab === 'photo_review' ? (
        pendingReviewTasks.length === 0 ? (
          <EmptyState icon="📷" title="No photos to review" message="All submitted photos have been reviewed." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingReviewTasks.map((task) => (
              <PhotoReviewCard
                key={task.id}
                task={task}
                staffName={staffName(task)}
                onApprove={handleApprove}
                onReject={(t) => setRejectTarget(t)}
              />
            ))}
          </div>
        )
      ) : (
        /* ── Standard task list ─────────────────────────────────────────── */
        filteredTasks.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No tasks here"
            message={activeTab === 'all' ? 'Create your first task to get started.' : `No tasks with status "${activeTab}".`}
          />
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`bg-white rounded-xl p-4 shadow-sm border flex items-start gap-4 ${
                  task.status === 'photo rejected' ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
                    {task.requiresPhoto && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                        Photo required
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                  )}
                  {/* Rejection reason */}
                  {task.status === 'photo rejected' && task.rejectionReason && (
                    <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-semibold text-red-700 mb-0.5">Rejection reason</p>
                      <p className="text-xs text-red-600">{task.rejectionReason}</p>
                    </div>
                  )}
                  {/* Flagged note */}
                  {task.status === 'flagged' && task.flagNote && (
                    <div className="mb-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-xs font-semibold text-orange-700 mb-0.5">Flag note</p>
                      <p className="text-xs text-orange-600">{task.flagNote}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>👤 {staffName(task)}</span>
                    {task.dueTime && (
                      <span className={new Date(task.dueTime) < new Date() && task.status !== 'completed' ? 'text-red-500 font-medium' : ''}>
                        ⏰ {new Date(task.dueTime).toLocaleString()}
                      </span>
                    )}
                    {task.type && task.type !== 'general' && (
                      <span className="capitalize">🏷 {task.type}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {/* Photo thumbnail if attached */}
                  {task.photoUrl && (
                    <a href={task.photoUrl} target="_blank" rel="noreferrer">
                      <img src={task.photoUrl} alt="proof" className="w-10 h-10 rounded object-cover border border-gray-200 hover:opacity-80" />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(task)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                    <button onClick={() => setDeleteTarget(task)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Task Form Modal ──────────────────────────────────────────────── */}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 capitalize"
            >
              {TASK_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
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
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Rejection modal ──────────────────────────────────────────────── */}
      {rejectTarget && (
        <RejectModal
          task={rejectTarget}
          saving={rejecting}
          onConfirm={handleRejectConfirm}
          onClose={() => !rejecting && setRejectTarget(null)}
        />
      )}
    </div>
  );
}
