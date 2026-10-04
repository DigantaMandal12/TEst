/**
 * Phase 5 Student Automated Test Suite
 * Tests Student Profile, Equipment search, category filters, unavailable items, details,
 * borrow requests, status tracking, active loans, and notification feeds.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { ACCOUNTS, provisionTestAccounts } = require('../config/testAccounts');
const { seedInitialData } = require('../../config/seedData');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const Notification = require('../../models/Notification');

async function runStudentTests() {
  console.log('🧪 [STUDENT] Starting Phase 5 Student Test Suite...');
  await provisionTestAccounts();
  await seedInitialData();

  const client = new TestClient();
  await client.start();

  try {
    const studentCookie = await client.loginAs('studentA');

    // 1. Student Profile View
    console.log('  Test 5.1: Student profile & trust score display...');
    const profRes = await client.request('/users/profile', { cookie: studentCookie });
    assert.strictEqual(profRes.status, 200, 'Profile view returns 200');
    assert(profRes.body.includes(ACCOUNTS.studentA.name), 'Must display student name');
    assert(profRes.body.includes('Campus Trust Rating') || profRes.body.includes('Trust Score'), 'Must display trust meter');

    // 2. Equipment Search & Category Filtering
    console.log('  Test 5.2: Equipment search & department filtering...');
    const catRes = await client.request('/equipment?category=Mechanical', { cookie: studentCookie });
    assert.strictEqual(catRes.status, 200, 'Category catalogue returns 200');
    assert(catRes.body.includes('Mini Drafter') || catRes.body.includes('Mechanical'), 'Must list mechanical tools');

    const searchRes = await client.request('/equipment?q=Drafter', { cookie: studentCookie });
    assert.strictEqual(searchRes.status, 200, 'Search catalogue returns 200');
    assert(searchRes.body.includes('Drafter'), 'Search results must include Drafter');

    // 3. Unavailable Equipment Status Display
    console.log('  Test 5.3: Unavailable equipment status badge...');
    let unavailItem = await Equipment.findOne({ status: 'borrowed' });
    if (!unavailItem) {
      unavailItem = await Equipment.create({
        title: 'Calibrated Electronic Theodolite (In Use)',
        category: 'Survey',
        dailyFee: 150,
        deposit: 1200,
        status: 'borrowed',
        minTrustScore: 70
      });
    }
    const unavailRes = await client.request(`/equipment/${unavailItem._id || unavailItem.id}`, { cookie: studentCookie });
    assert.strictEqual(unavailRes.status, 200, 'Detail view of borrowed item returns 200');
    assert(unavailRes.body.includes('In Use / Reserved') || unavailRes.body.includes('badge-pending'), 'Must indicate borrowed state');

    // 4. Equipment Details & Specifications
    console.log('  Test 5.4: Equipment details & deposit rules...');
    const availableItem = await Equipment.findOne({ status: 'available' });
    assert(availableItem, 'Must have at least one available equipment item');
    const showRes = await client.request(`/equipment/${availableItem._id || availableItem.id}`, { cookie: studentCookie });
    assert.strictEqual(showRes.status, 200, 'Equipment show returns 200');
    const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
    assert(showRes.body.includes(availableItem.title) || showRes.body.includes(escapeHtml(availableItem.title)), 'Show page must render equipment title');
    assert(showRes.body.includes('Refundable Deposit') || showRes.body.includes('Deposit'), 'Must show deposit');

    // 5. Submit Borrow Request
    console.log('  Test 5.5: Submit borrow request for student...');
    const reqBody = `equipmentId=${availableItem._id || availableItem.id}&pickupDate=2026-10-15&pickupLocation=Main+Engineering+Library+Lobby&pickupTime=10%3A00+-+10%3A30+AM&purpose=Lab+Experiment+Coursework`;
    const submitRes = await client.request('/borrow/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reqBody)
      },
      body: reqBody,
      cookie: studentCookie
    });
    assert.strictEqual(submitRes.status, 302, 'Submission should redirect to my-loans (302)');

    // 6. Request Status & Active Loans
    console.log('  Test 5.6: Borrower loans & pending status tracking...');
    const loansRes = await client.request('/borrow/my-loans', { cookie: studentCookie });
    assert.strictEqual(loansRes.status, 200, 'My loans dashboard returns 200');
    assert(loansRes.body.includes('My Loans & Borrow Requests') || loansRes.body.includes('My Loans'), 'Must render dashboard title');

    // 7. Notifications Feed
    console.log('  Test 5.7: Notifications feed access...');
    const notifRes = await client.request('/notifications', { cookie: studentCookie });
    assert.strictEqual(notifRes.status, 200, 'Notifications feed returns 200');
    assert(notifRes.body.includes('Activity & Notifications') || notifRes.body.includes('Notifications'), 'Must render notifications title');

    console.log('✅ [STUDENT] All 7 Phase 5 Student Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runStudentTests;

if (require.main === module) {
  runStudentTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [STUDENT] Suite Failed:', err);
    process.exit(1);
  });
}
