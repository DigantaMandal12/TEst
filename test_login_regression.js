/**
 * Comprehensive Login, Social Auth, & Reverse Proxy Regression Test Suite
 * Campus Equipment Lending Exchange
 *
 * Verifies:
 * 1. Top-level Route Aliases (/login, /register, /logout, /dashboard, /session-login)
 * 2. Reverse Proxy & Trust Proxy CSRF Origin Validation (equipment.campus.edu, *.vercel.app, localhost)
 * 3. Phishing CSRF Rejection (evil-attacker-site.com -> 403 Forbidden)
 * 4. Email/Password Registration with Strict Role Locking ('student')
 * 5. Email/Password Login with Valid & Invalid Credentials
 * 6. Social Authentication (Google, GitHub, Facebook, LinkedIn) via /session-login
 * 7. Anti-Account-Takeover Defense on Email Collision
 * 8. Session Persistence, Secure Cookie Flags (HttpOnly, SameSite=Lax, Secure), & Logout Destruction
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
process.env.SESSION_SECRET = 'login-regression-test-session-secret-256bit-2026';

const app = require('./app');
const User = require('./models/User');

async function runLoginRegressionSuite() {
  console.log('🔒 ========================================================');
  console.log('🔒 STARTING LOGIN, SOCIAL AUTH & REVERSE PROXY REGRESSION SUITE');
  console.log('🔒 ========================================================\n');

  const testPort = 19000 + Math.floor(Math.random() * 1000);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(testPort, resolve));
  const baseUrl = `http://127.0.0.1:${testPort}`;

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = Object.assign({}, options.headers || {});
      const req = http.request(url, {
        method: options.method || 'GET',
        headers
      }, (res) => {
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

  // Helper to extract session cookie
  function getCookie(headers) {
    const raw = headers['set-cookie'];
    if (!raw || raw.length === 0) return null;
    return raw.map(c => c.split(';')[0]).join('; ');
  }

  // -------------------------------------------------------------
  // Test 1: Route Aliases (/login, /register, /dashboard)
  // -------------------------------------------------------------
  console.log('Test 1: Verifying Top-Level Route Aliases (/login, /register, /dashboard)...');
  const loginAlias = await request('/login');
  assert.strictEqual(loginAlias.status, 200, 'GET /login alias must return HTTP 200');
  assert(loginAlias.body.includes('Welcome back'), '/login must render login template');

  const registerAlias = await request('/register');
  assert.strictEqual(registerAlias.status, 200, 'GET /register alias must return HTTP 200');
  assert(registerAlias.body.includes('Create your account'), '/register must render register template');

  const signupAlias = await request('/signup');
  assert.strictEqual(signupAlias.status, 200, 'GET /signup alias must return HTTP 200');
  assert(signupAlias.body.includes('Create your account'), '/signup must render register template');

  const dashboardAlias = await request('/dashboard');
  assert.strictEqual(dashboardAlias.status, 302, 'GET /dashboard must redirect to /borrow/my-loans');
  assert.strictEqual(dashboardAlias.headers.location, '/borrow/my-loans', 'Redirect target must be /borrow/my-loans');
  console.log('✅ Test 1 Passed: Route aliases verified without 404s.');

  // -------------------------------------------------------------
  // Test 2: CSRF Validation under Production Host and Proxies
  // -------------------------------------------------------------
  console.log('Test 2: Testing Production Reverse-Proxy CSRF Header Handling...');
  
  // 2a. Origin matches production custom domain
  const prodOriginRes = await request('/auth/session-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://equipment.campus.edu',
      'X-Forwarded-Host': 'equipment.campus.edu',
      'X-Forwarded-Proto': 'https',
      'X-Test-CSRF': 'true'
    },
    body: JSON.stringify({ idToken: 'mock-google-prod-user-1', redirectUrl: '/' })
  });
  assert.strictEqual(prodOriginRes.status, 200, 'Production domain Origin must be accepted by CSRF guard');

  // 2b. Origin matches Vercel preview domain
  const vercelOriginRes = await request('/session-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://campus-equipment-exchange-preview-abc123.vercel.app',
      'X-Forwarded-Host': 'campus-equipment-exchange-preview-abc123.vercel.app',
      'X-Forwarded-Proto': 'https',
      'X-Test-CSRF': 'true'
    },
    body: JSON.stringify({ idToken: 'mock-google-vercel-user-2', redirectUrl: '/' })
  });
  assert.strictEqual(vercelOriginRes.status, 200, 'Vercel deployment Origin (*.vercel.app) must be accepted by CSRF guard');

  // 2c. Malicious phishing origin must be rejected with HTTP 403 Forbidden
  const attackOriginRes = await request('/session-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://evil-attacker-site.com',
      'X-Forwarded-Host': 'equipment.campus.edu',
      'X-Test-CSRF': 'true'
    },
    body: JSON.stringify({ idToken: 'mock-google-attacker', redirectUrl: '/' })
  });
  assert.strictEqual(attackOriginRes.status, 403, 'Malicious Origin must be blocked with HTTP 403 Forbidden');
  console.log('✅ Test 2 Passed: Reverse-proxy CSRF handling accepts campus/Vercel domains and blocks phishing.');

  // -------------------------------------------------------------
  // Test 3: Email/Password Registration with Strict Role Locking
  // -------------------------------------------------------------
  console.log('Test 3: Testing Email/Password Registration with Role-Escalation Defense...');
  const regEmail = `test.student.${Date.now()}@campus.edu`;
  const regPayload = `name=Arjun+Patel&email=${encodeURIComponent(regEmail)}&password=StrongPassword123&confirmPassword=StrongPassword123&department=Electrical&collegeId=EE-2024-99&role=admin`;
  
  const regRes = await request('/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(regPayload),
      'Origin': 'https://equipment.campus.edu'
    },
    body: regPayload
  });
  assert.strictEqual(regRes.status, 302, 'Successful registration must redirect');
  const regUser = await User.findOne({ email: regEmail });
  assert(regUser, 'User must be created in Cloud Firestore');
  assert.strictEqual(regUser.role, 'student', 'Role escalation attempt (role=admin) must be neutralized to student');
  console.log('✅ Test 3 Passed: Registration strictly enforces student role and neutralizes escalation attempts.');

  // -------------------------------------------------------------
  // Test 4: Email/Password Login (Valid and Invalid)
  // -------------------------------------------------------------
  console.log('Test 4: Testing Email/Password Login Authentication...');
  
  // 4a. Invalid Password
  const badLoginPayload = `email=${encodeURIComponent(regEmail)}&password=WrongPasswordXYZ`;
  const badLoginRes = await request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(badLoginPayload),
      'Origin': 'https://equipment.campus.edu'
    },
    body: badLoginPayload
  });
  assert.strictEqual(badLoginRes.status, 302, 'Invalid login must redirect back to login page');
  assert.strictEqual(badLoginRes.headers.location, '/auth/login', 'Must redirect to /auth/login on bad password');

  // 4b. Valid Password
  const goodLoginPayload = `email=${encodeURIComponent(regEmail)}&password=StrongPassword123&redirectUrl=%2Fequipment`;
  const goodLoginRes = await request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(goodLoginPayload),
      'Origin': 'https://equipment.campus.edu',
      'X-Forwarded-Proto': 'https'
    },
    body: goodLoginPayload
  });
  assert.strictEqual(goodLoginRes.status, 302, 'Valid login must redirect');
  assert.strictEqual(goodLoginRes.headers.location, '/equipment', 'Redirect target must match redirectUrl');
  const authCookie = getCookie(goodLoginRes.headers);
  assert(authCookie, 'Login must set campus_sid session cookie');
  const cookieHeaders = goodLoginRes.headers['set-cookie'][0];
  assert(cookieHeaders.includes('HttpOnly'), 'Session cookie must have HttpOnly flag');
  assert(cookieHeaders.includes('SameSite=Lax'), 'Session cookie must have SameSite=Lax flag');
  assert(cookieHeaders.includes('Secure'), 'Session cookie must have Secure flag behind HTTPS proxy');
  console.log('✅ Test 4 Passed: Email/password authentication verified with hardened session cookies.');

  // -------------------------------------------------------------
  // Test 5: Social Authentication (Google, GitHub, Facebook, LinkedIn)
  // -------------------------------------------------------------
  console.log('Test 5: Testing Social Authentication Flows (Google, GitHub, Facebook, LinkedIn)...');
  const providers = ['google', 'github', 'facebook', 'linkedin'];
  for (const prov of providers) {
    const socialPayload = JSON.stringify({
      idToken: `mock-${prov}-test-uid-${Date.now()}`,
      redirectUrl: '/equipment'
    });
    const socialRes = await request('/session-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://equipment.campus.edu'
      },
      body: socialPayload
    });
    assert.strictEqual(socialRes.status, 200, `${prov} session-login must return HTTP 200`);
    const socialJson = JSON.parse(socialRes.body);
    assert.strictEqual(socialJson.success, true, `${prov} login succeeded`);
  }
  console.log('✅ Test 5 Passed: All 4 social identity providers (Google, GitHub, Facebook, LinkedIn) verified.');

  // -------------------------------------------------------------
  // Test 6: Anti-Account-Takeover on Email Collision
  // -------------------------------------------------------------
  console.log('Test 6: Testing Anti-Account-Takeover Protection on Colliding Email...');
  const collisionToken = JSON.stringify({
    uid: 'unauthorized_social_uid_9999',
    email: regEmail, // Same email as the registered student
    name: 'Malicious Clone',
    provider: 'facebook.com'
  });
  const collisionRes = await request('/session-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://equipment.campus.edu'
    },
    body: JSON.stringify({ idToken: collisionToken, redirectUrl: '/' })
  });
  assert.strictEqual(collisionRes.status, 401, 'Colliding unlinked social login must be blocked with HTTP 401');
  const collisionJson = JSON.parse(collisionRes.body);
  assert(collisionJson.error.includes('already registered with a different sign-in method'), 'Proper advisory returned');
  console.log('✅ Test 6 Passed: Anti-account-takeover defense verified.');

  // -------------------------------------------------------------
  // Test 7: Session Persistence, Access Control, and Logout
  // -------------------------------------------------------------
  console.log('Test 7: Testing Session Persistence and Logout Cookie Invalidation...');
  
  // Protected page with cookie succeeds
  const loansRes = await request('/borrow/my-loans', {
    headers: { 'Cookie': authCookie }
  });
  assert.strictEqual(loansRes.status, 200, 'Authenticated user can access /borrow/my-loans');

  // Logout clears cookie
  const logoutRes = await request('/logout', {
    headers: { 'Cookie': authCookie }
  });
  assert.strictEqual(logoutRes.status, 302, 'Logout must redirect');
  assert.strictEqual(logoutRes.headers.location, '/auth/login', 'Logout must redirect to login');
  const logoutSetCookie = logoutRes.headers['set-cookie'] ? logoutRes.headers['set-cookie'].join(';') : '';
  assert(logoutSetCookie.includes('campus_sid=;'), 'Logout must clear campus_sid cookie');

  // Requesting protected page after logout without cookie redirects to login
  const afterLogoutRes = await request('/borrow/my-loans');
  assert.strictEqual(afterLogoutRes.status, 302, 'Unauthenticated user redirected to login');
  assert(afterLogoutRes.headers.location.includes('/auth/login'), 'Redirected to /auth/login');
  console.log('✅ Test 7 Passed: Session persistence, protected routes, and logout destruction verified.');

  server.close();
  console.log('\n🎉 ALL 7 LOGIN & SOCIAL AUTH REGRESSION CHECKS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runLoginRegressionSuite().catch(err => {
    console.error('❌ Login regression test failed:', err);
    process.exit(1);
  });
}

module.exports = runLoginRegressionSuite;
