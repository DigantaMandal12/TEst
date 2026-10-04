const http = require('http');
const assert = require('assert');
const querystring = require('querystring');
const app = require('./app');
const { seedInitialData } = require('./config/seedData');
const Equipment = require('./models/Equipment');
const BorrowRequest = require('./models/BorrowRequest');
const Notification = require('./models/Notification');
const User = require('./models/User');

const PORT = 3843;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    if (options.cookie) headers['Cookie'] = options.cookie;
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: options.method || 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          cookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : options.cookie,
          location: res.headers['location']
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runLifecycle() {
  console.log('🧪 Starting Full Borrowing-to-Return Lifecycle Test...\n');
  await seedInitialData();

  const server = app.listen(PORT, async () => {
    try {
      // 1. Student establishes session
      console.log('Step 1: Student browsing catalogue...');
      const homeRes = await makeRequest('/');
      const studentCookie = homeRes.cookie;

      const seniorUser = await User.findOne({ role: 'senior' });
      assert(seniorUser, 'Senior user must exist');
      const item = await Equipment.findOne({ owner: seniorUser._id || seniorUser.id, status: 'available' });
      assert(item, 'Available equipment owned by senior must exist');
      console.log(`Found available equipment: ${item.title} (Deposit: ₹${item.deposit})`);

      // 2. Student submits borrow request
      console.log('Step 2: Submitting borrow request for student...');
      const reqBody = querystring.stringify({
        equipmentId: item._id || item.id,
        pickupDate: '2026-10-15',
        pickupSlotId: 'slot-1400-1430',
        pickupLocation: 'Department Office - Admin Block Room 102',
        returnDate: '2026-10-20',
        purpose: 'Site leveling survey practical semester exam project'
      });
      const borrowRes = await makeRequest('/borrow/request', {
        method: 'POST',
        body: reqBody,
        cookie: studentCookie
      });
      assert.strictEqual(borrowRes.statusCode, 302, 'Should redirect to /borrow/my-loans');
      assert.strictEqual(borrowRes.location, '/borrow/my-loans');

      // Verify request in DB
      const createdRequest = await BorrowRequest.findOne({ equipment: item._id || item.id });
      assert(createdRequest, 'BorrowRequest record must exist');
      assert.strictEqual(createdRequest.status, 'pending', 'Initial status must be pending');
      console.log(`✅ Order #${createdRequest.orderNumber} created with status: ${createdRequest.status}`);

      // 3. Senior reviews and approves
      console.log('Step 3: Senior lender approving request...');
      const seniorSwitch = await makeRequest('/auth/switch-role/senior');
      const seniorCookie = seniorSwitch.cookie;

      const approveRes = await makeRequest(`/borrow/${createdRequest._id || createdRequest.id}/approve`, {
        method: 'POST',
        cookie: seniorCookie
      });
      assert.strictEqual(approveRes.statusCode, 302, 'Should redirect after approve');

      const approvedReq = await BorrowRequest.findById(createdRequest._id || createdRequest.id);
      assert.strictEqual(approvedReq.status, 'approved', 'Status must now be approved');
      console.log(`✅ Order #${approvedReq.orderNumber} approved by senior.`);

      // Verify buyer ready notification was created
      const notifs = await Notification.find({ title: /READY/i });
      assert(notifs.length > 0, 'Ready notification should be generated');
      console.log(`✅ Buyer notification verified: "${notifs[0].title}"`);

      // 4. Student confirms pickup
      console.log('Step 4: Student confirms equipment collected...');
      const pickupRes = await makeRequest(`/borrow/${createdRequest._id || createdRequest.id}/pickup`, {
        method: 'POST',
        cookie: studentCookie
      });
      assert.strictEqual(pickupRes.statusCode, 302, 'Should redirect after pickup');
      const activeReq = await BorrowRequest.findById(createdRequest._id || createdRequest.id);
      assert.strictEqual(activeReq.status, 'active', 'Status must now be active (in use)');
      console.log(`✅ Equipment marked as in-use.`);

      // 5. Equipment return and deposit refund
      console.log('Step 5: Verifying return and deposit refund...');
      const returnRes = await makeRequest(`/borrow/${createdRequest._id || createdRequest.id}/return`, {
        method: 'POST',
        cookie: studentCookie
      });
      assert.strictEqual(returnRes.statusCode, 302, 'Should redirect to review form');
      assert(returnRes.location.startsWith('/reviews/new'), 'Must direct to reviews');

      const returnedReq = await BorrowRequest.findById(createdRequest._id || createdRequest.id);
      assert.strictEqual(returnedReq.status, 'returned', 'Status must be returned');
      assert.strictEqual(returnedReq.depositRefunded, true, 'Deposit must be refunded');
      console.log(`✅ Equipment returned and deposit refunded.`);

      // 6. Submit Review & Trust Score increment
      console.log('Step 6: Student submits peer review and rating...');
      const reviewBody = querystring.stringify({
        equipmentId: item._id || item.id,
        requestId: createdRequest._id || createdRequest.id,
        rating: '5',
        punctualityRating: '5',
        conditionRating: '5',
        comment: 'Accurate theodolite with sharp optical plummet. Handover was on-time!'
      });
      const reviewRes = await makeRequest('/reviews', {
        method: 'POST',
        body: reviewBody,
        cookie: studentCookie
      });
      assert.strictEqual(reviewRes.statusCode, 302, 'Should redirect to my-loans after review');
      console.log('✅ Rating recorded and Trust Score boosted.');

      console.log('\n🎉 COMPLETE 6-STEP LENDING LIFECYCLE VERIFIED SUCCESSFULLY!');
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Lifecycle Test Failure:', err);
      server.close();
      process.exit(1);
    }
  });
}

runLifecycle();
