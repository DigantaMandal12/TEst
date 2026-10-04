/**
 * Phase 12 Return System Automated Test Suite
 * Tests Borrower Return, Lender Verification, Equipment State Restoration,
 * Deposit Refund, and Anti-Duplicate Return Protection.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');

async function runReturnTests() {
  console.log('🧪 [RETURN] Starting Phase 12 Return System Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const studentCookie = await client.loginAs('studentA');
    const seniorCookie = await client.loginAs('seniorA');
    const strangerCookie = await client.loginAs('studentB');

    const studentUser = users.studentA;
    const seniorUser = users.seniorA;

    // 1. Create equipment and active borrow request
    const eq = await Equipment.create({
      title: `Vernier Height Gauge (${Date.now()})`,
      category: 'Mechanical',
      dailyFee: 35,
      deposit: 250,
      status: 'borrowed',
      pickupLocation: 'Mechanical Workshop'
    });

    const borrow = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: eq._id || eq.id,
      equipmentId: eq._id || eq.id,
      borrower: studentUser._id || studentUser.id,
      borrowerId: studentUser._id || studentUser.id,
      lender: seniorUser._id || seniorUser.id,
      lenderId: seniorUser._id || seniorUser.id,
      depositAmount: 250,
      depositRefunded: false,
      status: 'active'
    });

    // 2. IDOR Protection: Unrelated user cannot process return
    console.log('  Test 12.1: IDOR check - Unrelated student blocked from processing return...');
    const illegalReturn = await client.request(`/borrow/${borrow._id || borrow.id}/return`, {
      method: 'POST',
      cookie: strangerCookie
    });
    assert.strictEqual(illegalReturn.status, 403, 'Unrelated user must be forbidden (403)');

    // 3. Legitimate Return Verification by Senior Lender
    console.log('  Test 12.2: Legitimate return verification and deposit refund...');
    const legitReturn = await client.request(`/borrow/${borrow._id || borrow.id}/return`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(legitReturn.status, 302, 'Return redirects to reviews/new');

    const updatedBorrow = await BorrowRequest.findById(borrow._id || borrow.id);
    assert.strictEqual(updatedBorrow.status, 'returned', 'Status must be returned');
    assert.strictEqual(updatedBorrow.depositRefunded, true, 'Deposit must be marked refunded');
    assert(updatedBorrow.actualReturnDate, 'Return date must be recorded');

    const updatedEq = await Equipment.findById(eq._id || eq.id);
    assert.strictEqual(updatedEq.status, 'available', 'Equipment must return to available');

    // 4. Duplicate Return Prevention
    console.log('  Test 12.3: Duplicate return attempt on already returned item...');
    const duplicateReturn = await client.request(`/borrow/${borrow._id || borrow.id}/return`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(duplicateReturn.status, 302, 'Duplicate return should redirect back');
    // Ensure deposit wasn't corrupted
    const checkBorrow = await BorrowRequest.findById(borrow._id || borrow.id);
    assert.strictEqual(checkBorrow.status, 'returned');

    // Clean up
    await Equipment.findByIdAndDelete(eq._id || eq.id);
    await BorrowRequest.findByIdAndDelete(borrow._id || borrow.id);

    console.log('✅ [RETURN] All 3 Phase 12 Return System Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runReturnTests;

if (require.main === module) {
  runReturnTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [RETURN] Suite Failed:', err);
    process.exit(1);
  });
}
