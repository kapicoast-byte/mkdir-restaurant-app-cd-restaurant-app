// Owner: manage all staff across all branches
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const ROLES = ['manager', 'trustedManager', 'staff'];

// Generate unique STF-XXXX code
function generateStaffCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'STF-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const emptyForm = { name: '', role: 'staff', branchId: '' };

export default function OwnerStaff() {
  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [codeViewTarget, setCodeViewTarget] = useState(null);

  useEffect(() => {
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), orderBy('name')),
      (snap) => { setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubStaff(); unsubBranches(); };
  }, []);

  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';

  const openAdd = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s) => {
    setEditTarget(s);
    setForm({ name: s.name, role: s.role, branchId: s.branchId });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(db, 'staff', editTarget.id), {
          name: form.name.trim(),
          role: form.role,
          branchId: form.branchId,
        });
        toast.success('Staff updated');
      } else {
        const code = generateStaffCode();
        // Code expires in 7 days
        const codeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await addDoc(collection(db, 'staff'), {
          name: form.name.trim(),
          role: form.role,
          branchId: form.branchId,
          staffCode: code,
          codeExpiresAt: codeExpiresAt,
          isActive: true,
          permissionOverrides: {},
          createdAt: serverTimestamp(),
        });
        toast.success(`Staff added — code: ${code}`);
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCode = async (s) => {
    const code = generateStaffCode();
    const codeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      await updateDoc(doc(db, 'staff', s.id), { staffCode: code, codeExpiresAt });
      toast.success(`New code generated: ${code}`);
      setCodeViewTarget({ ...s, staffCode: code });
    } catch {
      toast.error('Failed to reset code');
    }
  };

  const handleDeactivate = async () => {
    try {
      await updateDoc(doc(db, 'staff', deactivateTarget.id), { isActive: false });
      toast.success(`${deactivateTarget.name} deactivated`);
    } catch {
      toast.error('Failed to deactivate');
    } finally {
      setDeactivateTarget(null);
    }
  };

  const handleReactivate = async (s) => {
    try {
      await updateDoc(doc(db, 'staff', s.id), { isActive: true });
      toast.success(`${s.name} reactivated`);
    } catch {
      toast.error('Failed to reactivate');
    }
  };

  if (loading) return <LoadingSpinner message="Loading staff..." />;

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="All staff members across all branches"
        action={
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Staff
          </button>
        }
      />

      {staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff yet" message="Add your first staff member to get started." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Branch</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Staff Code</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{s.name}</td>
                  <td className="px-5 py-3.5 text-gray-600 capitalize">{s.role}</td>
                  <td className="px-5 py-3.5 text-gray-600">{branchName(s.branchId)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setCodeViewTarget(s)}
                      className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
                    >
                      {s.staffCode ?? '—'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(s)} className="text-indigo-600 hover:text-indigo-800 font-medium text-xs">Edit</button>
                      {s.isActive ? (
                        <button onClick={() => setDeactivateTarget(s)} className="text-red-500 hover:text-red-700 font-medium text-xs">Deactivate</button>
                      ) : (
                        <button onClick={() => handleReactivate(s)} className="text-green-600 hover:text-green-800 font-medium text-xs">Reactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Staff' : 'Add Staff'} size="sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Jane Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
            <select
              required
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Staff Code Modal */}
      <Modal isOpen={!!codeViewTarget} onClose={() => setCodeViewTarget(null)} title="Staff ID Code" size="sm">
        {codeViewTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Code for {codeViewTarget.name}</p>
              <p className="text-3xl font-mono font-bold text-gray-900 tracking-widest">{codeViewTarget.staffCode}</p>
              {codeViewTarget.codeExpiresAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Expires: {new Date(codeViewTarget.codeExpiresAt?.toDate?.() ?? codeViewTarget.codeExpiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => handleResetCode(codeViewTarget)}
              className="w-full py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Generate New Code
            </button>
          </div>
        )}
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivateTarget}
        title="Deactivate Staff Member"
        message={`Are you sure you want to deactivate ${deactivateTarget?.name}? They will no longer appear in active lists.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
