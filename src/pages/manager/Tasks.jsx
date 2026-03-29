// Manager: create, edit, delete, and filter tasks for their branch.
import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const STATUSES    = ['pending', 'in progress', 'pending photo review', 'completed', 'overdue', 'flagged', 'photo rejected'];
const TASK_TYPES  = ['general', 'cleaning', 'kitchen', 'service', 'stock', 'maintenance'];

const FILTER_TABS = [
  { key: 'all',                  label: 'All' },
  { key: 'pending',              label: 'Pending' },
  { key: 'in progress',          label: 'In Progress' },
  { key: 'overdue',              label: 'Overdue' },
  { key: 'flagged',              label: 'Flagged' },
  { key: 'pending photo review', label: 'Photo Review' },
  { key: 'completed',            label: 'Completed' },
];

const STATUS_STYLE = {
  'pending':              { bg: '#FFFBEB', color: '#CA8A04' },
  'in progress':          { bg: '#EFF6FF', color: '#2563EB' },
  'pending photo review': { bg: '#F5F3FF', color: '#7C3AED' },
  'completed':            { bg: '#F0FDF4', color: '#16A34A' },
  'overdue':              { bg: '#FEF2F2', color: '#DC2626' },
  'flagged':              { bg: '#FFF7ED', color: '#EA580C' },
  'photo rejected':       { bg: '#FEF2F2', color: '#DC2626' },
};

const TASK_TYPE_ICON = {
  general: '📋', cleaning: '🧹', kitchen: '🍳',
  service: '🛎️', stock: '📦', maintenance: '🔧',
};

const AVATAR_BG = {
  owner: '#F97316', trustedManager: '#8B5CF6', manager: '#3B82F6',
  staff: '#6B7280', kitchen: '#22C55E', floor: '#F59E0B', cleaning: '#94A3B8',
};

const emptyForm = {
  title: '', description: '', assignedTo: '',
  dueTime: '', type: 'general', requiresPhoto: false,
};

// ── Input style ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
};

function StaffMini({ name, role }) {
  const initials = name
    ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const bg = AVATAR_BG[role] ?? AVATAR_BG.staff;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white font-bold flex-shrink-0"
        style={{ fontSize: '9px', backgroundColor: bg }}
      >
        {initials}
      </span>
      <span>{name ?? '—'}</span>
    </span>
  );
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? { bg: 'var(--surface2)', color: 'var(--text-sub)' };
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {status === 'pending photo review' ? 'Photo Review' : status}
    </span>
  );
}

export default function Tasks() {
  const { branchId, user } = useAuth();
  const [tasks,        setTasks]        = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState('all');
  const [search,       setSearch]       = useState('');
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
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

  const openAdd  = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (task) => {
    setEditTarget(task);
    setForm({
      title:         task.title,
      description:   task.description ?? '',
      assignedTo:    task.assignedToStaffId ?? task.assignedTo ?? '',
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
      const selectedStaff = staff.find((s) => s.id === form.assignedTo);
      const assignedToUid = selectedStaff?.authUid ?? form.assignedTo;
      const payload = {
        title: form.title.trim(), description: form.description.trim(),
        assignedTo: assignedToUid, assignedToStaffId: form.assignedTo,
        dueTime: form.dueTime ? new Date(form.dueTime).toISOString() : null,
        type: form.type, requiresPhoto: form.requiresPhoto, branchId,
      };
      if (editTarget) {
        await updateDoc(doc(db, 'tasks', editTarget.id), payload);
        toast.success('Task updated');
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...payload, status: 'pending', createdBy: user.uid, createdAt: serverTimestamp(),
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

  const getStaff = (task) =>
    staff.find((s) => s.id === (task.assignedToStaffId ?? task.assignedTo) || s.authUid === task.assignedTo);

  const filteredTasks = tasks.filter((t) => {
    if (activeTab !== 'all' && t.status !== activeTab) return false;
    if (search) {
      const name = getStaff(t)?.name ?? '';
      if (!t.title.toLowerCase().includes(search.toLowerCase()) &&
          !name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const now = new Date();

  const pendingPhotoCount = tasks.filter((t) => t.status === 'pending photo review').length;

  if (loading) return <LoadingSpinner message="Loading tasks..." />;

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-faint)' }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            style={{ ...inputStyle, paddingLeft: '32px' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
        <button
          onClick={openAdd}
          className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors whitespace-nowrap"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + Create Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map(({ key, label }) => {
          const active = activeTab === key;
          const isPhoto = key === 'pending photo review';
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5"
              style={
                active
                  ? { backgroundColor: isPhoto ? '#8B5CF6' : 'var(--color-primary)', color: '#FFFFFF' }
                  : { backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
              }
            >
              {label}
              {isPhoto && pendingPhotoCount > 0 && (
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
                  style={active ? { backgroundColor: 'rgba(255,255,255,0.3)', color: '#FFF' } : { backgroundColor: '#8B5CF6', color: '#FFF' }}
                >
                  {pendingPhotoCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No tasks here"
          message={tasks.length === 0 ? 'Create your first task to get started.' : 'No tasks match the current filter.'}
        />
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const s         = getStaff(task);
            const isOverdue = task.status !== 'completed' && task.dueTime && new Date(task.dueTime) < now;
            const isFlagged = task.status === 'flagged';
            const isPhoto   = task.status === 'pending photo review' || task.status === 'photo rejected';

            let leftBorder = 'transparent';
            if (isOverdue)  leftBorder = '#EF4444';
            if (isFlagged)  leftBorder = 'var(--color-primary)';
            if (isPhoto)    leftBorder = '#8B5CF6';

            return (
              <div
                key={task.id}
                className="rounded-xl p-4 flex items-start gap-4"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeftWidth: '4px',
                  borderLeftColor: leftBorder !== 'transparent' ? leftBorder : 'var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                {/* Type icon */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--surface2)' }}
                >
                  {TASK_TYPE_ICON[task.type] ?? '📋'}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                      {task.title}
                    </h3>
                    {task.requiresPhoto && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-faint)' }}>
                        📷 Photo required
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs line-clamp-2 mb-1.5" style={{ color: 'var(--text-sub)' }}>
                      {task.description}
                    </p>
                  )}

                  {task.status === 'flagged' && task.flagNote && (
                    <div className="mb-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <span className="font-semibold" style={{ color: '#EA580C' }}>Flag: </span>
                      <span style={{ color: '#C2410C' }}>{task.flagNote}</span>
                    </div>
                  )}

                  {(task.status === 'photo rejected') && task.rejectionReason && (
                    <div className="mb-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                      <span className="font-semibold" style={{ color: '#DC2626' }}>Rejected: </span>
                      <span style={{ color: '#B91C1C' }}>{task.rejectionReason}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-sub)' }}>
                    {s && <StaffMini name={s.name} role={s.role} />}
                    {task.dueTime && (
                      <span style={{ color: isOverdue ? '#EF4444' : 'inherit', fontWeight: isOverdue ? '600' : 'normal' }}>
                        ⏰ {new Date(task.dueTime).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: status + photo + actions */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    className="text-xs font-semibold rounded-full cursor-pointer border-0 capitalize"
                    style={{
                      ...(STATUS_STYLE[task.status] ?? { bg: 'var(--surface2)', color: 'var(--text-sub)' }),
                      backgroundColor: (STATUS_STYLE[task.status] ?? {}).bg ?? 'var(--surface2)',
                      color: (STATUS_STYLE[task.status] ?? {}).color ?? 'var(--text-sub)',
                      padding: '2px 8px',
                    }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {task.photoUrl && (
                    <a href={task.photoUrl} target="_blank" rel="noreferrer">
                      <img src={task.photoUrl} alt="proof" className="w-10 h-10 rounded-lg object-cover border" style={{ borderColor: 'var(--border)' }} />
                    </a>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(task)}
                      className="text-xs font-medium transition-colors"
                      style={{ color: 'var(--color-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-dark)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-primary)'}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(task)}
                      className="text-xs font-medium transition-colors"
                      style={{ color: '#EF4444' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                      onMouseLeave={e => e.currentTarget.style.color = '#EF4444'}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Form Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Task' : 'New Task'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. Clean kitchen surfaces"
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{ ...inputStyle, resize: 'none' }}
              placeholder="Optional task details…"
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Assign To</label>
              <select
                required
                value={form.assignedTo}
                onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              >
                <option value="">Select staff</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Due Date &amp; Time</label>
              <input
                type="datetime-local"
                value={form.dueTime}
                onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Task Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>{TASK_TYPE_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Requires photo toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.requiresPhoto}
              onClick={() => setForm((f) => ({ ...f, requiresPhoto: !f.requiresPhoto }))}
              className="relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0"
              style={{
                backgroundColor: form.requiresPhoto ? 'var(--color-primary)' : 'var(--border2)',
                transition: 'background-color 200ms',
              }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
                style={{ transform: form.requiresPhoto ? 'translateX(24px)' : 'translateX(4px)', transition: 'transform 200ms' }}
              />
            </button>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Requires photo proof
            </label>
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
              {saving ? 'Saving…' : 'Save Task'}
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
