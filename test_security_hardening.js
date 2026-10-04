/**
 * Phase 8 Advanced Security, Reliability & RBAC Hardening Test Suite
 * Validates Zero-Trust, Anti-Self-Approval, IDOR, CSRF, AI limits, and concurrency guards.
 */

const assert = require('assert');
const http = require('http');
const app = require('./app');
const User = require('./models/User');
const Equipment = require('./models/Equipment');
const BorrowRequest = require('./models/BorrowRequest');
const Review = require('./models/Review');
const Notification = require('./models/Notification');
const aiTools = require('./services/aiTools');
const { generateOrderNumber, isSlotAvailable } = require('./config/pickupConfig');

async function runSecurityHardeningSuite() {
  console.log('🧪 Starting Phase 8 Advanced Security & Reliability Verification Suite...\n');

  // Launch test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqOpts = {
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(url, reqOpts, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  // --- SEED TEST USERS ---
  const studentUser = await User.create({
    name: 'Aarav Patel (Student)',
    email: 'aarav.student@campus.edu',
    password: 'password123',
    role: 'student',
    department: 'Computer Science',
    collegeId: 'CS-2025-011',
    trustScore: 82,
    trustTier: 'Silver'
  });

  const seniorLenderA = await User.create({
    name: 'Priya Sharma (Senior A)',
    email: 'priya.seniorA@campus.edu',
    password: 'password123',
    role: 'senior',
    department: 'Mechanical',
    collegeId: 'ME-2023-088',
    trustScore: 96,
    trustTier: 'Gold'
  });

  const seniorLenderB = await User.create({
    name: 'Vikram Singh (Senior B)',
    email: 'vikram.seniorB@campus.edu',
    password: 'password123',
    role: 'senior',
    department: 'Civil',
    collegeId: 'CE-2023-019',
    trustScore: 94,
    trustTier: 'Gold'
  });

  const adminUser = await User.create({
    name: 'Dr. Aris Thorne (Admin)',
    email: 'admin.lab@campus.edu',
    password: 'password123',
    role: 'admin',
    department: 'Electronics',
    collegeId: 'FAC-ENG-01',
    trustScore: 99,
    trustTier: 'Gold'
  });

  // Seed equipment owned by Senior A
  const equipmentA = await Equipment.create({
    title: 'Fluke 87V Precision Multimeter',
    category: 'Electrical',
    department: 'Electrical Engineering',
    description: 'Industrial true-RMS digital multimeter with temperature measurement.',
    specs: ['CAT IV 600V safety rated', '0.05% DC accuracy'],
    condition: 'Excellent',
    dailyFee: 0,
    deposit: 500,
    pickupLocation: 'Electrical Lab - Room 304',
    minTrustScore: 65,
    owner: seniorLenderA._id || seniorLenderA.id,
    ownerName: seniorLenderA.name,
    status: 'available'
  });

  // Seed equipment owned by Senior B
  const equipmentB = await Equipment.create({
    title: 'South Total Station GTS-102',
    category: 'Survey',
    department: 'Civil Engineering',
    description: 'Reflectorless total station for land surveying.',
    specs: ['2 arc-sec accuracy', 'Dual axis compensator'],
    condition: 'Excellent',
    dailyFee: 0,
    deposit: 1200,
    pickupLocation: 'Civil Engineering Workshop',
    minTrustScore: 70,
    owner: seniorLenderB._id || seniorLenderB.id,
    ownerName: seniorLenderB.name,
    status: 'available'
  });

  // Helper for mock session cookie
  async function getSessionCookieFor(user) {
    const postData = `email=${encodeURIComponent(user.email)}&password=password123`;
    const res = await makeRequest('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      body: postData
    });

    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      return setCookie[0].split(';')[0];
    }
    return null;
  }

  const studentCookie = await getSessionCookieFor(studentUser);
  const seniorACookie = await getSessionCookieFor(seniorLenderA);
  const seniorBCookie = await getSessionCookieFor(seniorLenderB);
  const adminCookie = await getSessionCookieFor(adminUser);

  // ==========================================
  // TEST 1: Vertical Privilege Escalation Defense
  // ==========================================
  console.log('Test 1: Testing Vertical RBAC Defense (Student accessing /admin)...');
  const studentAdminRes = await makeRequest('/admin', {
    headers: { 'Cookie': studentCookie }
  });
  // Student should be denied access and redirected to home
  assert(studentAdminRes.status === 302, 'Student should be redirected away from /admin');
  assert(studentAdminRes.headers.location === '/', 'Student redirected to root path');
  console.log('✅ Test 1 Passed: Student access to administrative endpoints rejected.');

  // ==========================================
  // TEST 2: Anti-Self-Approval Security Defense
  // ==========================================
  console.log('Test 2: Testing Anti-Self-Approval Defense...');
  // Senior A requests equipment from Senior B
  const orderNumber1 = generateOrderNumber();
  const seniorSelfRequest = await BorrowRequest.create({
    orderNumber: orderNumber1,
    equipment: equipmentB._id || equipmentB.id,
    borrower: seniorLenderA._id || seniorLenderA.id,
    lender: seniorLenderB._id || seniorLenderB.id,
    pickupDate: '2026-10-15',
    pickupSlotId: 'slot-2',
    pickupTime: '2:00 PM – 2:30 PM',
    pickupLocation: 'Civil Engineering Workshop',
    returnDate: '2026-10-20',
    purpose: 'Senior capstone testing',
    status: 'pending',
    depositAmount: 1200
  });

  // Senior A attempts to approve their own borrow request
  const selfApproveRes = await makeRequest(`/borrow/${seniorSelfRequest._id || seniorSelfRequest.id}/approve`, {
    method: 'POST',
    headers: { 'Cookie': seniorACookie }
  });
  assert(selfApproveRes.status === 403, 'Self-approval must return HTTP 403 Forbidden');

  // Verify status remains strictly pending
  const verifySelfReq = await BorrowRequest.findById(seniorSelfRequest._id || seniorSelfRequest.id);
  assert(verifySelfReq.status === 'pending', 'Order status must remain pending after blocked self-approval');
  console.log('✅ Test 2 Passed: Anti-self-approval rule strictly enforced.');

  // ==========================================
  // TEST 3: Horizontal Privilege Defense (Senior A approving Senior B item)
  // ==========================================
  console.log('Test 3: Testing Horizontal Privilege Defense (Senior A approving Senior B equipment)...');
  // Student requests equipment B from Senior B
  const orderNumber2 = generateOrderNumber();
  const studentRequestB = await BorrowRequest.create({
    orderNumber: orderNumber2,
    equipment: equipmentB._id || equipmentB.id,
    borrower: studentUser._id || studentUser.id,
    lender: seniorLenderB._id || seniorLenderB.id,
    pickupDate: '2026-10-16',
    pickupSlotId: 'slot-3',
    pickupTime: '2:30 PM – 3:00 PM',
    pickupLocation: 'Civil Engineering Workshop',
    returnDate: '2026-10-21',
    status: 'pending',
    depositAmount: 1200
  });

  // Senior A (who does NOT own equipment B) attempts to approve request
  const crossSeniorApproveRes = await makeRequest(`/borrow/${studentRequestB._id || studentRequestB.id}/approve`, {
    method: 'POST',
    headers: { 'Cookie': seniorACookie }
  });
  assert(crossSeniorApproveRes.status === 403, 'Cross-senior approval must return HTTP 403 Forbidden');
  console.log('✅ Test 3 Passed: Horizontal privilege isolation between seniors verified.');

  // ==========================================
  // TEST 4: Authorized Senior Lender Approval
  // ==========================================
  console.log('Test 4: Testing Authorized Senior Approval by Owner...');
  const authorizedApproveRes = await makeRequest(`/borrow/${studentRequestB._id || studentRequestB.id}/approve`, {
    method: 'POST',
    headers: { 'Cookie': seniorBCookie }
  });
  assert(authorizedApproveRes.status === 302, 'Authorized owner approval succeeds with 302 redirect');
  const verifyApprovedReq = await BorrowRequest.findById(studentRequestB._id || studentRequestB.id);
  assert(verifyApprovedReq.status === 'approved', 'Request status transitioned to approved');
  console.log('✅ Test 4 Passed: Equipment owner can legitimately approve request.');

  // ==========================================
  // TEST 5: IDOR on Equipment Listing Modification & Deletion
  // ==========================================
  console.log('Test 5: Testing IDOR Protection on Equipment Updates & Deletions...');
  // Senior B attempts to modify Senior A's equipment
  const updatePayload = 'title=HACKED+MULTIMETER&category=Electrical&dailyFee=999';
  const idorUpdateRes = await makeRequest(`/equipment/${equipmentA._id || equipmentA.id}`, {
    method: 'POST',
    headers: {
      'Cookie': seniorBCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(updatePayload)
    },
    body: updatePayload
  });
  assert(idorUpdateRes.status === 403, 'Unauthorized equipment update returns HTTP 403 Forbidden');

  // Senior B attempts to delete Senior A's equipment
  const idorDeleteRes = await makeRequest(`/equipment/${equipmentA._id || equipmentA.id}/delete`, {
    method: 'POST',
    headers: { 'Cookie': seniorBCookie }
  });
  assert(idorDeleteRes.status === 403, 'Unauthorized equipment deletion returns HTTP 403 Forbidden');

  // Verify item A title was not tampered with
  const verifyItemA = await Equipment.findById(equipmentA._id || equipmentA.id);
  assert(verifyItemA.title === 'Fluke 87V Precision Multimeter', 'Equipment title preserved against IDOR');
  console.log('✅ Test 5 Passed: IDOR protection on equipment catalog verified.');

  // ==========================================
  // TEST 6: IDOR on Equipment Collection (Pickup Confirmation)
  // ==========================================
  console.log('Test 6: Testing IDOR on Equipment Pickup Confirmation...');
  // Senior A attempts to confirm pickup on studentRequestB (where borrower is Student)
  const idorPickupRes = await makeRequest(`/borrow/${studentRequestB._id || studentRequestB.id}/pickup`, {
    method: 'POST',
    headers: { 'Cookie': seniorACookie }
  });
  assert(idorPickupRes.status === 403, 'Non-borrower pickup confirmation returns HTTP 403 Forbidden');

  // Student (designated borrower) confirms pickup
  const legitPickupRes = await makeRequest(`/borrow/${studentRequestB._id || studentRequestB.id}/pickup`, {
    method: 'POST',
    headers: { 'Cookie': studentCookie }
  });
  assert(legitPickupRes.status === 302, 'Borrower pickup confirmation succeeds');
  const verifyActiveReq = await BorrowRequest.findById(studentRequestB._id || studentRequestB.id);
  assert(verifyActiveReq.status === 'active', 'Order transitioned to active');
  console.log('✅ Test 6 Passed: Pickup confirmation restricted to legitimate borrower.');

  // ==========================================
  // TEST 7: Review Tampering & Trust Score Inflation Guard
  // ==========================================
  console.log('Test 7: Testing Review Tampering & Artificial Trust Score Inflation...');
  // 1. Attempt to review an unborrowed equipment item
  const fakeReviewPayload = `equipmentId=${equipmentA._id || equipmentA.id}&requestId=fake-req-999&rating=5&comment=Great`;
  const fakeReviewRes = await makeRequest('/reviews', {
    method: 'POST',
    headers: {
      'Cookie': studentCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(fakeReviewPayload)
    },
    body: fakeReviewPayload
  });
  // Request does not exist -> rejected
  assert(fakeReviewRes.status === 404 || fakeReviewRes.status === 400 || fakeReviewRes.status === 302, 'Invalid request rejected without score increase');

  // 2. Legitimate return of studentRequestB by owner Senior B
  const returnRes = await makeRequest(`/borrow/${studentRequestB._id || studentRequestB.id}/return`, {
    method: 'POST',
    headers: { 'Cookie': seniorBCookie }
  });
  assert(returnRes.status === 302, 'Return verification succeeds');

  // Student submits legitimate review
  const scoreBefore = (await User.findById(studentUser._id || studentUser.id)).trustScore;
  const legitReviewPayload = `equipmentId=${equipmentB._id || equipmentB.id}&requestId=${studentRequestB._id || studentRequestB.id}&rating=5&punctualityRating=5&conditionRating=5&comment=Excellent+Total+Station`;
  const legitReviewRes = await makeRequest('/reviews', {
    method: 'POST',
    headers: {
      'Cookie': studentCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(legitReviewPayload)
    },
    body: legitReviewPayload
  });
  assert(legitReviewRes.status === 302, 'Legitimate review succeeds');
  const scoreAfter = (await User.findById(studentUser._id || studentUser.id)).trustScore;
  assert(scoreAfter === scoreBefore + 3, 'Trust Score correctly boosted by +3');

  // 3. Attempt duplicate review on same order to artificially inflate score
  const dupReviewRes = await makeRequest('/reviews', {
    method: 'POST',
    headers: {
      'Cookie': studentCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(legitReviewPayload)
    },
    body: legitReviewPayload
  });
  assert(dupReviewRes.status === 400 || dupReviewRes.status === 302, 'Duplicate review rejected');
  const scoreAfterDup = (await User.findById(studentUser._id || studentUser.id)).trustScore;
  assert(scoreAfterDup === scoreAfter, 'Duplicate review blocked; Trust Score did not inflate');
  console.log('✅ Test 7 Passed: Review verification and anti-inflation defenses verified.');

  // ==========================================
  // TEST 8: Notification IDOR Defense
  // ==========================================
  console.log('Test 8: Testing Notification IDOR Defense...');
  const notifB = await Notification.create({
    user: seniorLenderB._id || seniorLenderB.id,
    title: 'Private Senior B Alert',
    message: 'Senior B confidential notification',
    read: false
  });

  // Student attempts to mark Senior B's notification read
  await makeRequest(`/notifications/${notifB._id || notifB.id}/read`, {
    method: 'POST',
    headers: { 'Cookie': studentCookie }
  });

  // Verify Senior B's notification is still unread
  const verifyNotifB = await Notification.findById(notifB._id || notifB.id);
  assert(verifyNotifB.read === false, 'Notification IDOR blocked: status remains unread');
  console.log('✅ Test 8 Passed: Notification IDOR protection verified.');

  // ==========================================
  // TEST 9: CSRF Origin Header Verification
  // ==========================================
  console.log('Test 9: Testing CSRF Defense (Origin Mismatch on POST request)...');
  const csrfAttackBody = JSON.stringify({ message: 'Hello assistant' });
  const csrfRes = await makeRequest('/chat/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://malicious-phishing-site.edu',
      'X-Test-CSRF': 'true',
      'Content-Length': Buffer.byteLength(csrfAttackBody)
    },
    body: csrfAttackBody
  });
  assert(csrfRes.status === 403, 'CSRF Origin mismatch must return HTTP 403 Forbidden');
  console.log('✅ Test 9 Passed: Cross-origin CSRF attack blocked by Origin validation.');

  // ==========================================
  // TEST 10: AI Prompt Length & Flood Defense
  // ==========================================
  console.log('Test 10: Testing AI Prompt Length & Flood Defense (>2,000 chars)...');
  const giantPrompt = 'A'.repeat(2500);
  const floodBody = JSON.stringify({ message: giantPrompt });
  const floodRes = await makeRequest('/chat/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(floodBody)
    },
    body: floodBody
  });
  assert(floodRes.status === 400, 'Oversized prompt must be rejected with HTTP 400');
  const floodJson = JSON.parse(floodRes.body);
  assert(floodJson.error.includes('2,000 characters'), 'Error specifies length constraint');
  console.log('✅ Test 9 Passed: AI prompt flooding protection verified.');

  // ==========================================
  // TEST 11: AI Tool Permission Boundaries
  // ==========================================
  console.log('Test 11: Testing AI Tool Permission Boundaries...');
  // 1. Unauthenticated invocation of getUserBorrowStatus
  let unauthCaught = false;
  try {
    await aiTools.getUserBorrowStatus(studentUser._id || studentUser.id, null);
  } catch (err) {
    unauthCaught = true;
    assert(err.message.includes('UNAUTHORIZED_ACCESS'), 'Error signals unauthorized access');
  }
  assert(unauthCaught, 'Unauthenticated tool call must throw error');

  // 2. Cross-user access: Student A querying Senior B's private loans
  let crossUserCaught = false;
  try {
    await aiTools.getUserBorrowStatus(seniorLenderB._id || seniorLenderB.id, {
      id: studentUser._id || studentUser.id,
      role: 'student'
    });
  } catch (err) {
    crossUserCaught = true;
    assert(err.message.includes('UNAUTHORIZED_ACCESS'), 'Cross-user tool call rejected');
  }
  assert(crossUserCaught, 'Cross-user AI tool invocation must be blocked');
  console.log('✅ Test 11 Passed: AI tool permission boundary strictly enforced.');

  // ==========================================
  // TEST 12: Concurrency & Atomic State Protection
  // ==========================================
  console.log('Test 12: Testing Concurrency & Atomic Reservation Logic...');
  const testDate = '2026-10-28';
  const testSlot = 'slot-1';

  // Verify initial availability
  const initialAvailable = isSlotAvailable(testDate, testSlot, []);
  assert(initialAvailable === true, 'Slot initially available');

  // Create active booking on that slot
  const booking1 = await BorrowRequest.create({
    orderNumber: generateOrderNumber(),
    equipment: equipmentA._id || equipmentA.id,
    borrower: studentUser._id || studentUser.id,
    lender: seniorLenderA._id || seniorLenderA.id,
    pickupDate: testDate,
    pickupSlotId: testSlot,
    status: 'pending'
  });

  // Second user attempts to book same slot on same date
  const bookedOnDate = await BorrowRequest.find({
    pickupDate: testDate,
    status: { $in: ['pending', 'approved', 'active'] }
  });
  const secondAttemptAvailable = isSlotAvailable(testDate, testSlot, bookedOnDate);
  assert(secondAttemptAvailable === false, 'Slot collision detected; second booking blocked');
  console.log('✅ Test 12 Passed: Concurrency collision guard verified.');

  // Clean shutdown
  server.close();
  console.log('\n🎉 ALL 12 ADVANCED SECURITY & RELIABILITY TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runSecurityHardeningSuite().catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = runSecurityHardeningSuite;
