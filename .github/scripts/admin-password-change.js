// admin-password-change.js
// Runs every 5 minutes from GitHub Actions (free — the repo is public).
// Processes admin password-change requests: an admin (Majid) sets a NEW
// password for a player directly from the Dashboard — no reset email.
// The Dashboard writes a doc to `admin_requests` (type "setPassword",
// status "pending") with the new password in plaintext; this worker
// sets it via the Firebase Admin SDK, marks the doc "done" (or "failed"
// with an honest error), and DELETES the plaintext password field so no
// password ever lingers in Firestore. The admin NEVER sees a player's
// current password (Firebase Auth stores it one-way hashed — it cannot
// be retrieved by anyone).
// Auth: the Firebase Admin SDK — with the FIREBASE_SERVICE_ACCOUNT secret
// when set, otherwise Application Default Credentials (GitHub Actions
// OIDC / Workload Identity). The Admin SDK bypasses Firestore rules.
// The password-set operation is idempotent (setting the same password
// twice has the same result), so overlapping runs are harmless.
'use strict';

const admin = require('firebase-admin');

const MIN_PASSWORD_LEN = 6;
const MAX_PASSWORD_LEN = 128;

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  } else {
    admin.initializeApp({ projectId: 'studio-5633829332-99f59' }); // Application Default Credentials (GitHub Actions OIDC / Workload Identity) — projectId is explicit because the WIF credentials file has none
  }
  const db = admin.firestore();
  const auth = admin.auth();
  let done = 0, failed = 0;

  let snap;
  try {
    // Two equality filters only — no composite index needed.
    snap = await db.collection('admin_requests')
      .where('type', '==', 'setPassword')
      .where('status', '==', 'pending')
      .get();
  } catch (e) {
    console.error('admin_requests scan failed', e.message);
    process.exit(1); // fatal: the scan itself failed — surface it
  }

  for (const doc of snap.docs) {
    const r = doc.data() || {};
    const targetUid = typeof r.targetUid === 'string' ? r.targetUid : '';
    const newPassword = typeof r.newPassword === 'string' ? r.newPassword : '';
    // Validate before touching Auth: a bad request is marked failed
    // (and the plaintext is still deleted) — never retried forever.
    if (!targetUid || newPassword.length < MIN_PASSWORD_LEN || newPassword.length > MAX_PASSWORD_LEN) {
      try {
        await doc.ref.update({
          status: 'failed',
          error: !targetUid ? 'لا معرّف حساب للاعب.' : 'كلمة المرور الجديدة غير صالحة (يجب أن تكون 6 أحرف على الأقل).',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          newPassword: admin.firestore.FieldValue.delete(),
        });
        failed++;
        console.log('failed (invalid request)', doc.id);
      } catch (e) {
        failed++;
        console.error('failed to mark invalid', doc.id, e.message);
      }
      continue;
    }
    // Confirm the user exists before setting (a deleted account is a
    // clean failure, not a crash).
    let user;
    try {
      user = await auth.getUser(targetUid);
    } catch (e) {
      const code = (e && e.code) || '';
      try {
        await doc.ref.update({
          status: 'failed',
          error: code === 'auth/user-not-found' ? 'حساب اللاعب غير موجود.' : ('تعذّر التحقق من الحساب: ' + code),
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          newPassword: admin.firestore.FieldValue.delete(),
        });
      } catch (e2) { console.error('failed to mark not-found', doc.id, e2.message); }
      failed++;
      console.log('failed (user not found)', doc.id, targetUid);
      continue;
    }
    try {
      await auth.updateUser(user.uid, { password: newPassword });
      await doc.ref.update({
        status: 'done',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        newPassword: admin.firestore.FieldValue.delete(),
      });
      done++;
      console.log('done', doc.id, targetUid);
    } catch (e) {
      try {
        await doc.ref.update({
          status: 'failed',
          error: 'تعذّر تغيير كلمة المرور: ' + (e.code || e.message || 'خطأ غير معروف'),
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          newPassword: admin.firestore.FieldValue.delete(),
        });
      } catch (e2) { console.error('failed to mark error', doc.id, e2.message); }
      failed++;
      console.log('failed (updateUser)', doc.id, e.code || e.message);
    }
  }

  console.log(`done: done=${done} failed=${failed}`);
}

main().catch(e => { console.error('fatal', e); process.exit(1); });
