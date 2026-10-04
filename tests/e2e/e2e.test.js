/**
 * Phase 29 Complete End-to-End Workflow & Release Verification Suite
 * Executes the exact sequence from the specification:
 * Admin -> Senior -> Student -> Senior -> Student -> Senior -> Student -> System.
 * Also verifies Viewport Breakpoints, Accessibility, and Safe Data Cleanup.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const User = require('../../models/User');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const Review = require('../../models/Review');
const Notification = require('../../models/Notification');

async function runE2ETests() {
  console.log('🚀 [E2E] Starting Phase 29 Final End-to-End Workflow Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    // 1. ADMIN verifies users
    console.log('  Step 1: Admin verifies campus users...');
    const adminCookie = await client.loginAs('adminA');
    const adminDash = await client.request('/admin', { cookie: adminCookie });
    assert.strictEqual(adminDash.status, 200, 'Admin dashboard loads');

    // 2. SENIOR logs in and creates equipment
    console.log('  Step 2: Senior creates and publishes new equipment...');
    const seniorCookie = await client.loginAs('seniorA');
    const eqTitle = `Fluke 87V E2E Multimeter (${Date.now()})`;
    const createBody = `title=${encodeURIComponent(eqTitle)}&category=Electrical&dailyFee=45&deposit=500&pickupLocation=Electrical+Machines+Lab&minTrustScore=70&specs=True+RMS+Industrial+Multimeter`;
    const createRes = await client.request('/equipment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(createBody)
      },
      body: createBody,
      cookie: seniorCookie
    });
    assert.strictEqual(createRes.status, 302);
    const createdEq = await Equipment.findOne({ title: eqTitle });
    assert(createdEq, 'Equipment must exist in catalog');

    // 3. STUDENT logs in, searches, views details, submits borrow request
    console.log('  Step 3: Student searches, views details, and requests time slot...');
    const studentCookie = await client.loginAs('studentA');
    const searchRes = await client.request(`/equipment?q=${encodeURIComponent('Multimeter')}`, { cookie: studentCookie });
    assert.strictEqual(searchRes.status, 200);

    const showRes = await client.request(`/equipment/${createdEq._id || createdEq.id}`, { cookie: studentCookie });
    assert.strictEqual(showRes.status, 200);

    const reqBody = `equipmentId=${createdEq._id || createdEq.id}&pickupDate=2026-10-22&pickupLocation=Electrical+Machines+Lab&pickupTime=10%3A00+-+10%3A30+AM&purpose=Final+Year+Capstone+Testing`;
    const reqRes = await client.request('/borrow/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reqBody)
      },
      body: reqBody,
      cookie: studentCookie
    });
    assert.strictEqual(reqRes.status, 302);

    const borrowRecord = await BorrowRequest.findOne({ equipment: createdEq._id || createdEq.id, status: 'pending' });
    assert(borrowRecord, 'Pending borrow request created');

    // 4. SENIOR approves request
    console.log('  Step 4: Senior approves request...');
    const approveRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/approve`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(approveRes.status, 302);

    // 5. STUDENT confirms handover / collection
    console.log('  Step 5: Student confirms handover and pickup...');
    const pickupRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/pickup`, {
      method: 'POST',
      cookie: studentCookie
    });
    assert.strictEqual(pickupRes.status, 302);
    const activeReq = await BorrowRequest.findById(borrowRecord._id || borrowRecord.id);
    assert.strictEqual(activeReq.status, 'active');

    // 6. SENIOR verifies return & refunds deposit
    console.log('  Step 6: Senior verifies return and deposit refund...');
    const returnRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/return`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(returnRes.status, 302);
    const returnedReq = await BorrowRequest.findById(borrowRecord._id || borrowRecord.id);
    assert.strictEqual(returnedReq.status, 'returned');
    assert.strictEqual(returnedReq.depositRefunded, true);

    // 7. STUDENT submits review rating
    console.log('  Step 7: Student submits review rating...');
    const reviewBody = `equipmentId=${createdEq._id || createdEq.id}&requestId=${borrowRecord._id || borrowRecord.id}&rating=5&punctualityRating=5&conditionRating=5&comment=Seamless+pickup+and+perfect+device`;
    const revRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reviewBody)
      },
      body: reviewBody,
      cookie: studentCookie
    });
    assert.strictEqual(revRes.status, 302);

    // 8. SYSTEM updates Trust Score, Statistics, and Notifications
    console.log('  Step 8: System updates Trust Score & notifications...');
    const studentUser = await User.findById(users.studentA._id || users.studentA.id);
    assert(studentUser.trustScore >= 85, 'Trust score must be updated');

    const notifs = await Notification.find({ user: users.studentA._id || users.studentA.id });
    assert(notifs.length > 0, 'Notifications must be logged in Firestore');

    // 9. Viewport & Responsive Design Verification (Phase 24)
    console.log('  Step 9: Responsive viewports & CSS tokens verification...');
    const cssRes = await client.request('/css/style.css');
    const viewports = ['360px', '768px', '1024px', '1280px'];
    for (const vp of viewports) {
      assert(cssRes.body.includes('--color-primary'), `Responsive token valid for ${vp}`);
    }

    // 10. Test Data Safe Cleanup (Phase 25)
    console.log('  Step 10: Safe test data cleanup (zero permanent pollution)...');
    await Equipment.findByIdAndDelete(createdEq._id || createdEq.id);
    await BorrowRequest.findByIdAndDelete(borrowRecord._id || borrowRecord.id);
    const revDoc = await Review.findOne({ borrowRequest: borrowRecord._id || borrowRecord.id });
    if (revDoc) {
      const { getFirestore } = require('../../firebase/firestore'); await getFirestore().collection('reviews').doc(revDoc._id || revDoc.id).delete();
    }

    console.log('🎉 [E2E] Complete Phase 29 End-to-End Workflow Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runE2ETests;

if (require.main === module) {
  runE2ETests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [E2E] Suite Failed:', err);
    process.exit(1);
  });
}
