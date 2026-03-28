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
  doc, serverTimestamp, query, orderBy, getDoc
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
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const ROLES = ['manager', 'trustedManager', 'staff'];

// Derives stable Firebase Auth email from STF-XXXX code
function staffAuthEmail(staffCode) {
  return `${staffCode.toLowerCase()}@staff.restaurant.app`;
}

function generateStaffCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'STF-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const emptyForm = { name: '', role: 'staff', branchId: '' };

export default function OwnerStaff() {
  const [staff, setStaff]               = useState([]);
  const [branches, setBranches]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [codeViewTarget, setCodeViewTarget]     = useState(null);
  const [resettingId, setResettingId]   = useState(null);
  const [copied, setCopied]             = useState(false);
  const [qrTarget, setQrTarget]         = useState(null);
  const qrCanvasRef                     = useRef(null);

  useEffect(() => {
    const unsubStaff = onSnapshot(
      query(collection(db, 'staff'), orderBy('name')),
      (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubStaff(); unsubBranches(); };
  }, []);

  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';

  const openAdd  = () => { setEditTarget(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s) => {
    setEditTarget(s);
    setForm({ name: s.name, role: s.role, branchId: s.branchId });
    setModalOpen(true);
  };

  // ── Create / Edit ────────────────────────────────────────────────────────────
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
        setModalOpen(false);
        return;
      }

      // ── New staff member ──────────────────────────────────────────────────
      const code  = generateStaffCode();
      const email = staffAuthEmail(code);

      // 1. Save to Firestore first to get a stable doc ID
      const staffRef = await addDoc(collection(db, 'staff'), {
        name:               form.name.trim(),
        role:               form.role,
        branchId:           form.branchId,
        staffCode:          code,
        isActive:           true,
        permissionOverrides: {},
        authUid:            null,
        createdAt:          serverTimestamp(),
      });

      // 2. Create Firebase Auth account using secondary app
      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, code);
        uid = cred.user.uid;
      } finally {
        // Always sign out secondary — never leave it signed in
        await signOut(secondaryAuth).catch(() => {});
      }

      // 3. Link authUid back to the staff doc
      await updateDoc(doc(db, 'staff', staffRef.id), { authUid: uid });

      // 4. Create /users/{uid} so AuthContext can load the profile on login
      await setDoc(doc(db, 'users', uid), {
        name:      form.name.trim(),
        email,
        role:      form.role,
        branchId:  form.branchId,
        staffId:   staffRef.id,
        createdAt: serverTimestamp(),
      });

      // 5. Show the code to the owner
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

  // ── Reset Code ────────────────────────────────────────────────────────────────
  // Strategy: always try to create fresh first, fall back to update, fall back to
  // collision-safe create. This handles every possible Auth account state.
  const handleResetCode = async (s) => {
    setResettingId(s.id);
    try {
      const newCode  = generateStaffCode();
      const newEmail = staffAuthEmail(newCode);
      let   uid      = null;

      // ── STEP A: Try creating a brand-new Auth account ──────────────────────
      // Succeeds when no Auth account exists for this email (most common for
      // legacy staff like "jayanth" whose authUid was never set properly).
      let stepAFailed = false;
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newCode);
        uid = cred.user.uid;
        console.log('[ResetCode] Step A success — new account created, uid:', uid);
      } catch (createErr) {
        stepAFailed = true;
        console.log('[ResetCode] Step A failed:', createErr.code);
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }

      // ── STEP B: Account already exists — try sign-in then update ──────────
      if (stepAFailed) {
        const oldEmail = staffAuthEmail(s.staffCode);
        let stepBFailed = false;
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, oldEmail, s.staffCode);
          uid = cred.user.uid;
          await updateEmail(cred.user, newEmail);
          await updatePassword(cred.user, newCode);
          console.log('[ResetCode] Step B success — account updated, uid:', uid);
        } catch (signInErr) {
          stepBFailed = true;
          console.log('[ResetCode] Step B failed:', signInErr.code);
        } finally {
          await signOut(secondaryAuth).catch(() => {});
        }

        // ── STEP B2: Sign-in failed — create with collision-safe email ───────
        if (stepBFailed) {
          const safeEmail = `${newCode.toLowerCase()}-${Date.now()}@staff.restaurant.app`;
          try {
            const cred = await createUserWithEmailAndPassword(secondaryAuth, safeEmail, newCode);
            uid = cred.user.uid;
            console.log('[ResetCode] Step B2 — collision-safe account created, uid:', uid);
          } finally {
            await signOut(secondaryAuth).catch(() => {});
          }
        }
      }

      if (!uid) throw new Error('Could not obtain a valid Auth uid after all steps');

      // ── STEP C: Update Firestore ───────────────────────────────────────────
      await updateDoc(doc(db, 'staff', s.id), { staffCode: newCode, authUid: uid });

      // Upsert /users/{uid} (handles both new uid and existing uid)
      await setDoc(doc(db, 'users', uid), {
        name:      s.name,
        email:     newEmail,
        role:      s.role,
        branchId:  s.branchId,
        staffId:   s.id,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // Show new code to owner
      setCodeViewTarget({ ...s, staffCode: newCode, authUid: uid });
      toast.success('Code reset successfully');

    } catch (err) {
      console.error('[OwnerStaff] reset code error:', err);
      toast.error(`Failed to reset code: ${err.message}`);
    } finally {
      setResettingId(null);
    }
  };

  // ── Deactivate / Reactivate ───────────────────────────────────────────────────
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

  // ── Copy code to clipboard ────────────────────────────────────────────────────
  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
                      <button
                        onClick={() => openEdit(s)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setQrTarget(s)}
                        className="text-purple-600 hover:text-purple-800 font-medium text-xs"
                      >
                        QR Code
                      </button>
                      <button
                        onClick={() => handleResetCode(s)}
                        disabled={resettingId === s.id}
                        className="text-amber-600 hover:text-amber-800 font-medium text-xs disabled:opacity-50"
                      >
                        {resettingId === s.id ? 'Resetting…' : 'Reset Code'}
                      </button>
                      {s.isActive ? (
                        <button
                          onClick={() => setDeactivateTarget(s)}
                          className="text-red-500 hover:text-red-700 font-medium text-xs"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(s)}
                          className="text-green-600 hover:text-green-800 font-medium text-xs"
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
          {!editTarget && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              A Firebase Auth account and STF-XXXX login code will be generated automatically.
            </p>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Staff Code Modal — shown after create and after reset */}
      <Modal
        isOpen={!!codeViewTarget}
        onClose={() => { setCodeViewTarget(null); setCopied(false); }}
        title="Staff Login Code"
        size="sm"
      >
        {codeViewTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Code for {codeViewTarget.name}</p>
              <p className="text-3xl font-mono font-bold text-gray-900 tracking-widest">
                {codeViewTarget.staffCode}
              </p>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Staff enter this code on the Staff Login tab. The code is also their password.
              Codes never expire — only reset or deactivation stops access.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => copyCode(codeViewTarget.staffCode)}
                className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                onClick={() => handleResetCode(codeViewTarget)}
                disabled={resettingId === codeViewTarget.id}
                className="flex-1 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {resettingId === codeViewTarget.id ? 'Generating…' : 'Generate New Code'}
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
              <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-xl p-6">
                <p className="text-sm font-semibold text-gray-700">{qrTarget.name}</p>
                {/* Visible SVG QR */}
                <QRCodeSVG
                  value={loginUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#1e1b4b"
                  level="M"
                  includeMargin
                />
                {/* Hidden canvas for download/print */}
                <QRCodeCanvas
                  id="qr-download-canvas"
                  value={loginUrl}
                  size={400}
                  bgColor="#ffffff"
                  fgColor="#1e1b4b"
                  level="M"
                  includeMargin
                  style={{ display: 'none' }}
                />
                <p className="font-mono text-lg font-bold tracking-widest text-gray-800">
                  {qrTarget.staffCode}
                </p>
                <p className="text-xs text-gray-400 text-center">Scan with camera to open login page</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Download PNG
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
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
