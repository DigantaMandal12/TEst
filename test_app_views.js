const http = require('http');
const assert = require('assert');

// Enforce genuine authentication testing: disable silent demo auto-login
process.env.ALLOW_DEMO_LOGIN = 'false';

const app = require('./app');
const { seedInitialData } = require('./config/seedData');
const Equipment = require('./models/Equipment');
const BorrowRequest = require('./models/BorrowRequest');
const User = require('./models/User');

const PORT = 3842;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    if (options.cookie) {
      headers['Cookie'] = options.cookie;
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
          cookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : options.cookie
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting End-to-End Application & View Verification Suite...\n');

  await seedInitialData();

  const server = app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT} for tests...\n`);

    try {
      // 0. Production Health Check Probe
      console.log('Test 0: Verifying /health probe endpoint...');
      const healthRes = await makeRequest('/health');
      assert.strictEqual(healthRes.statusCode, 200, '/health should return 200');
      const healthData = JSON.parse(healthRes.body);
      assert.strictEqual(healthData.status, 'ok', 'Status must be ok');
      assert(healthData.timestamp, 'Timestamp must be present');
      console.log('✅ Test 0 Passed: /health returns HTTP 200 and healthy status.\n');

      // 1. Static Assets
      console.log('Test 1: Verifying CSS and JS static assets...');
      const cssRes = await makeRequest('/css/style.css');
      assert.strictEqual(cssRes.statusCode, 200, 'style.css should return 200');
      assert(cssRes.body.includes('--color-primary: #2563EB'), 'CSS must include primary token #2563EB');
      assert(cssRes.body.includes('--color-secondary: #0D9488'), 'CSS must include secondary token #0D9488');
      assert(cssRes.body.includes('--color-success: #10B981'), 'CSS must include success token #10B981');
      assert(cssRes.body.includes('--color-warning: #F59E0B'), 'CSS must include warning token #F59E0B');
      assert(cssRes.body.includes('--color-error: #F43F5E'), 'CSS must include error token #F43F5E');
      assert(cssRes.body.includes('bottom-nav'), 'CSS must include mobile bottom nav');
      assert(cssRes.body.includes('prefers-reduced-motion'), 'CSS must include prefers-reduced-motion');
      console.log('✅ Test 1 Passed: CSS design tokens & responsive assets verified.\n');

      // 2. Home Page (Publicly accessible)
      console.log('Test 2: Verifying Home Page...');
      const homeRes = await makeRequest('/');
      assert.strictEqual(homeRes.statusCode, 200, 'Home page must return 200');
      assert(homeRes.body.includes('CampusEquip'), 'Must display brand name');
      assert(homeRes.body.includes('Mechanical'), 'Must display Mechanical category');
      assert(homeRes.body.includes('Civil'), 'Must display Civil category');
      assert(homeRes.body.includes('Electrical'), 'Must display Electrical category');
      assert(homeRes.body.includes('Survey'), 'Must display Survey category');
      assert(homeRes.body.includes('Other Engineering Equipment'), 'Must display Other Engineering category');
      console.log('✅ Test 2 Passed: Home page rendered with categories.\n');

      // 3. Equipment Catalogue & Category Filtering (Publicly accessible)
      console.log('Test 3: Verifying Catalogue & Department Filtering...');
      const catRes = await makeRequest('/equipment');
      assert.strictEqual(catRes.statusCode, 200, 'Catalogue must return 200');
      assert(catRes.body.includes('Mini Drafter'), 'Must list Mini Drafter');
      assert(catRes.body.includes('Scientific Calculator'), 'Must list Scientific Calculator');

      const mechRes = await makeRequest('/equipment?category=Mechanical');
      assert(mechRes.body.includes('Mini Drafter'), 'Mechanical must show Mini Drafter');

      const surveyRes = await makeRequest('/equipment?category=Survey');
      assert(surveyRes.body.includes('GPS Navigator') || surveyRes.body.includes('Distance Meter'), 'Survey must show survey gear');
      console.log('✅ Test 3 Passed: Equipment catalogue and filtering verified.\n');

      // 4. Equipment Details Page (Publicly accessible)
      console.log('Test 4: Verifying Equipment Details View...');
      const item = await Equipment.findOne({ title: /Mini Drafter/i });
      assert(item, 'Mini Drafter item must exist in database');
      const showRes = await makeRequest(`/equipment/${item._id || item.id}`);
      assert.strictEqual(showRes.statusCode, 200, 'Show page must return 200');
      assert(showRes.body.includes('Omega Mini Drafter'), 'Must show title');
      assert(showRes.body.includes('Refundable Deposit'), 'Must show deposit');
      assert(showRes.body.includes('Trust Score'), 'Must show trust score');
      console.log('✅ Test 4 Passed: Equipment details & specs verified.\n');

      // 5. Borrow Request Page (Security Policy: requireAuth protected)
      console.log('Test 5: Verifying Borrow Request Form View (Unauthenticated 302 & Authenticated 200)...');
      
      // 5a. Unauthenticated Access must be redirected to /auth/login with HTTP 302
      const unauthReq = await makeRequest(`/request/${item._id || item.id}`);
      assert.strictEqual(unauthReq.statusCode, 302, 'Unauthenticated /request/:id must return HTTP 302');
      assert(unauthReq.headers.location && unauthReq.headers.location.includes('/login'), 'Must redirect to login');

      const unauthBorrowReq = await makeRequest(`/borrow/request/${item._id || item.id}`);
      assert.strictEqual(unauthBorrowReq.statusCode, 302, 'Unauthenticated /borrow/request/:id must return HTTP 302');
      assert(unauthBorrowReq.headers.location && unauthBorrowReq.headers.location.includes('/login'), 'Must redirect to login');

      // 5b. Authenticated Student Session
      let studentUser = await User.findOne({ email: 'rahul.das@campus.edu' });
      if (!studentUser) {
        studentUser = await User.create({
          name: 'Rahul Das',
          email: 'rahul.das@campus.edu',
          password: 'password123',
          role: 'student',
          department: 'Mechanical',
          collegeId: 'ME-2024-042',
          trustScore: 92,
          trustTier: 'Gold'
        });
      }

      const loginBody = 'email=rahul.das%40campus.edu&password=password123';
      const loginRes = await makeRequest('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(loginBody)
        },
        body: loginBody
      });
      const authCookie = loginRes.cookie;
      assert(authCookie, 'Authentication must issue a session cookie');

      // 5c. Authenticated Access to both /request/:id and /borrow/request/:id must return HTTP 200
      const reqPageAlias = await makeRequest(`/request/${item._id || item.id}`, { cookie: authCookie });
      assert.strictEqual(reqPageAlias.statusCode, 200, 'Authenticated request to /request/:id must return 200');
      assert(reqPageAlias.body.includes('Designated Campus Pickup Station'), 'Must show pickup station');
      assert(reqPageAlias.body.includes('30-Minute Time Slot'), 'Must show pickup slots');

      const reqPage = await makeRequest(`/borrow/request/${item._id || item.id}`, { cookie: authCookie });
      assert.strictEqual(reqPage.statusCode, 200, 'Authenticated request to /borrow/request/:id must return 200');
      assert(reqPage.body.includes('Designated Campus Pickup Station'), 'Must show pickup station');
      assert(reqPage.body.includes('30-Minute Time Slot'), 'Must show pickup slots');
      console.log('✅ Test 5 Passed: Borrow request form verified (302 unauthenticated, 200 authenticated).\n');

      // 6. Dashboards
      console.log('Test 6: Verifying Dashboards (Borrower, Lender, Admin)...');
      const borrowerDash = await makeRequest('/borrow/my-loans', { cookie: authCookie });
      assert.strictEqual(borrowerDash.statusCode, 200, 'Borrower dashboard must return 200');
      assert(borrowerDash.body.includes('My Loans & Borrow Requests'), 'Must show borrower title');

      // Switch to senior for senior lender dashboard test
      const switchSenior = await makeRequest('/auth/switch-role/senior', { cookie: authCookie });
      const seniorCookie = switchSenior.cookie || authCookie;
      const lenderDash = await makeRequest('/borrow/lender', { cookie: seniorCookie });
      assert.strictEqual(lenderDash.statusCode, 200, 'Lender dashboard must return 200');
      assert(lenderDash.body.includes('Senior Lender & Custodian Panel'), 'Must show lender title');

      // Switch to admin for admin dashboard test
      const switchAdmin = await makeRequest('/auth/switch-role/admin', { cookie: seniorCookie });
      const adminCookie = switchAdmin.cookie || seniorCookie;
      const adminDash = await makeRequest('/admin', { cookie: adminCookie });
      assert.strictEqual(adminDash.statusCode, 200, 'Admin dashboard must return 200');
      assert(adminDash.body.includes('Campus Administrator Dashboard') || adminDash.body.includes('Campus Administration'), 'Must show admin title');
      console.log('✅ Test 6 Passed: Dashboards rendered successfully.\n');

      // 7. Profile & Trust Score Meter
      console.log('Test 7: Verifying Profile & Trust Score View...');
      const profRes = await makeRequest('/users/profile', { cookie: adminCookie });
      assert.strictEqual(profRes.statusCode, 200, 'Profile must return 200');
      assert(profRes.body.includes('Campus Trust Rating'), 'Must show trust score meter');
      assert(profRes.body.includes('Trust Score:'), 'Must show trust score value');
      console.log('✅ Test 7 Passed: Profile & Trust Score meter verified.\n');

      // 8. Notifications
      console.log('Test 8: Verifying Notifications Feed...');
      const notifRes = await makeRequest('/notifications', { cookie: adminCookie });
      assert.strictEqual(notifRes.statusCode, 200, 'Notifications must return 200');
      assert(notifRes.body.includes('Activity & Notifications'), 'Must show notifications title');
      console.log('✅ Test 8 Passed: Notifications feed verified.\n');

      // 9. AI Hardware Assistant
      console.log('Test 9: Verifying AI Hardware Assistant...');
      const chatRes = await makeRequest('/chatbot', { cookie: adminCookie });
      assert.strictEqual(chatRes.statusCode, 200, 'Chatbot must return 200');
      assert(chatRes.body.includes('Campus Hardware Guide AI'), 'Must show assistant title');

      // Post chat query
      const postMsg = JSON.stringify({ message: 'Where can I pick up my equipment?' });
      const chatPostRes = await makeRequest('/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postMsg,
        cookie: adminCookie
      });
      assert.strictEqual(chatPostRes.statusCode, 200, 'Chat query must return 200');
      const chatJson = JSON.parse(chatPostRes.body);
      assert.strictEqual(chatJson.success, true, 'Chat response must be successful');
      assert(chatJson.reply.length > 0, 'Chat reply must not be empty');
      console.log('✅ Test 9 Passed: AI Hardware Assistant verified.\n');

      // 10. 404 Error Page
      console.log('Test 10: Verifying 404 Page...');
      const notFoundRes = await makeRequest('/non-existent-page-xyz');
      assert.strictEqual(notFoundRes.statusCode, 404, 'Non-existent page must return 404');
      assert(notFoundRes.body.includes('Resource Not Found') || notFoundRes.body.includes('404'), 'Must render 404 error page');
      console.log('✅ Test 10 Passed: 404 page verified.\n');

      console.log('🎉 ALL 11 APPLICATION & VIEW VERIFICATION TESTS PASSED SUCCESSFULLY!');
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Test Suite Failed:', err);
      server.close();
      process.exit(1);
    }
  });
}

runTests();
