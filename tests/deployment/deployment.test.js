/**
 * Phase 19 & 20 Deployment and Production Resilience Automated Test Suite
 * Tests Serverless export (api/index.js), Vercel endpoints, route aliases,
 * static asset delivery, and log hygiene.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const vercelHandler = require('../../api/index');

async function runDeploymentTests() {
  console.log('🧪 [DEPLOYMENT] Starting Phase 19 & 20 Deployment & Vercel Compatibility Suite...');

  // 1. Serverless Handler Export Check
  console.log('  Test 19.1: Verifying api/index.js exports Express handler...');
  assert.strictEqual(typeof vercelHandler, 'function', 'api/index.js must export Express function');
  assert.strictEqual(typeof vercelHandler.listen, 'function', 'Exported handler is standard Express app');

  const client = new TestClient();
  await client.start();

  try {
    // 2. Health Endpoint Probe
    console.log('  Test 19.2: Probing /health endpoint...');
    const healthRes = await client.request('/health');
    assert.strictEqual(healthRes.status, 200, '/health must return 200');
    assert.strictEqual(healthRes.json.status, 'ok', 'Status must be ok');

    // 3. Public Route Aliases & Views
    console.log('  Test 19.3: Route aliases and EJS rendering (/login, /register, /dashboard, /chatbot)...');
    const homeRes = await client.request('/');
    assert.strictEqual(homeRes.status, 200, 'Home page must return 200');

    const loginRes = await client.request('/login');
    assert.strictEqual(loginRes.status, 200, 'Login page must return 200');

    const regRes = await client.request('/register');
    assert.strictEqual(regRes.status, 200, 'Register page must return 200');

    const dashRes = await client.request('/dashboard');
    assert.strictEqual(dashRes.status, 302, 'Dashboard must redirect to /borrow/my-loans');

    const chatRes = await client.request('/chatbot');
    assert.strictEqual(chatRes.status, 200, 'Chatbot assistant page must return 200');

    // 4. Static Assets Delivery
    console.log('  Test 19.4: Static asset accessibility (/css/style.css, /js/socialAuth.js)...');
    const cssRes = await client.request('/css/style.css');
    assert.strictEqual(cssRes.status, 200, 'CSS file must be served');
    assert(cssRes.body.includes('--color-primary: #2563EB'), 'CSS must include design tokens');

    const jsRes = await client.request('/js/socialAuth.js');
    assert.strictEqual(jsRes.status, 200, 'Social auth client JS must be served');

    // 5. 404 Error Safety
    console.log('  Test 19.5: 404 Error page safety and zero secret exposure...');
    const notFoundRes = await client.request('/non-existent-campus-url');
    assert.strictEqual(notFoundRes.status, 404, '404 page must return 404');
    assert(!notFoundRes.body.includes('FIREBASE_PRIVATE_KEY'), 'Zero private key leakage');
    assert(!notFoundRes.body.includes('SESSION_SECRET'), 'Zero secret leakage');

    console.log('✅ [DEPLOYMENT] All 5 Phase 19 & 20 Deployment Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runDeploymentTests;

if (require.main === module) {
  runDeploymentTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [DEPLOYMENT] Suite Failed:', err);
    process.exit(1);
  });
}
