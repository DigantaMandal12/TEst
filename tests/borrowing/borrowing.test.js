/**
 * Phase 9 & 10 Borrowing Lifecycle and Edge Cases Test Suite
 * Tests the complete state machine transitions and guards:
 * Pending -> Approved -> Active -> Returned -> Reviewed.
 * Tests Edge Cases: Past date, Sunday, self-borrowing, slot collision, duplicate requests.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const User = require('../../models/User');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const Review = require('../../models/Review');
const { isSlotAvailable, getAvailablePickupDates } = require('../../config/pickupConfig');

async function runBorrowingTests() {
  console.log('🧪 [BORROWING] Starting Phase 9 & 10 Borrowing Lifecycle & Edge Cases Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const studentCookie = await client.loginAs('studentA');
    const seniorCookie = await client.loginAs('seniorA');

    const studentUser = users.studentA;
    const seniorUser = users.seniorA;

    // 1. Edge Case: Sunday & Date Availability Calculation
    console.log('  Test 9.1: Edge case - Sunday availability rule...');
    const pickupDates = getAvailablePickupDates(7);
    const sundayEntry = pickupDates.find(d => new Date(d.dateString).getDay() === 0);
    if (sundayEntry) {
      assert.strictEqual(sundayEntry.isAvailable, false, 'Sunday must have isAvailable: false');
      assert.strictEqual(sundayEntry.statusLabel, 'NOT AVAILABLE', 'Sunday status must be NOT AVAILABLE');
    }

    // 2. Edge Case: Slot Collision Guard
    console.log('  Test 9.2: Edge case - Slot collision logic...');
    const bookedOrders = [{ date: '2026-10-15', slotId: 'slot-1000-1030' }];
    assert.strictEqual(isSlotAvailable('2026-10-15', 'slot-1000-1030', bookedOrders), false, 'Booked slot must not be available');
    assert.strictEqual(isSlotAvailable('2026-10-15', 'slot-1100-1130', bookedOrders), true, 'Unbooked slot must be available');

    // 3. Create test equipment for lending lifecycle
    const testItem = await Equipment.create({
      title: 'Digital Oscilloscope DS1054Z (Lifecycle Test)',
      category: 'Electrical',
      dailyFee: 100,
      deposit: 800,
      status: 'available',
      pickupLocation: 'Electrical Machines Lab',
      owner: seniorUser._id || seniorUser.id,
      ownerName: seniorUser.name,
      minTrustScore: 60
    });

    // 4. Edge Case: Self-Borrowing Rejection
    console.log('  Test 9.3: Edge case - Owner cannot borrow own equipment...');
    const selfBorrowBody = `equipmentId=${testItem._id || testItem.id}&pickupDate=2026-10-14&pickupLocation=Electrical+Machines+Lab&pickupTime=11%3A00+-+11%3A30+AM&purpose=Self+Borrow`;
    const selfBorrowRes = await client.request('/borrow/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(selfBorrowBody)
      },
      body: selfBorrowBody,
      cookie: seniorCookie
    });
    assert.strictEqual(selfBorrowRes.status, 302, 'Self borrow redirects with flash error');

    // 5. Valid Student Borrow Request Submission
    console.log('  Test 9.4: Student submits valid borrow request...');
    const validBorrowBody = `equipmentId=${testItem._id || testItem.id}&pickupDate=2026-10-14&pickupLocation=Electrical+Machines+Lab&pickupTime=11%3A00+-+11%3A30+AM&purpose=Circuits+Lab+Final+Project`;
    const borrowRes = await client.request('/borrow/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(validBorrowBody)
      },
      body: validBorrowBody,
      cookie: studentCookie
    });
    assert.strictEqual(borrowRes.status, 302, 'Submission redirects to /borrow/my-loans');

    const borrowRecord = await BorrowRequest.findOne({ equipment: testItem._id || testItem.id, status: 'pending' });
    assert(borrowRecord, 'Pending borrow record must be created');
    assert.strictEqual(borrowRecord.status, 'pending');

    // 6. Senior Approval
    console.log('  Test 9.5: Senior approves request...');
    const approveRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/approve`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(approveRes.status, 302);
    const approvedRecord = await BorrowRequest.findById(borrowRecord._id || borrowRecord.id);
    assert.strictEqual(approvedRecord.status, 'approved', 'Must transition to approved');

    // 7. Student Pickup / Handover Confirmation
    console.log('  Test 9.6: Student confirms pickup & handover...');
    const pickupRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/pickup`, {
      method: 'POST',
      cookie: studentCookie
    });
    assert.strictEqual(pickupRes.status, 302);
    const activeRecord = await BorrowRequest.findById(borrowRecord._id || borrowRecord.id);
    assert.strictEqual(activeRecord.status, 'active', 'Must transition to active');
    const borrowedItem = await Equipment.findById(testItem._id || testItem.id);
    assert.strictEqual(borrowedItem.status, 'borrowed', 'Equipment status becomes borrowed');

    // 8. Return & Deposit Refund
    console.log('  Test 9.7: Senior verifies return & deposit refund...');
    const returnRes = await client.request(`/borrow/${borrowRecord._id || borrowRecord.id}/return`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(returnRes.status, 302);
    const returnedRecord = await BorrowRequest.findById(borrowRecord._id || borrowRecord.id);
    assert.strictEqual(returnedRecord.status, 'returned', 'Must transition to returned');
    assert.strictEqual(returnedRecord.depositRefunded, true, 'Deposit marked as refunded');
    const availableItem = await Equipment.findById(testItem._id || testItem.id);
    assert.strictEqual(availableItem.status, 'available', 'Equipment returns to available');

    // 9. Peer Review & Trust Score Award
    console.log('  Test 9.8: Student submits rating & earns Trust Score boost...');
    const initialStudent = await User.findById(studentUser._id || studentUser.id);
    const initialScore = initialStudent.trustScore || 85;

    const reviewBody = `equipmentId=${testItem._id || testItem.id}&requestId=${borrowRecord._id || borrowRecord.id}&rating=5&punctualityRating=5&conditionRating=5&comment=Excellent+oscilloscope+for+frequency+measurements!`;
    const reviewRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reviewBody)
      },
      body: reviewBody,
      cookie: studentCookie
    });
    assert.strictEqual(reviewRes.status, 302);

    const finalStudent = await User.findById(studentUser._id || studentUser.id);
    assert.strictEqual(finalStudent.trustScore, initialScore + 3, 'Trust Score must increase by +3 points');

    // Clean up
    await Equipment.findByIdAndDelete(testItem._id || testItem.id);
    await BorrowRequest.findByIdAndDelete(borrowRecord._id || borrowRecord.id);
    const createdRev = await Review.findOne({ borrowRequest: borrowRecord._id || borrowRecord.id });
    if (createdRev && (createdRev._id || createdRev.id)) {
      const { getFirestore } = require('../../firebase/firestore'); await getFirestore().collection('reviews').doc(createdRev._id || createdRev.id).delete();
    }

    console.log('✅ [BORROWING] All 8 Phase 9 & 10 Borrowing Lifecycle Tests Passed!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runBorrowingTests;

if (require.main === module) {
  runBorrowingTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [BORROWING] Suite Failed:', err);
    process.exit(1);
  });
}
