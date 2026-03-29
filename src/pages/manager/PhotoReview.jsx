// Manager: dedicated photo review page — approve or reject submitted task photos
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_BG = {
  owner: '#F97316', trustedManager: '#8B5CF6', manager: '#3B82F6',
  staff: '#6B7280', kitchen: '#22C55E', floor: '#F59E0B', cleaning: '#94A3B8',
};

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

function timeAgo(val) {
  if (!val) return '';
  const d = val?.toDate ? val.toDate() : new Date(val);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// ── Photo Card ────────────────────────────────────────────────────────────────
function PhotoCard({ task, staffMember, onApprove, onReject }) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: '3px solid #8B5CF6',
          boxShadow: 'var(--shadow)',
        }}
      >
        {/* Photo thumbnail */}
        <button
          onClick={() => setLightbox(true)}
          className="w-full block overflow-hidden"
          style={{ height: '160px', backgroundColor: 'var(--surface2)' }}
        >
          {task.photoUrl ? (
            <img
              src={task.photoUrl}
              alt="Task proof"
              className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">📷</div>
          )}
        </button>

        <div className="p-4">
          {/* Task title */}
          <h3 className="font-semibold text-sm mb-2 truncate" style={{ color: 'var(--text)' }}>
            {task.title}
          </h3>

          {/* Staff info */}
          <div className="flex items-center gap-2 mb-3">
            {staffMember && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                style={{ fontSize: '9px', backgroundColor: AVATAR_BG[staffMember.role] ?? AVATAR_BG.staff }}
              >
                {getInitials(staffMember.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                {staffMember?.name ?? '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {timeAgo(task.updatedAt ?? task.createdAt)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(task)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              style={{ backgroundColor: '#16A34A' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#15803D'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#16A34A'}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => onReject(task)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ color: '#DC2626', border: '1px solid #FECACA', backgroundColor: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              ❌ Reject
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && task.photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 text-white text-3xl" onClick={() => setLightbox(false)}>×</button>
          <img
            src={task.photoUrl}
            alt="Full size"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ task, onConfirm, onClose, saving }) {
  const [reason, setReason] = useState('');
  return (
    <Modal isOpen={!!task} onClose={onClose} title="Reject Photo" size="sm">
      {task && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-sub)' }}>"{task.title}"</p>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>
              Reason for rejection
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Photo is blurry, wrong area shown…"
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px', resize: 'none',
                border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
                color: 'var(--text)', fontSize: '14px', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#EF4444'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => reason.trim() && onConfirm(reason.trim())}
              disabled={!reason.trim() || saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#DC2626' }}
              onMouseEnter={e => { if (!saving && reason.trim()) e.currentTarget.style.backgroundColor = '#B91C1C'; }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#DC2626'}
            >
              {saving ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── History Card ──────────────────────────────────────────────────────────────
function HistoryCard({ task, staffMember }) {
  const [lightbox, setLightbox] = useState(false);
  const isApproved = task.status === 'completed';
  return (
    <>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: `3px solid ${isApproved ? '#16A34A' : '#DC2626'}`,
          boxShadow: 'var(--shadow)',
          opacity: 0.85,
        }}
      >
        <button
          onClick={() => task.photoUrl && setLightbox(true)}
          className="w-full block overflow-hidden"
          style={{ height: '120px', backgroundColor: 'var(--surface2)' }}
        >
          {task.photoUrl ? (
            <img src={task.photoUrl} alt="Task proof" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">📷</div>
          )}
        </button>
        <div className="p-3">
          <p className="text-xs font-semibold truncate mb-1" style={{ color: 'var(--text)' }}>{task.title}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{staffMember?.name ?? '—'}</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={isApproved
                ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                : { backgroundColor: '#FEF2F2', color: '#DC2626' }
              }
            >
              {isApproved ? '✅ Approved' : '❌ Rejected'}
            </span>
          </div>
          {task.rejectionReason && (
            <p className="text-xs mt-1 italic" style={{ color: '#DC2626' }}>{task.rejectionReason}</p>
          )}
        </div>
      </div>
      {lightbox && task.photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 text-white text-3xl" onClick={() => setLightbox(false)}>×</button>
          <img src={task.photoUrl} alt="Full size" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PhotoReview() {
  const { branchId } = useAuth();
  const [tasks,        setTasks]        = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejecting,    setRejecting]    = useState(false);
  const [tab,          setTab]          = useState('pending'); // 'pending' | 'history'

  useEffect(() => {
    if (!branchId) return;
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('branchId', '==', branchId)),
      (snap) => { setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), where('branchId', '==', branchId)),
      (snap) => setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubTasks(); unsubStaff(); };
  }, [branchId]);

  const getStaff = (task) =>
    staff.find((s) => s.id === (task.assignedToStaffId ?? task.assignedTo) || s.authUid === task.assignedTo);

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
        status: 'photo rejected', rejectionReason: reason,
      });
      toast.success('Photo rejected — staff will be notified');
      setRejectTarget(null);
    } catch {
      toast.error('Failed to reject');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading photos…" />;

  const pendingTasks = tasks.filter((t) => t.status === 'pending photo review');
  const historyTasks = tasks.filter((t) =>
    (t.status === 'completed' || t.status === 'photo rejected') && t.photoUrl
  ).sort((a, b) => {
    const ta = (a.updatedAt?.toDate?.() ?? new Date(a.updatedAt ?? 0)).getTime();
    const tb = (b.updatedAt?.toDate?.() ?? new Date(b.updatedAt ?? 0)).getTime();
    return tb - ta;
  }).slice(0, 20);

  return (
    <div className="space-y-5">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
            Review submitted task photos for your branch
          </p>
          {pendingTasks.length > 0 && (
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: '#8B5CF6' }}
            >
              {pendingTasks.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 w-fit" style={{ backgroundColor: 'var(--surface2)' }}>
        {[
          { key: 'pending', label: `Pending Review${pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ''}` },
          { key: 'history', label: 'History' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={
              tab === key
                ? { backgroundColor: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' }
                : { color: 'var(--text-sub)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        pendingTasks.length === 0 ? (
          <div
            className="rounded-xl py-16 flex flex-col items-center justify-center gap-4"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#F0FDF4' }}
            >
              <span className="text-3xl">✅</span>
            </div>
            <div className="text-center">
              <p className="font-semibold" style={{ color: 'var(--text)' }}>All photos reviewed!</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
                No pending photo submissions right now.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingTasks.map((task) => (
              <PhotoCard
                key={task.id}
                task={task}
                staffMember={getStaff(task)}
                onApprove={handleApprove}
                onReject={(t) => setRejectTarget(t)}
              />
            ))}
          </div>
        )
      )}

      {/* History tab */}
      {tab === 'history' && (
        historyTasks.length === 0 ? (
          <EmptyState icon="📋" title="No photo history" message="Approved and rejected photos will appear here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {historyTasks.map((task) => (
              <HistoryCard key={task.id} task={task} staffMember={getStaff(task)} />
            ))}
          </div>
        )
      )}

      {/* Reject modal */}
      <RejectModal
        task={rejectTarget}
        saving={rejecting}
        onConfirm={handleRejectConfirm}
        onClose={() => !rejecting && setRejectTarget(null)}
      />
    </div>
  );
}
