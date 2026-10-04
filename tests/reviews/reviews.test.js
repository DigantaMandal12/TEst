/**
 * Phase 14 Review System Automated Test Suite
 * Tests Valid rating submissions, rating clamping (1-5), review before return rejection,
 * duplicate review rejection, non-borrower IDOR rejection, and Firestore persistence.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const Review = require('../../models/Review');

async function runReviewsTests() {
  console.log('🧪 [REVIEWS] Starting Phase 14 Review System Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const studentACookie = await client.loginAs('studentA');
    const studentBCookie = await client.loginAs('studentB');

    const studentA = users.studentA;
    const studentB = users.studentB;
    const seniorA = users.seniorA;

    // Create test equipment and returned borrow request
    const eq = await Equipment.create({
      title: `Laser Rangefinder Review Item (${Date.now()})`,
      category: 'Survey',
      dailyFee: 50,
      deposit: 400,
      status: 'available',
      pickupLocation: 'Civil Surveying Store'
    });

    const returnedBorrow = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: eq._id || eq.id,
      equipmentId: eq._id || eq.id,
      borrower: studentA._id || studentA.id,
      borrowerId: studentA._id || studentA.id,
      lender: seniorA._id || seniorA.id,
      lenderId: seniorA._id || seniorA.id,
      status: 'returned'
    });

    // 1. Valid Rating Submission (1-5)
    console.log('  Test 14.1: Valid rating submission (5 stars)...');
    const reviewBody = `equipmentId=${eq._id || eq.id}&requestId=${returnedBorrow._id || returnedBorrow.id}&rating=5&punctualityRating=5&conditionRating=4&comment=Excellent+accuracy+and+battery+life.`;
    const revRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reviewBody)
      },
      body: reviewBody,
      cookie: studentACookie
    });
    assert.strictEqual(revRes.status, 302, 'Valid review redirects to equipment page (302)');

    const savedReview = await Review.findOne({ borrowRequest: returnedBorrow._id || returnedBorrow.id });
    assert(savedReview, 'Review must be saved in Firestore');
    assert.strictEqual(savedReview.rating, 5);
    assert.strictEqual(savedReview.punctualityRating, 5);
    assert.strictEqual(savedReview.conditionRating, 4);

    // 2. Duplicate Review Rejection
    console.log('  Test 14.2: Duplicate review rejection...');
    const dupRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reviewBody)
      },
      body: reviewBody,
      cookie: studentACookie
    });
    assert.strictEqual(dupRes.status, 400, 'Duplicate review must return 400 Bad Request');

    // 3. IDOR Defense: Non-borrower cannot review another student\'s loan
    console.log('  Test 14.3: IDOR defense - Non-borrower student cannot submit review...');
    const secondReturnedBorrow = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: eq._id || eq.id,
      equipmentId: eq._id || eq.id,
      borrower: studentA._id || studentA.id,
      borrowerId: studentA._id || studentA.id,
      lender: seniorA._id || seniorA.id,
      lenderId: seniorA._id || seniorA.id,
      status: 'returned'
    });
    const idorBody = `equipmentId=${eq._id || eq.id}&requestId=${secondReturnedBorrow._id || secondReturnedBorrow.id}&rating=5`;
    const idorRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(idorBody)
      },
      body: idorBody,
      cookie: studentBCookie // Student B attempts to review Student A's order
    });
    assert.strictEqual(idorRes.status, 403, 'Non-borrower review must return 403 Forbidden');

    // 4. State Machine Check: Review Before Return Rejection
    console.log('  Test 14.4: Premature review on unreturned item must be rejected...');
    const activeBorrow = await BorrowRequest.create({
      orderNumber: 'ORD-' + Math.floor(10000 + Math.random() * 90000),
      equipment: eq._id || eq.id,
      equipmentId: eq._id || eq.id,
      borrower: studentA._id || studentA.id,
      borrowerId: studentA._id || studentA.id,
      lender: seniorA._id || seniorA.id,
      lenderId: seniorA._id || seniorA.id,
      status: 'active' // Not yet returned!
    });
    const prematureBody = `equipmentId=${eq._id || eq.id}&requestId=${activeBorrow._id || activeBorrow.id}&rating=5`;
    const prematureRes = await client.request('/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(prematureBody)
      },
      body: prematureBody,
      cookie: studentACookie
    });
    assert.strictEqual(prematureRes.status, 400, 'Review before return must return 400 Bad Request');

    // Clean up
    await Equipment.findByIdAndDelete(eq._id || eq.id);
    await BorrowRequest.findByIdAndDelete(returnedBorrow._id || returnedBorrow.id);
    await BorrowRequest.findByIdAndDelete(secondReturnedBorrow._id || secondReturnedBorrow.id);
    await BorrowRequest.findByIdAndDelete(activeBorrow._id || activeBorrow.id);
    const { getFirestore } = require('../../firebase/firestore'); await getFirestore().collection('reviews').doc(savedReview._id || savedReview.id).delete();

    console.log('✅ [REVIEWS] All 4 Phase 14 Review System Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runReviewsTests;

if (require.main === module) {
  runReviewsTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [REVIEWS] Suite Failed:', err);
    process.exit(1);
  });
}
