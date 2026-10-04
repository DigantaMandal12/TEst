/**
 * Phase 4 Social Auth Automated & Boundary Test Suite
 * Tests Google, GitHub, Facebook, and LinkedIn OAuth session creation, Firestore mapping,
 * role escalation defense, collision handling, and account linking boundaries.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const User = require('../../models/User');

async function runOAuthTests() {
  console.log('🧪 [OAUTH] Starting Phase 4 Social Auth Test Suite...');
  await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    // 1. Google First-Time Login Simulation & Firestore Mapping
    console.log('  Test 4.1: Google OAuth token exchange & user provisioning...');
    const googleEmail = `google.student.${Date.now()}@campus.edu`;
    const googleToken = JSON.stringify({
      uid: `goog_${Date.now()}`,
      email: googleEmail,
      name: 'Google Student',
      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      provider: 'google.com'
    });
    const googleRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: googleToken, redirectUrl: '/borrow/my-loans' })
    });
    assert.strictEqual(googleRes.status, 200, 'Google login should succeed with HTTP 200');
    assert.strictEqual(googleRes.json.success, true, 'Response JSON success should be true');
    assert(googleRes.cookie, 'Google session login must issue session cookie');

    const googleUser = await User.findOne({ email: googleEmail });
    assert(googleUser, 'Google authenticated user must exist in Firestore');
    assert.strictEqual(googleUser.role, 'student', 'Role must default to student');
    assert(googleUser.linkedProviders.includes('google.com'), 'linkedProviders must include google.com');

    // 2. GitHub Returning Login Simulation
    console.log('  Test 4.2: GitHub returning user login & session renewal...');
    const githubEmail = `github.student.${Date.now()}@campus.edu`;
    const githubToken = JSON.stringify({
      uid: `gh_${Date.now()}`,
      email: githubEmail,
      name: 'GitHub Student',
      provider: 'github.com'
    });
    const ghRes1 = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: githubToken })
    });
    assert.strictEqual(ghRes1.status, 200, 'First GitHub login succeeds');

    const ghRes2 = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: githubToken })
    });
    assert.strictEqual(ghRes2.status, 200, 'Second GitHub login renews session');
    const ghUsers = await User.find({ email: githubEmail });
    assert.strictEqual(ghUsers.length, 1, 'No duplicate Firestore user documents on returning login');

    // 3. Facebook Social Login Simulation
    console.log('  Test 4.3: Facebook social authentication...');
    const fbEmail = `fb.student.${Date.now()}@campus.edu`;
    const fbToken = JSON.stringify({
      uid: `fb_${Date.now()}`,
      email: fbEmail,
      name: 'Facebook Student',
      provider: 'facebook.com'
    });
    const fbRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: fbToken })
    });
    assert.strictEqual(fbRes.status, 200, 'Facebook login should succeed');
    const fbUser = await User.findOne({ email: fbEmail });
    assert(fbUser, 'Facebook user must exist in Firestore');
    assert(fbUser.linkedProviders.includes('facebook.com'), 'linkedProviders must include facebook.com');

    // 4. LinkedIn OIDC Login Simulation
    console.log('  Test 4.4: LinkedIn OIDC authentication...');
    const liEmail = `linkedin.student.${Date.now()}@campus.edu`;
    const liToken = JSON.stringify({
      uid: `li_${Date.now()}`,
      email: liEmail,
      name: 'LinkedIn Student',
      provider: 'linkedin.com'
    });
    const liRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: liToken })
    });
    assert.strictEqual(liRes.status, 200, 'LinkedIn login should succeed');
    const liUser = await User.findOne({ email: liEmail });
    assert(liUser, 'LinkedIn user must exist in Firestore');

    // 5. Role-Escalation Neutralization on Social Login
    console.log('  Test 4.5: Role escalation attempt on social login must be neutralized...');
    const hackerEmail = `tampered.${Date.now()}@campus.edu`;
    const hackerToken = JSON.stringify({
      uid: `hack_${Date.now()}`,
      email: hackerEmail,
      name: 'Hacker User',
      provider: 'google.com'
    });
    const hackerRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: hackerToken, role: 'admin' }) // Attacker attempts to inject admin
    });
    assert.strictEqual(hackerRes.status, 200);
    const hackerUser = await User.findOne({ email: hackerEmail });
    assert.strictEqual(hackerUser.role, 'student', 'Tampered role must be strictly locked to student');

    // 6. Anti-Account-Takeover Defense on Colliding Email
    console.log('  Test 4.6: Anti-account-takeover defense on colliding credentials...');
    const existingEmail = `existing.pw.${Date.now()}@campus.edu`;
    await User.create({
      name: 'Existing Password User',
      email: existingEmail,
      password: 'StrongPassword123!',
      role: 'student',
      linkedProviders: ['password']
    });

    const collideToken = JSON.stringify({
      uid: `collide_${Date.now()}`,
      email: existingEmail,
      name: 'Collide User',
      provider: 'google.com'
    });
    const collideRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: collideToken })
    });
    assert.strictEqual(collideRes.status, 401, 'Unlinked colliding social login must be rejected (401)');
    assert(collideRes.json.error.includes('already registered with a different sign-in method'), 'Must return account collision warning');

    // 7. Malformed / Missing ID Token Rejection
    console.log('  Test 4.7: Malformed or missing ID token rejection...');
    const emptyTokenRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(emptyTokenRes.status, 400, 'Empty token request should return 400');

    const invalidTokenRes = await client.request('/session-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'invalid-malformed-token-string' })
    });
    assert.strictEqual(invalidTokenRes.status, 401, 'Invalid token should return 401');

    console.log('✅ [OAUTH] All 7 Phase 4 Social Auth Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runOAuthTests;

if (require.main === module) {
  runOAuthTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [OAUTH] Suite Failed:', err);
    process.exit(1);
  });
}
