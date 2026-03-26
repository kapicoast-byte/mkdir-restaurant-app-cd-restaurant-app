/**
 * Firebase Cloud Functions — Staff Auth Management
 *
 * createStaffAuth  — called by owner to create a Firebase Auth account for a
 *                    new staff member after the /staff Firestore doc is added.
 *
 * resetStaffAuth   — called by owner / trustedManager to rotate a staff
 *                    member's STF-XXXX code.  Handles both the case where an
 *                    Auth account already exists and the (legacy) case where
 *                    authUid was never written.
 *
 * Both functions use the Firebase Admin SDK which bypasses client Auth and
 * Firestore security rules — no secondary-app workarounds needed.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }       = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const adminAuth = getAuth();
const db        = getFirestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateStaffCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'STF-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function staffAuthEmail(staffCode) {
  return `${staffCode.toLowerCase()}@staff.restaurant.app`;
}

/** Verify the caller is authenticated and fetch their Firestore role. */
async function getCallerRole(auth) {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const snap = await db.collection('users').doc(auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Caller user document not found.');
  }
  return snap.data().role;
}

// ── createStaffAuth ───────────────────────────────────────────────────────────

/**
 * Input:  { staffCode: string, staffId: string }
 * Action: Create Firebase Auth account → update /staff/{staffId}.authUid
 *         → create /users/{uid} doc.
 * Return: { success: true, uid: string }
 * Auth:   owners only
 */
exports.createStaffAuth = onCall(async (request) => {
  const callerRole = await getCallerRole(request.auth);
  if (callerRole !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can create staff accounts.');
  }

  const { staffCode, staffId } = request.data;
  if (!staffCode || !staffId) {
    throw new HttpsError('invalid-argument', 'staffCode and staffId are required.');
  }

  const email    = staffAuthEmail(staffCode);
  const password = staffCode;

  // Fetch the existing /staff doc to copy profile fields into /users
  const staffSnap = await db.collection('staff').doc(staffId).get();
  if (!staffSnap.exists) {
    throw new HttpsError('not-found', `Staff document ${staffId} not found.`);
  }
  const staffData = staffSnap.data();

  // Create the Firebase Auth account (Admin SDK — no client session affected)
  let userRecord;
  try {
    userRecord = await adminAuth.createUser({ email, password, displayName: staffData.name });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      // Idempotent: look up the existing account so we can still link it
      userRecord = await adminAuth.getUserByEmail(email);
    } else {
      throw new HttpsError('internal', `Auth creation failed: ${err.message}`);
    }
  }

  const uid = userRecord.uid;

  // Link authUid back to the /staff doc
  await db.collection('staff').doc(staffId).update({ authUid: uid });

  // Create /users/{uid} so AuthContext can load the profile on login
  await db.collection('users').doc(uid).set({
    name:      staffData.name,
    email,
    role:      staffData.role,
    branchId:  staffData.branchId,
    staffId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, uid };
});

// ── resetStaffAuth ────────────────────────────────────────────────────────────

/**
 * Input:  { staffId: string }
 * Action: Generate new STF-XXXX code → update or create Auth account
 *         → update /staff/{staffId} → update /users/{uid}.email.
 * Return: { success: true, newCode: string }
 * Auth:   owners and trustedManagers
 */
exports.resetStaffAuth = onCall(async (request) => {
  const callerRole = await getCallerRole(request.auth);
  if (callerRole !== 'owner' && callerRole !== 'trustedManager') {
    throw new HttpsError('permission-denied', 'Only owners and trusted managers can reset codes.');
  }

  const { staffId } = request.data;
  if (!staffId) {
    throw new HttpsError('invalid-argument', 'staffId is required.');
  }

  const staffSnap = await db.collection('staff').doc(staffId).get();
  if (!staffSnap.exists) {
    throw new HttpsError('not-found', `Staff document ${staffId} not found.`);
  }
  const staffData = staffSnap.data();

  const newCode  = generateStaffCode();
  const newEmail = staffAuthEmail(newCode);

  let uid = staffData.authUid || null;

  if (uid) {
    // Auth account exists — update email and password in place
    try {
      await adminAuth.updateUser(uid, { email: newEmail, password: newCode });
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Auth record was deleted externally — fall through to create a fresh one
        uid = null;
      } else {
        throw new HttpsError('internal', `Auth update failed: ${err.message}`);
      }
    }
  }

  if (!uid) {
    // No Auth account (or was deleted) — create one now
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email:       newEmail,
        password:    newCode,
        displayName: staffData.name,
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        userRecord = await adminAuth.getUserByEmail(newEmail);
        // Update password for this account in case it was left in an old state
        await adminAuth.updateUser(userRecord.uid, { password: newCode });
      } else {
        throw new HttpsError('internal', `Auth creation failed: ${err.message}`);
      }
    }
    uid = userRecord.uid;

    // Create missing /users/{uid} doc
    await db.collection('users').doc(uid).set({
      name:      staffData.name,
      email:     newEmail,
      role:      staffData.role,
      branchId:  staffData.branchId,
      staffId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Keep /users/{uid} email field in sync
    await db.collection('users').doc(uid).update({ email: newEmail });
  }

  // Update /staff doc with new code and confirmed authUid
  await db.collection('staff').doc(staffId).update({
    staffCode: newCode,
    authUid:   uid,
  });

  return { success: true, newCode };
});
