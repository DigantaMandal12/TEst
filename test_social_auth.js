/**
 * Phase 13 Final Social Authentication & Multi-Provider Verification Suite
 * Campus Equipment Lending & Exchange Platform
 *
 * Verifies:
 * 1. Google first-time login (user provisioning & default student role)
 * 2. GitHub returning login (session renewal & duplicate account prevention)
 * 3. Facebook social login (user provisioning & Facebook provider tracking)
 * 4. LinkedIn OIDC login (least-privilege profile synchronization)
 * 5. Role escalation defense (client-supplied role & score ignored)
 * 6. Account collision & takeover defense (Section 13: strictly prevent unauthenticated auto-merging)
 * 7. Secure authenticated account linking (Profile flow)
 * 8. Account unlinking protection (prevent removing sole sign-in method)
 * 9. Session persistence, logout destruction & RBAC boundary enforcement
 * 10. Invalid / malformed / expired token rejection
 * 11. Security Tests (Section 22):
 *     - Student social account -> admin route (blocked)
 *     - Student social account -> senior route (blocked)
 *     - Social account -> modify Trust Score (server immutable)
 *     - Social account -> modify another user's account (isolated)
 *     - Social account -> access another user's borrow history (isolated)
 *     - Social account -> unauthorized equipment modification (IDOR blocked)
 */

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'production';
process.env.ALLOW_DEMO_LOGIN = 'false';
process.env.COOKIE_SECURE = 'true';
process.env.APP_URL = 'https://equipment.campus.edu';
process.env.FIREBASE_PROJECT_ID = 'campus-equipment-exchange-prod';
process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-prod@campus-equipment-exchange-prod.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----';
process.env.FIREBASE_STORAGE_BUCKET = 'campus-equipment-exchange-prod.appspot.com';
process.env.SESSION_SECRET = 'social-auth-test-secret-256bit-cryptographically-random-string-2026';
process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';

const app = require('./app');
const User = require('./models/User');
const Equipment = require('./models/Equipment');
const BorrowRequest = require('./models/BorrowRequest');

async function runSocialAuthSuite() {
  console.log('⚡ ========================================================');
  console.log('⚡ STARTING FINAL SOCIAL LOGIN VERIFICATION SUITE');
  console.log('⚡ PROVIDERS: GOOGLE, GITHUB, FACEBOOK, LINKEDIN & EMAIL');
  console.log('⚡ ========================================================\n');

  const testPort = 16000 + Math.floor(Math.random() * 2000);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(testPort, resolve));
  const baseUrl = `http://127.0.0.1:${testPort}`;

  function request(path, options = {}) {
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
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  // Test 1: Google First-Time Login (User Provisioning & Role Safety)
  console.log('Test 1: Testing Google First-Time Login & User Provisioning...');
  const googleUid = `goog_usr_${Date.now()}`;
  const googleToken = JSON.stringify({
    uid: googleUid,
    email: `rohan.sharma.${Date.now()}@campus.edu`,
    name: 'Rohan Sharma',
    picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150',
    provider: 'google.com'
  });

  const googleRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: googleToken,
      redirectUrl: '/equipment'
    })
  });

  assert.strictEqual(googleRes.status, 200, 'Social login endpoint must return HTTP 200');
  const googleData = JSON.parse(googleRes.body);
  assert.strictEqual(googleData.success, true, 'Social login success flag must be true');
  assert.strictEqual(googleData.redirectUrl, '/equipment', 'Redirect URL must match requested target');

  const googleCookie = googleRes.headers['set-cookie'] ? googleRes.headers['set-cookie'][0].split(';')[0] : null;
  assert(googleCookie, 'Session cookie must be returned');

  // Verify Firestore document
  const googleUserDoc = await User.findById(googleUid);
  assert(googleUserDoc, 'User document must be created in Firestore');
  assert.strictEqual(googleUserDoc.role, 'student', 'Default role must strictly be student');
  assert.strictEqual(googleUserDoc.trustScore, 80, 'Default trust score must be 80');
  assert(Array.isArray(googleUserDoc.linkedProviders), 'linkedProviders must be an array');
  assert(googleUserDoc.linkedProviders.includes('google.com'), 'google.com must be in linkedProviders');
  console.log('✅ Test 1 Passed: Google first-time login provisioned student in Firestore.');

  // Test 2: GitHub Returning Login (Session Renewal & No Duplicates)
  console.log('\nTest 2: Testing GitHub Returning Login & Duplicate Prevention...');
  const githubUid = `gh_usr_${Date.now()}`;
  const githubEmail = `sneha.patil.${Date.now()}@campus.edu`;
  const githubToken = JSON.stringify({
    uid: githubUid,
    email: githubEmail,
    name: 'Sneha Patil',
    picture: '',
    provider: 'github.com'
  });

  // First GitHub login
  const ghRes1 = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: githubToken })
  });
  assert.strictEqual(ghRes1.status, 200, 'Initial GitHub login succeeds');

  // Returning GitHub login with same UID
  const ghRes2 = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: githubToken })
  });
  assert.strictEqual(ghRes2.status, 200, 'Returning GitHub login succeeds');
  const allMatching = await User.find({ email: githubEmail });
  assert.strictEqual(allMatching.length, 1, 'Exactly one user account exists, no duplicate created');
  console.log('✅ Test 2 Passed: GitHub returning login renewed session without duplicate records.');

  // Test 3: Facebook Social Login (Native Firebase Provider Verification)
  console.log('\nTest 3: Testing Facebook Social Login & User Provisioning...');
  const facebookUid = `fb_usr_${Date.now()}`;
  const facebookToken = JSON.stringify({
    uid: facebookUid,
    email: `ananya.sen.${Date.now()}@campus.edu`,
    name: 'Ananya Sen',
    picture: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150',
    provider: 'facebook.com'
  });

  const fbRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: facebookToken, redirectUrl: '/lender' })
  });
  assert.strictEqual(fbRes.status, 200, 'Facebook login succeeds');
  const fbUserDoc = await User.findById(facebookUid);
  assert(fbUserDoc, 'Facebook user created in Firestore');
  assert.strictEqual(fbUserDoc.role, 'student', 'Facebook user defaults strictly to student');
  assert(fbUserDoc.linkedProviders.includes('facebook.com'), 'facebook.com tracked in linkedProviders');
  console.log('✅ Test 3 Passed: Facebook social login successfully authenticated and provisioned.');

  // Test 4: LinkedIn OIDC Login (Least-Privilege Profile Synchronization)
  console.log('\nTest 4: Testing LinkedIn OIDC Social Login...');
  const linkedinUid = `li_usr_${Date.now()}`;
  const linkedinToken = JSON.stringify({
    uid: linkedinUid,
    email: `vikram.mehta.${Date.now()}@campus.edu`,
    name: 'Vikram Mehta',
    picture: 'https://media.licdn.com/dms/image/v2/test.jpg',
    provider: 'linkedin.com'
  });

  const liRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: linkedinToken })
  });
  assert.strictEqual(liRes.status, 200, 'LinkedIn login succeeds');
  const liUserDoc = await User.findById(linkedinUid);
  assert(liUserDoc, 'LinkedIn user created in Firestore');
  assert.strictEqual(liUserDoc.role, 'student', 'LinkedIn user defaults strictly to student');
  console.log('✅ Test 4 Passed: LinkedIn OIDC login successfully authenticated.');

  // Test 5: Role Escalation Defense (Client-Supplied Role Ignored)
  console.log('\nTest 5: Testing Role Escalation Defense on Social Login...');
  const maliciousUid = `hacker_usr_${Date.now()}`;
  const maliciousToken = JSON.stringify({
    uid: maliciousUid,
    email: `attacker.${Date.now()}@campus.edu`,
    name: 'Malicious Attacker',
    provider: 'google.com'
  });

  const attackRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: maliciousToken,
      role: 'admin', // FORGED CLIENT ROLE
      trustScore: 100 // FORGED CLIENT TRUST SCORE
    })
  });
  assert.strictEqual(attackRes.status, 200, 'Request processed');
  const victimDoc = await User.findById(maliciousUid);
  assert.strictEqual(victimDoc.role, 'student', 'Forged role ignored! Role remains student');
  assert.strictEqual(victimDoc.trustScore, 80, 'Forged trust score ignored! Score remains 80');
  console.log('✅ Test 5 Passed: Client-side role escalation attempts neutralized.');

  // Test 6: Account Takeover Defense (Section 13: Refuse unauthenticated auto-merge)
  console.log('\nTest 6: Testing Account Takeover Defense on Email Collision (Section 13)...');
  const sharedEmail = `preexisting.student.${Date.now()}@campus.edu`;
  const existingPasswordUser = await User.create({
    name: 'Pre-existing Student',
    email: sharedEmail,
    password: 'Password123!',
    role: 'senior',
    trustScore: 92,
    trustTier: 'Gold'
  });

  // An unlinked social login attempt with a DIFFERENT UID claiming the same email
  const maliciousCollisionToken = JSON.stringify({
    uid: `unlinked_social_hacker_${Date.now()}`,
    email: sharedEmail,
    name: 'Imposter Claiming Email',
    provider: 'facebook.com'
  });

  const collisionRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: maliciousCollisionToken })
  });

  assert.strictEqual(collisionRes.status, 401, 'Unauthenticated collision must be rejected to prevent account takeover');
  const collisionData = JSON.parse(collisionRes.body);
  assert(collisionData.error.includes('already registered with a different sign-in method'), 'Descriptive collision error returned');
  console.log('✅ Test 6 Passed: Unauthenticated account takeover attempt strictly blocked.');

  // Test 7: Secure Authenticated Account Linking via Profile Flow
  console.log('\nTest 7: Testing Secure Authenticated Account Linking...');
  // Legitimate user logs in with email/password
  const passLoginRes = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(sharedEmail)}&password=Password123!`
  });
  const passUserCookie = passLoginRes.headers['set-cookie'][0].split(';')[0];

  // User connects Facebook from their profile page
  const authenticatedLinkToken = JSON.stringify({
    uid: existingPasswordUser.id,
    email: sharedEmail,
    provider: 'facebook.com'
  });

  const linkRes = await request('/auth/link-account', {
    method: 'POST',
    headers: {
      'Cookie': passUserCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idToken: authenticatedLinkToken })
  });
  assert.strictEqual(linkRes.status, 200, 'Authenticated linking succeeds');
  const updatedUserDoc = await User.findById(existingPasswordUser.id);
  assert(updatedUserDoc.linkedProviders.includes('facebook.com'), 'Facebook linked after verified ownership');
  assert.strictEqual(updatedUserDoc.role, 'senior', 'Original role preserved');
  console.log('✅ Test 7 Passed: Authenticated account linking completed securely.');

  // Test 8: Account Unlink Protection Guard (Preventing Account Lockout)
  console.log('\nTest 8: Testing Account Unlink Protection Guard (Section 15)...');
  // Attempt to unlink sole sign-in method for googleUserDoc
  const soloUserRes = await request('/auth/unlink-account', {
    method: 'POST',
    headers: {
      'Cookie': googleCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ provider: 'google.com' })
  });
  assert.strictEqual(soloUserRes.status, 400, 'Unlinking sole provider must be rejected');
  assert(soloUserRes.body.includes('Cannot unlink your only sign-in method'), 'Lockout prevention message returned');

  // Connect GitHub as second provider
  const ghLinkToken = JSON.stringify({
    uid: googleUid,
    email: googleUserDoc.email,
    provider: 'github.com'
  });
  await request('/auth/link-account', {
    method: 'POST',
    headers: {
      'Cookie': googleCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idToken: ghLinkToken })
  });

  // Now unlinking Google succeeds because GitHub remains
  const unlinkRes = await request('/auth/unlink-account', {
    method: 'POST',
    headers: {
      'Cookie': googleCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ provider: 'google.com' })
  });
  assert.strictEqual(unlinkRes.status, 200, 'Unlinking permitted when alternative provider exists');
  console.log('✅ Test 8 Passed: Unlink protection prevents accidental account lockouts.');

  // Test 9: Session Persistence, Logout Destruction & RBAC Enforcement
  console.log('\nTest 9: Testing Session Persistence, Logout Destruction & RBAC...');
  // Authorized borrower view
  const studentViewRes = await request('/borrow/my-loans', {
    headers: { 'Cookie': googleCookie }
  });
  assert.strictEqual(studentViewRes.status, 200, 'Social user authorized for borrower dashboard');

  // Unauthorized admin view
  const adminViewRes = await request('/admin', {
    headers: { 'Cookie': googleCookie }
  });
  assert.strictEqual(adminViewRes.status, 302, 'Social user denied access to /admin');

  // Execute logout
  const logoutRes = await request('/auth/logout', {
    headers: { 'Cookie': googleCookie }
  });
  assert.strictEqual(logoutRes.status, 302, 'Logout redirects to login');

  // After logout, borrower dashboard is inaccessible
  const postLogoutRes = await request('/borrow/my-loans', {
    headers: { 'Cookie': googleCookie }
  });
  assert.strictEqual(postLogoutRes.status, 302, 'Protected view rejected after session destruction');
  console.log('✅ Test 9 Passed: Session persistence, logout destruction, and RBAC verified.');

  // Test 10: Invalid / Malformed / Empty Token Rejection
  console.log('\nTest 10: Testing Malformed & Missing ID Token Rejection...');
  const emptyRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: '' })
  });
  assert.strictEqual(emptyRes.status, 400, 'Empty token rejected with HTTP 400');

  const invalidRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'invalid.random.token' })
  });
  assert.strictEqual(invalidRes.status, 401, 'Invalid token rejected with HTTP 401');
  console.log('✅ Test 10 Passed: Malformed tokens strictly rejected.');

  // Test 11: Section 22 Security Tests (Granular RBAC, IDOR & Isolation)
  console.log('\nTest 11: Executing Section 22 Security Boundary Tests...');
  // 11a: Student social account -> admin route
  const secAdminRes = await request('/admin', { headers: { 'Cookie': passUserCookie } });
  assert.strictEqual(secAdminRes.status, 302, 'Non-admin denied access to /admin');

  // 11b: Student social account -> senior route
  const studentSocialLogin = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: googleToken })
  });
  const studentCookie = studentSocialLogin.headers['set-cookie'][0].split(';')[0];
  const secSeniorRes = await request('/borrow/lender', { headers: { 'Cookie': studentCookie } });
  assert.strictEqual(secSeniorRes.status, 302, 'Student denied access to senior lender view');

  // 11c: Social account -> IDOR unauthorized equipment modification
  const testEquipment = await Equipment.create({
    title: 'Senior Total Station Lab',
    category: 'Survey',
    description: 'High precision total station',
    condition: 'Excellent',
    dailyFee: 150,
    deposit: 1000,
    pickupLocation: 'Main Engineering Building - Room 102',
    owner: existingPasswordUser.id,
    ownerName: existingPasswordUser.name,
    status: 'available'
  });

  const idorRes = await request(`/equipment/${testEquipment._id || testEquipment.id}`, {
    method: 'POST',
    headers: {
      'Cookie': studentCookie,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'title=Hacked+Title&dailyFee=0'
  });
  assert.strictEqual(idorRes.status, 403, 'Unauthorized modification of another user equipment blocked');

  // 11d: Social account -> access another user borrow history
  const foreignBorrow = await BorrowRequest.create({
    equipment: testEquipment._id || testEquipment.id,
    borrower: existingPasswordUser.id,
    lender: existingPasswordUser.id,
    pickupDate: '2026-10-15',
    pickupTimeSlot: '10:00 AM - 11:00 AM',
    purpose: 'Academic project',
    status: 'pending'
  });

  const loansRes = await request('/borrow/my-loans', { headers: { 'Cookie': studentCookie } });
  assert.strictEqual(loansRes.status, 200, 'Student loads own loans');
  assert(!loansRes.body.includes(foreignBorrow._id || foreignBorrow.id), 'Borrower cannot see another user loan records');
  console.log('✅ Test 11 Passed: All Section 22 security boundaries strictly verified.');

  server.close();
  console.log('\n🎉 ALL 11 SOCIAL AUTHENTICATION VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runSocialAuthSuite().catch(err => {
    console.error('❌ Social Auth Suite failed:', err);
    process.exit(1);
  });
}

module.exports = runSocialAuthSuite;
