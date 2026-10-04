/**
 * Phase 6 Senior/Faculty/Lender Automated Test Suite
 * Tests Senior Dashboard, Equipment Creation & Editing, Ownership Isolation (Senior A vs Senior B),
 * Borrow Request Review, Approval, Rejection, and Anti-Self-Approval.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const User = require('../../models/User');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');

async function runSeniorTests() {
  console.log('🧪 [SENIOR] Starting Phase 6 Senior/Faculty/Lender Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const seniorACookie = await client.loginAs('seniorA');
    const seniorBCookie = await client.loginAs('seniorB');
    const studentCookie = await client.loginAs('studentA');

    const seniorAUser = users.seniorA;
    const seniorBUser = users.seniorB;
    const studentUser = users.studentA;

    // 1. Senior Dashboard View
    console.log('  Test 6.1: Senior Custodian & Lender Dashboard view...');
    const lenderDash = await client.request('/borrow/lender', { cookie: seniorACookie });
    assert.strictEqual(lenderDash.status, 200, 'Lender dashboard must return 200');
    assert(lenderDash.body.includes('Senior Lender & Custodian Panel') || lenderDash.body.includes('Lender'), 'Must render lender panel');

    // 2. Add Equipment Listing
    console.log('  Test 6.2: Senior creates new equipment listing...');
    const createBody = 'title=Fluke+87V+Industrial+Multimeter+(Senior+A)&category=Electrical&dailyFee=50&deposit=500&pickupLocation=Electrical+Machines+Lab&minTrustScore=75&specs=True+RMS%0ACAT+IV+600V';
    const createRes = await client.request('/equipment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(createBody)
      },
      body: createBody,
      cookie: seniorACookie
    });
    assert.strictEqual(createRes.status, 302, 'Equipment creation should redirect (302)');

    const itemA = await Equipment.findOne({ title: /Fluke 87V Industrial Multimeter \(Senior A\)/i });
    assert(itemA, 'Created item must exist in database');
    assert.strictEqual(String(itemA.owner || itemA.ownerId), String(seniorAUser._id || seniorAUser.id), 'Owner must match Senior A');

    // 3. Edit Equipment Listing by Owner
    console.log('  Test 6.3: Senior A edits their own listing...');
    const editBody = `title=Fluke+87V+Industrial+Multimeter+(Updated)&category=Electrical&dailyFee=60&deposit=550&pickupLocation=Electrical+Machines+Lab&status=available`;
    const editRes = await client.request(`/equipment/${itemA._id || itemA.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(editBody)
      },
      body: editBody,
      cookie: seniorACookie
    });
    assert.strictEqual(editRes.status, 302, 'Update should redirect');
    const updatedItemA = await Equipment.findById(itemA._id || itemA.id);
    assert.strictEqual(updatedItemA.dailyFee, 60, 'Daily fee updated to 60');

    // 4. Ownership Isolation: Senior B CANNOT edit Senior A listing
    console.log('  Test 6.4: Ownership boundary: Senior B blocked from editing Senior A equipment...');
    const illegalEditRes = await client.request(`/equipment/${itemA._id || itemA.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(editBody)
      },
      body: editBody,
      cookie: seniorBCookie
    });
    assert.strictEqual(illegalEditRes.status, 403, 'Cross-user edit must be forbidden (403)');

    // 5. Senior A approves request for Senior A item
    console.log('  Test 6.5: Senior A approves legitimate student borrow request...');
    const reqA = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: itemA._id || itemA.id,
      equipmentId: itemA._id || itemA.id,
      borrower: studentUser._id || studentUser.id,
      borrowerId: studentUser._id || studentUser.id,
      lender: seniorAUser._id || seniorAUser.id,
      lenderId: seniorAUser._id || seniorAUser.id,
      pickupDate: new Date(),
      pickupLocation: 'Electrical Machines Lab',
      pickupTime: '10:00 - 10:30 AM',
      depositAmount: 550,
      status: 'pending'
    });

    const approveRes = await client.request(`/borrow/${reqA._id || reqA.id}/approve`, {
      method: 'POST',
      cookie: seniorACookie
    });
    assert.strictEqual(approveRes.status, 302, 'Approval redirects (302)');
    const approvedReqA = await BorrowRequest.findById(reqA._id || reqA.id);
    assert.strictEqual(approvedReqA.status, 'approved', 'Request status must transition to approved');

    // 6. Horizontal Privilege: Senior B CANNOT approve Senior A request
    console.log('  Test 6.6: Horizontal isolation: Senior B blocked from approving Senior A request...');
    const reqA2 = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: itemA._id || itemA.id,
      equipmentId: itemA._id || itemA.id,
      borrower: studentUser._id || studentUser.id,
      borrowerId: studentUser._id || studentUser.id,
      lender: seniorAUser._id || seniorAUser.id,
      lenderId: seniorAUser._id || seniorAUser.id,
      status: 'pending'
    });
    const illegalApproveRes = await client.request(`/borrow/${reqA2._id || reqA2.id}/approve`, {
      method: 'POST',
      cookie: seniorBCookie
    });
    assert.strictEqual(illegalApproveRes.status, 403, 'Cross-senior approval must return 403');

    // 7. Anti-Self-Approval: Senior A borrows their own equipment, attempts approval
    console.log('  Test 6.7: Anti-self-approval rule strictly enforced...');
    const selfReq = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: itemA._id || itemA.id,
      equipmentId: itemA._id || itemA.id,
      borrower: seniorAUser._id || seniorAUser.id,
      borrowerId: seniorAUser._id || seniorAUser.id,
      lender: seniorAUser._id || seniorAUser.id,
      lenderId: seniorAUser._id || seniorAUser.id,
      status: 'pending'
    });
    const selfApproveRes = await client.request(`/borrow/${selfReq._id || selfReq.id}/approve`, {
      method: 'POST',
      cookie: seniorACookie
    });
    assert.strictEqual(selfApproveRes.status, 403, 'Self-approval must return 403');

    // Clean up created items
    await Equipment.findByIdAndDelete(itemA._id || itemA.id);
    await BorrowRequest.findByIdAndDelete(reqA._id || reqA.id);
    await BorrowRequest.findByIdAndDelete(reqA2._id || reqA2.id);
    await BorrowRequest.findByIdAndDelete(selfReq._id || selfReq.id);

    console.log('✅ [SENIOR] All 7 Phase 6 Senior/Faculty Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runSeniorTests;

if (require.main === module) {
  runSeniorTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [SENIOR] Suite Failed:', err);
    process.exit(1);
  });
}
