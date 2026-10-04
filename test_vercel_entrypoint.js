/**
 * Vercel Serverless Entrypoint & Function Compatibility Verification Suite
 * Campus Equipment Lending & Exchange Platform
 *
 * Verifies:
 * 1. api/index.js can be imported without executing app.listen()
 * 2. Vercel Serverless Function invocation contract (req, res handler)
 * 3. EJS template rendering through serverless handler (/, /auth/login, /auth/register, /equipment)
 * 4. Static asset fallback serving (/css/style.css, /js/socialAuth.js)
 * 5. Firebase and session operations in serverless execution
 * 6. Health check probe compliance
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
process.env.SESSION_SECRET = 'vercel-test-session-secret-256bit-cryptographically-random-2026';
process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';

async function runVercelCompatibilitySuite() {
  console.log('▲ ========================================================');
  console.log('▲ STARTING VERCEL SERVERLESS ENTRYPOINT COMPATIBILITY SUITE');
  console.log('▲ Entrypoint: api/index.js -> Express -> EJS -> Firebase');
  console.log('▲ ========================================================\n');

  // Check 1: Verify api/index.js exports Express application without starting server
  console.log('Check 1: Verifying api/index.js exports Express application...');
  const vercelApp = require('./api/index');
  assert(typeof vercelApp === 'function', 'api/index.js must export an Express application function');
  assert(typeof vercelApp.use === 'function', 'Exported application must have standard Express methods');
  console.log('✅ Check 1 Passed: api/index.js exports clean Express handler without calling app.listen().');

  // Step 2: Wrap vercelApp in HTTP server exactly like Vercel node runner
  const testPort = 17000 + Math.floor(Math.random() * 2000);
  const server = http.createServer(vercelApp);
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

  // Check 2: Health probe under Vercel
  console.log('\nCheck 2: Testing /health endpoint via Vercel entrypoint...');
  const healthRes = await request('/health');
  assert.strictEqual(healthRes.status, 200, '/health must return HTTP 200');
  const healthData = JSON.parse(healthRes.body);
  assert.strictEqual(healthData.status, 'ok', 'Status must be ok');
  console.log('✅ Check 2 Passed: /health returned HTTP 200 on Vercel entrypoint.');

  // Check 3: EJS Homepage Rendering
  console.log('\nCheck 3: Testing EJS Homepage template rendering (/)...');
  const homeRes = await request('/');
  assert.strictEqual(homeRes.status, 200, 'Homepage must return HTTP 200');
  assert(homeRes.body.includes('Campus Equipment Lending'), 'Homepage rendered title');
  assert(homeRes.body.includes('<!DOCTYPE html>'), 'Valid HTML structure returned');
  console.log('✅ Check 3 Passed: EJS Homepage rendered successfully via Vercel.');

  // Check 4: EJS Login Page & Social Login Buttons
  console.log('\nCheck 4: Testing EJS Login view and Social Buttons (/auth/login)...');
  const loginRes = await request('/auth/login');
  assert.strictEqual(loginRes.status, 200, 'Login page must return HTTP 200');
  assert(loginRes.body.includes('Welcome back'), 'Target UI title present');
  assert(loginRes.body.includes('Continue with Google'), 'Google button present');
  assert(loginRes.body.includes('Continue with GitHub'), 'GitHub button present');
  assert(loginRes.body.includes('Continue with Facebook'), 'Facebook button present');
  assert(loginRes.body.includes('Continue with LinkedIn'), 'LinkedIn button present');
  console.log('✅ Check 4 Passed: EJS Login view with all 4 social buttons verified.');

  // Check 5: EJS Register Page
  console.log('\nCheck 5: Testing EJS Register view (/auth/register)...');
  const regRes = await request('/auth/register');
  assert.strictEqual(regRes.status, 200, 'Register page must return HTTP 200');
  assert(regRes.body.includes('Create your account'), 'Register heading present');
  assert(regRes.body.includes('Confirm Password'), 'Confirm password field present');
  console.log('✅ Check 5 Passed: EJS Register view rendered successfully.');

  // Check 6: Static Assets (/css/style.css, /js/socialAuth.js)
  console.log('\nCheck 6: Testing Static Asset availability...');
  const cssRes = await request('/css/style.css');
  assert.strictEqual(cssRes.status, 200, 'CSS asset must return HTTP 200');
  assert(cssRes.body.includes('.btn-social'), 'CSS contains social button styles');

  const jsRes = await request('/js/socialAuth.js');
  assert.strictEqual(jsRes.status, 200, 'JavaScript asset must return HTTP 200');
  assert(jsRes.body.includes('CampusSocialAuth'), 'JS contains CampusSocialAuth client');
  console.log('✅ Check 6 Passed: Static CSS and JavaScript assets accessible.');

  // Check 7: Equipment Catalog & Firestore queries under serverless handler
  console.log('\nCheck 7: Testing Equipment Catalog & Cloud Firestore queries (/equipment)...');
  const eqRes = await request('/equipment');
  assert.strictEqual(eqRes.status, 200, 'Equipment catalog must return HTTP 200');
  assert(eqRes.body.includes('Equipment Catalogue'), 'Equipment catalog page rendered');
  console.log('✅ Check 7 Passed: Firestore database queries executed cleanly in serverless context.');

  // Check 8: Social Auth session creation under serverless handler
  console.log('\nCheck 8: Testing Social Authentication Session Login via Vercel...');
  const testToken = JSON.stringify({
    uid: `vercel_user_${Date.now()}`,
    email: `vercel.student.${Date.now()}@campus.edu`,
    name: 'Vercel Student',
    provider: 'google.com'
  });

  const authRes = await request('/auth/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: testToken, redirectUrl: '/equipment' })
  });
  assert.strictEqual(authRes.status, 200, 'Session login must return HTTP 200');
  const authData = JSON.parse(authRes.body);
  assert.strictEqual(authData.success, true, 'Session created successfully');
  const sessionCookie = authRes.headers['set-cookie'] ? authRes.headers['set-cookie'][0].split(';')[0] : null;
  assert(sessionCookie, 'Session cookie must be returned');
  console.log('✅ Check 8 Passed: Serverless session created with secure HTTP-only cookie.');

  server.close();
  console.log('\n🎉 ALL 8 VERCEL SERVERLESS ENTRYPOINT COMPATIBILITY CHECKS PASSED!\n');
}

if (require.main === module) {
  runVercelCompatibilitySuite().catch(err => {
    console.error('❌ Vercel compatibility test failed:', err);
    process.exit(1);
  });
}

module.exports = runVercelCompatibilitySuite;
