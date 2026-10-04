/**
 * Phase 3 Authentication Automated Test Suite
 * Tests Email/Password registration, login, bad passwords, session persistence, logout, and protected route boundaries.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { ACCOUNTS, provisionTestAccounts, cleanupTestAccounts } = require('../config/testAccounts');
const User = require('../../models/User');

async function runAuthTests() {
  console.log('🧪 [AUTH] Starting Phase 3 Authentication Test Suite...');
  await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    // 1. Email/Password Registration
    console.log('  Test 3.1: Valid student registration...');
    const newStudentEmail = `autotest.student.${Date.now()}@campus.edu`;
    const regBody = `name=New+Student&email=${encodeURIComponent(newStudentEmail)}&password=SecurePassword123!&role=student&department=Mechanical&collegeId=ME-NEW-01`;
    const regRes = await client.request('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(regBody)
      },
      body: regBody
    });
    assert.strictEqual(regRes.status, 302, 'Registration should redirect (302)');
    assert(regRes.cookie, 'Registration must issue a session cookie');

    // Verify user in Firestore
    const createdUser = await User.findOne({ email: newStudentEmail });
    assert(createdUser, 'Registered user must exist in Firestore');
    assert.strictEqual(createdUser.role, 'student', 'Default role must be student');

    // 2. Email/Password Login
    console.log('  Test 3.2: Valid student login...');
    const loginBody = `email=${encodeURIComponent(newStudentEmail)}&password=SecurePassword123!`;
    const loginRes = await client.request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginBody)
      },
      body: loginBody
    });
    assert.strictEqual(loginRes.status, 302, 'Login should redirect (302)');
    const studentCookie = loginRes.cookie;
    assert(studentCookie, 'Login must return session cookie');

    // 3. Wrong Password Login Rejection
    console.log('  Test 3.3: Invalid password rejection...');
    const badLoginBody = `email=${encodeURIComponent(newStudentEmail)}&password=WrongPassword123!`;
    const badLoginRes = await client.request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(badLoginBody)
      },
      body: badLoginBody
    });
    assert.strictEqual(badLoginRes.status, 302, 'Bad login should redirect to /auth/login');
    assert(badLoginRes.headers.location.includes('/login'), 'Must redirect back to login');

    // 4. Session Persistence on Protected Routes
    console.log('  Test 3.4: Session persistence across protected routes...');
    const profileRes = await client.request('/users/profile', { cookie: studentCookie });
    assert.strictEqual(profileRes.status, 200, 'Profile view must return 200 for authenticated user');
    assert(profileRes.body.includes(newStudentEmail) || profileRes.body.includes('New Student'), 'Profile must render student info');

    // 5. Logout & Session Destruction
    console.log('  Test 3.5: Logout and session invalidation...');
    const logoutRes = await client.request('/logout', { cookie: studentCookie });
    assert.strictEqual(logoutRes.status, 302, 'Logout must redirect');

    // 6. Protected Route Access After Logout
    console.log('  Test 3.6: Protected route access after logout must be blocked...');
    const postLogoutProfileRes = await client.request('/users/profile', { cookie: logoutRes.cookie || studentCookie });
    assert.strictEqual(postLogoutProfileRes.status, 302, 'Protected route must redirect unauthenticated user to login');
    assert(postLogoutProfileRes.headers.location.includes('/login'), 'Must redirect to login page');

    // Clean up created user
    await User.findByIdAndDelete(createdUser._id || createdUser.id);

    console.log('✅ [AUTH] All 6 Phase 3 Authentication Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runAuthTests;

if (require.main === module) {
  runAuthTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [AUTH] Suite Failed:', err);
    process.exit(1);
  });
}
