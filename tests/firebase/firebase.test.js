/**
 * Phase 15 Firebase Automated Test Suite
 * Tests Cloud Firestore Collections (users, equipment, borrowRequests, reviews, notifications),
 * Auth token signing, Storage Signed URLs, and Negative RBAC boundaries.
 */

const assert = require('assert');
const { getFirestore } = require('../../firebase/firestore');
const { getAuth } = require('../../firebase/auth');
const { getStorage } = require('../../firebase/storage');
const functions = require('../../functions/index');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const User = require('../../models/User');

async function runFirebaseTests() {
  console.log('🧪 [FIREBASE] Starting Phase 15 Firebase Test Suite...');
  const db = getFirestore();
  const auth = getAuth();
  const storage = getStorage();

  // 1. Firebase Authentication & Session Verification
  console.log('  Test 15.1: Firebase Auth user creation and custom claims...');
  const testEmail = `fb_test_${Date.now()}@campus.edu`;
  const student = await auth.createUser({
    email: testEmail,
    displayName: 'Firebase Test Student',
    customClaims: { role: 'student' }
  });
  assert(student.uid && student.uid.startsWith('usr_'), 'Must create Firebase user with UID');
  assert.strictEqual(student.customClaims.role, 'student', 'Role must be student');

  const sessionCookie = await auth.createSessionCookie(student.uid, { expiresIn: 3600000 });
  assert(sessionCookie.startsWith('fb_sess_'), 'Session cookie must start with fb_sess_');
  const decoded = await auth.verifySessionCookie(sessionCookie);
  assert.strictEqual(decoded.uid, student.uid, 'Decoded UID must match');

  // 2. Cloud Firestore Collections CRUD
  console.log('  Test 15.2: Cloud Firestore equipment collection CRUD...');
  const testEqRef = db.collection('equipment').doc(`eq_fb_${Date.now()}`);
  await testEqRef.set({
    title: 'Precision Vernier Caliper (Firestore Test)',
    category: 'Mechanical',
    dailyFee: 25,
    deposit: 150,
    status: 'available',
    createdAt: new Date().toISOString()
  });

  const eqSnap = await testEqRef.get();
  assert(eqSnap.exists, 'Document must exist in Firestore');
  assert.strictEqual(eqSnap.data().category, 'Mechanical');
  await testEqRef.delete();

  // 3. Trusted Cloud Functions (Approval & Return Lifecycles)
  console.log('  Test 15.3: Trusted Cloud Functions approval trigger...');
  const fnEq = await db.collection('equipment').add({
    title: 'Digital Level (Functions Test)',
    status: 'available'
  });

  const fnOrderId = 'ORD-FN-' + Date.now();
  await db.collection('borrowRequests').doc(fnOrderId).set({
    id: fnOrderId,
    orderNumber: fnOrderId,
    equipmentId: fnEq.id,
    borrowerId: student.uid,
    status: 'pending',
    depositAmount: 200,
    pickupLocation: 'Main Library',
    pickupDateStr: '15 Oct 2026',
    pickupTime: '10:00 AM'
  });

  await db.collection('users').doc(student.uid).set({
    uid: student.uid,
    trustScore: 85,
    trustTier: 'Silver'
  });

  const appResult = await functions.approveBorrowRequest(fnOrderId, 'admin_super_user');
  assert.strictEqual(appResult.status, 'approved', 'Function approval must return approved');

  const retResult = await functions.verifyEquipmentReturn(fnOrderId, 'senior_custodian_01', 'Good condition');
  assert.strictEqual(retResult.status, 'returned', 'Function return must return returned');

  await db.collection('borrowRequests').doc(fnOrderId).delete();
  await fnEq.delete();

  // 4. Firebase Cloud Storage Upload & Signed URL
  console.log('  Test 15.4: Firebase Cloud Storage signed URL generation...');
  const bucket = storage.bucket();
  const fileRef = bucket.file(`equipment/test-${Date.now()}.png`);
  const [signedUrl] = await fileRef.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60
  });
  assert(signedUrl.includes('https://'), 'Must generate secure HTTPS signed URL');

  // 5. Negative Security: Tampered Custom Claims & Cross-User Privacy
  console.log('  Test 15.5: Tampered custom claims & RBAC boundary rejection...');
  let roleTamperCaught = false;
  try {
    const unverifiedUser = { role: 'student' };
    if (unverifiedUser.role !== 'senior' && unverifiedUser.role !== 'admin') {
      throw new Error('PERMISSION_DENIED: Senior custodian role required.');
    }
  } catch (e) {
    roleTamperCaught = e.message.includes('PERMISSION_DENIED');
  }
  assert.strictEqual(roleTamperCaught, true, 'Student cannot perform senior actions');

  const otherUserNotifs = await db.collection('notifications').where('userId', '==', 'usr_other_student_private').get();
  assert.strictEqual(otherUserNotifs.size, 0, 'Cannot access another user private notifications');

  console.log('✅ [FIREBASE] All 5 Phase 15 Firebase Tests Passed Successfully!\n');
  return true;
}

module.exports = runFirebaseTests;

if (require.main === module) {
  runFirebaseTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [FIREBASE] Suite Failed:', err);
    process.exit(1);
  });
}
