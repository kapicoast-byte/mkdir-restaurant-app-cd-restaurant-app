// Owner: manage all staff across all branches
//
// HOW STAFF AUTH WORKS
// ─────────────────────
// Firebase Auth does not allow one signed-in user to create another — so we
// use a persistent secondary Firebase app instance (secondaryAuth) that runs
// alongside the owner's primary session without affecting it.
//
// Create staff flow:
//   1. Save /staff Firestore doc (no authUid yet)
//   2. createUserWithEmailAndPassword(secondaryAuth, email, code) → uid
//   3. signOut(secondaryAuth)  ← always clean up immediately
//   4. updateDoc /staff/{id} { authUid: uid }
//   5. setDoc /users/{uid}     ← AuthContext reads this on login
//   6. Show the STF-XXXX code to owner in a modal
//
// Reset code flow:
//   • If authUid exists:  signIn(secondaryAuth) → updateEmail + updatePassword → signOut
//   • If authUid missing: createUser(secondaryAuth) → signOut → get uid
//   • updateDoc /staff/{id} { staffCode, authUid }
//   • Show new code to owner in a modal with copy button
import { useEffect, useRef, useState } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, setDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  updateEmail,
  signOut,
} from 'firebase/auth';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { db, secondaryAuth } from '../../firebase/config';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const ROLES = ['manager', 'trustedManager', 'staff'];
const FILTER_PILLS = ['All', 'manager', 'trustedManager', 'staff'];

function staffAuthEmail(staffCode) {
  return `${staffCode.toLowerCase()}@staff.restaurant.app`;
}

function generateStaffCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'STF-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Role styling ─────────────────────────────────────────────────────────────
const ROLE_BADGE = {
  owner:          { bg: '#FFF7ED', color: '#EA580C', label: 'Owner' },
  trustedManager: { bg: '#F5F3FF', color: '#7C3AED', label: 'Trusted Mgr' },
  manager:        { bg: '#EFF6FF', color: '#2563EB', label: 'Manager' },
  staff:          { bg: '#F9FAFB', color: '#6B7280', label: 'Staff' },
  kitchen:        { bg: '#F0FDF4', color: '#16A34A', label: 'Kitchen' },
  floor:          { bg: '#FFFBEB', color: '#D97706', label: 'Floor' },
  cleaning:       { bg: '#F8FAFC', color: '#64748B', label: 'Cleaning' },
};

const AVATAR_BG = {
  owner:          '#F97316',
  trustedManager: '#8B5CF6',
  manager:        '#3B82F6',
  staff:          '#6B7280',
  kitchen:        '#22C55E',
  floor:          '#F59E0B',
  cleaning:       '#94A3B8',
};

function RoleBadge({ role }) {
  const style = ROLE_BADGE[role] ?? ROLE_BADGE.staff;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

function Avatar({ name, role, size = 36 }) {
  const initials = name
    ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const bg = AVATAR_BG[role] ?? AVATAR_BG.staff;
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.35, backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}

// ── Input style ──────────────────────────────────────────────────────────────
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

const emptyForm = { name: '', role: 'staff', branchId: '' };

export default function OwnerStaff() {
  const [staff,             setStaff]             = useState([]);
  const [branches,          setBranches]          = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [modalOpen,         setModalOpen]         = useState(false);
  const [editTarget,        setEditTarget]        = useState(null);
  const [form,              setForm]              = useState(emptyForm);
  const [saving,            setSaving]            = useState(false);
  const [deactivateTarget,  setDeactivateTarget]  = useState(null);
  const [codeViewTarget,    setCodeViewTarget]    = useState(null);
  const [resettingId,       setResettingId]       = useState(null);
  const [copied,            setCopied]            = useState(false);
  const [qrTarget,          setQrTarget]          = useState(null);
  const [filterRole,        setFilterRole]        = useState('All');
  const [search,            setSearch]            = useState('');

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

  const openAdd  = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s) => { setEditTarget(s); setForm({ name: s.name, role: s.role, branchId: s.branchId }); setModalOpen(true); };

  // ── Create / Edit ─────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTarget) {
        await updateDoc(doc(db, 'staff', editTarget.id), {
          name: form.name.trim(), role: form.role, branchId: form.branchId,
        });
        toast.success('Staff updated');
        setModalOpen(false);
        return;
      }

      const code  = generateStaffCode();
      const email = staffAuthEmail(code);

      const staffRef = await addDoc(collection(db, 'staff'), {
        name: form.name.trim(), role: form.role, branchId: form.branchId,
        staffCode: code, isActive: true, permissionOverrides: {},
        authUid: null, createdAt: serverTimestamp(),
      });

      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, code);
        uid = cred.user.uid;
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }

      await updateDoc(doc(db, 'staff', staffRef.id), { authUid: uid });
      await setDoc(doc(db, 'users', uid), {
        name: form.name.trim(), email, role: form.role,
        branchId: form.branchId, staffId: staffRef.id, createdAt: serverTimestamp(),
      });

      setModalOpen(false);
      setCodeViewTarget({ id: staffRef.id, name: form.name.trim(), staffCode: code });
      toast.success('Staff member created');
    } catch (err) {
      console.error('[OwnerStaff] create error:', err);
      toast.error(
        err.code === 'auth/email-already-in-use'
          ? 'A login account for this code already exists. Try again (a new code will be generated).'
          : `Failed to create staff: ${err.message}`
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Reset Code ────────────────────────────────────────────────────────────
  const handleResetCode = async (s) => {
    setResettingId(s.id);
    try {
      const newCode  = generateStaffCode();
      const newEmail = staffAuthEmail(newCode);
      let   uid      = null;

      let stepAFailed = false;
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newCode);
        uid = cred.user.uid;
      } catch (createErr) {
        stepAFailed = true;
        console.log('[ResetCode] Step A failed:', createErr.code);
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }

      if (stepAFailed) {
        const oldEmail = staffAuthEmail(s.staffCode);
        let stepBFailed = false;
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, oldEmail, s.staffCode);
          uid = cred.user.uid;
          await updateEmail(cred.user, newEmail);
          await updatePassword(cred.user, newCode);
        } catch (signInErr) {
          stepBFailed = true;
          console.log('[ResetCode] Step B failed:', signInErr.code);
        } finally {
          await signOut(secondaryAuth).catch(() => {});
        }

        if (stepBFailed) {
          const safeEmail = `${newCode.toLowerCase()}-${Date.now()}@staff.restaurant.app`;
          try {
            const cred = await createUserWithEmailAndPassword(secondaryAuth, safeEmail, newCode);
            uid = cred.user.uid;
          } finally {
            await signOut(secondaryAuth).catch(() => {});
          }
        }
      }

      if (!uid) throw new Error('Could not obtain a valid Auth uid after all steps');

      await updateDoc(doc(db, 'staff', s.id), { staffCode: newCode, authUid: uid });
      await setDoc(doc(db, 'users', uid), {
        name: s.name, email: newEmail, role: s.role,
        branchId: s.branchId, staffId: s.id, createdAt: serverTimestamp(),
      }, { merge: true });

      setCodeViewTarget({ ...s, staffCode: newCode, authUid: uid });
      toast.success('Code reset successfully');
    } catch (err) {
      console.error('[OwnerStaff] reset code error:', err);
      toast.error(`Failed to reset code: ${err.message}`);
    } finally {
      setResettingId(null);
    }
  };

  // ── Deactivate / Reactivate ───────────────────────────────────────────────
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

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return <LoadingSpinner message="Loading staff..." />;

  // ── Filter + search ───────────────────────────────────────────────────────
  const filtered = staff.filter((s) => {
    if (filterRole !== 'All' && s.role !== filterRole) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pillLabel = (r) => {
    if (r === 'All') return 'All';
    return ROLE_BADGE[r]?.label ?? r;
  };

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
            style={{ color: 'var(--text-faint)' }}
          >
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ ...inputStyle, paddingLeft: '32px' }}
            onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        <button
          onClick={openAdd}
          className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap"
          style={{ backgroundColor: 'var(--color-primary)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
        >
          + Add Staff
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_PILLS.map((pill) => {
          const active = filterRole === pill;
          return (
            <button
              key={pill}
              onClick={() => setFilterRole(pill)}
              className="px-3 py-1 rounded-full text-sm font-medium transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                  : { backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }
              }
            >
              {pillLabel(pill)}
            </button>
          );
        })}
      </div>

      {/* Staff list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title={staff.length === 0 ? 'No staff yet' : 'No results'}
          message={staff.length === 0 ? 'Add your first staff member to get started.' : 'Try adjusting your search or filters.'}
        />
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface2)' }}>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Name</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Role</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide hidden md:table-cell" style={{ color: 'var(--text-sub)' }}>Branch</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide hidden lg:table-cell" style={{ color: 'var(--text-sub)' }}>Code</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => (
                <tr
                  key={s.id}
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  {/* Name + avatar */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} role={s.role} />
                      <span className="font-medium" style={{ color: 'var(--text)' }}>
                        {s.name}
                      </span>
                    </div>
                  </td>

                  {/* Role badge */}
                  <td className="px-5 py-3.5">
                    <RoleBadge role={s.role} />
                  </td>

                  {/* Branch */}
                  <td className="px-5 py-3.5 hidden md:table-cell" style={{ color: 'var(--text-sub)' }}>
                    {branchName(s.branchId)}
                  </td>

                  {/* Staff code */}
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    <button
                      onClick={() => setCodeViewTarget(s)}
                      className="font-mono text-xs px-2 py-0.5 rounded transition-colors"
                      style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-sub)', border: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                    >
                      {s.staffCode ?? '—'}
                    </button>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={
                        s.isActive
                          ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                          : { backgroundColor: 'var(--surface2)', color: 'var(--text-faint)' }
                      }
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 justify-end flex-wrap">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: 'var(--color-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-dark)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-primary)'}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setQrTarget(s)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#8B5CF6' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#7C3AED'}
                        onMouseLeave={e => e.currentTarget.style.color = '#8B5CF6'}
                      >
                        QR
                      </button>
                      <button
                        onClick={() => handleResetCode(s)}
                        disabled={resettingId === s.id}
                        className="text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ color: '#D97706' }}
                        onMouseEnter={e => { if (resettingId !== s.id) e.currentTarget.style.color = '#B45309'; }}
                        onMouseLeave={e => e.currentTarget.style.color = '#D97706'}
                      >
                        {resettingId === s.id ? 'Resetting…' : 'Reset'}
                      </button>
                      {s.isActive ? (
                        <button
                          onClick={() => setDeactivateTarget(s)}
                          className="text-xs font-medium transition-colors"
                          style={{ color: '#EF4444' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                          onMouseLeave={e => e.currentTarget.style.color = '#EF4444'}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(s)}
                          className="text-xs font-medium transition-colors"
                          style={{ color: '#16A34A' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#15803D'}
                          onMouseLeave={e => e.currentTarget.style.color = '#16A34A'}
                        >
                          Reactivate
                        </button>
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
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Staff' : 'Add Staff'}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Full Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. Jane Smith"
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-sub)' }}>Branch</label>
            <select
              required
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            >
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {!editTarget && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--text-faint)', backgroundColor: 'var(--surface2)' }}>
              A Firebase Auth account and STF-XXXX login code will be generated automatically.
            </p>
          )}
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
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'; }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
            >
              {saving ? 'Creating…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Staff Code Modal */}
      <Modal
        isOpen={!!codeViewTarget}
        onClose={() => { setCodeViewTarget(null); setCopied(false); }}
        title="Staff Login Code"
        size="sm"
      >
        {codeViewTarget && (
          <div className="space-y-4">
            <div className="rounded-xl p-5 text-center" style={{ backgroundColor: 'var(--surface2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-sub)' }}>Code for {codeViewTarget.name}</p>
              <p className="text-3xl font-mono font-bold tracking-widest" style={{ color: 'var(--text)' }}>
                {codeViewTarget.staffCode}
              </p>
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
              Staff enter this code on the Staff Login tab. Codes never expire — only reset or deactivation stops access.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => copyCode(codeViewTarget.staffCode)}
                className="flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-primary)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                onClick={() => handleResetCode(codeViewTarget)}
                disabled={resettingId === codeViewTarget.id}
                className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', backgroundColor: 'transparent' }}
              >
                {resettingId === codeViewTarget.id ? 'Generating…' : 'New Code'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={!!qrTarget}
        onClose={() => setQrTarget(null)}
        title="Staff QR Code"
        size="sm"
      >
        {qrTarget && (() => {
          const loginUrl = `${window.location.origin}/login?code=${qrTarget.staffCode}`;

          const handleDownload = () => {
            const canvas = document.getElementById('qr-download-canvas');
            if (!canvas) return;
            const link = document.createElement('a');
            link.download = `${qrTarget.name.replace(/\s+/g, '-')}-qr.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
          };

          const handlePrint = () => {
            const printWindow = window.open('', '_blank', 'width=400,height=500');
            printWindow.document.write(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>QR Code — ${qrTarget.name}</title>
                  <style>
                    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: white; }
                    h2 { font-size: 22px; margin-bottom: 4px; }
                    p  { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
                    code { font-family: monospace; font-size: 18px; font-weight: bold; letter-spacing: 4px; background: #f3f4f6; padding: 6px 14px; border-radius: 8px; margin-top: 16px; display: inline-block; }
                  </style>
                </head>
                <body>
                  <h2>${qrTarget.name}</h2>
                  <p>Scan to log in instantly</p>
                  <img src="${document.getElementById('qr-download-canvas')?.toDataURL('image/png')}" width="200" height="200" />
                  <code>${qrTarget.staffCode}</code>
                </body>
              </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
          };

          return (
            <div className="space-y-4">
              <div
                className="flex flex-col items-center gap-3 rounded-xl p-6"
                style={{ backgroundColor: 'var(--surface2)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{qrTarget.name}</p>
                <QRCodeSVG
                  value={loginUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#111111"
                  level="M"
                  includeMargin
                />
                <QRCodeCanvas
                  id="qr-download-canvas"
                  value={loginUrl}
                  size={400}
                  bgColor="#ffffff"
                  fgColor="#111111"
                  level="M"
                  includeMargin
                  style={{ display: 'none' }}
                />
                <p className="font-mono text-lg font-bold tracking-widest" style={{ color: 'var(--text)' }}>
                  {qrTarget.staffCode}
                </p>
                <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                  Scan with camera to open login page
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
                >
                  Download PNG
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', backgroundColor: 'transparent' }}
                >
                  Print
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivateTarget}
        title="Deactivate Staff Member"
        message={`Are you sure you want to deactivate ${deactivateTarget?.name}? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
