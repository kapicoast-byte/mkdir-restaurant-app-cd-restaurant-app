// Owner: manage restaurant branches — list, add, edit, delete
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const emptyForm = { name: '', location: '' };

// ── Input style helper ───────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '14px',
  outline: 'none',
};

export default function Branches() {
  const { user } = useAuth();
  const [branches,     setBranches]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'branches'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const openAdd = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (branch) => {
    setEditTarget(branch);
    setForm({ name: branch.name, location: branch.location });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(db, 'branches', editTarget.id), {
          name: form.name.trim(),
          location: form.location.trim(),
        });
        toast.success('Branch updated');
      } else {
        await addDoc(collection(db, 'branches'), {
          name: form.name.trim(),
          location: form.location.trim(),
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
        toast.success('Branch added');
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'branches', deleteTarget.id));
      toast.success('Branch deleted');
    } catch {
      toast.error('Failed to delete branch');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) return <LoadingSpinner message="Loading branches..." />;

  return (
    <div className="space-y-6">

      {/* Page actions row */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          Manage all your restaurant locations
        </p>
        <button
          onClick={openAdd}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + Add Branch
        </button>
      </div>

      {/* Content */}
      {branches.length === 0 ? (
        <EmptyState icon="🏢" title="No branches yet" message="Add your first branch to get started." />
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface2)' }}>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Name</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Location</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {branches.map((branch, idx) => (
                <tr
                  key={branch.id}
                  style={{
                    borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text)' }}>
                    {branch.name}
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-sub)' }}>
                    {branch.location}
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-faint)' }}>
                    {branch.createdAt?.toDate
                      ? branch.createdAt.toDate().toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEdit(branch)}
                        className="text-sm font-medium transition-colors"
                        style={{ color: 'var(--color-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-dark)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-primary)'}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(branch)}
                        className="text-sm font-medium transition-colors"
                        style={{ color: '#EF4444' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                        onMouseLeave={e => e.currentTarget.style.color = '#EF4444'}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Branch' : 'Add Branch'}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>
              Branch Name
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. Downtown Branch"
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>
              Location
            </label>
            <input
              required
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. 123 Main St, City"
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
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
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'; }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Branch"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
