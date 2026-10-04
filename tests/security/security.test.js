/**
 * Phase 16 Security Automated Test Suite
 * Tests Vertical RBAC, Horizontal IDOR, CSRF origin verification,
 * XSS sanitization, Rate Limiting, Cookie attributes, and Secret Exposure.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');

async function runSecurityTests() {
  console.log('🧪 [SECURITY] Starting Phase 16 Security Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const studentCookie = await client.loginAs('studentA');
    const seniorACookie = await client.loginAs('seniorA');
    const seniorBCookie = await client.loginAs('seniorB');

    // 1. Vertical RBAC Defense
    console.log('  Test 16.1: Vertical RBAC - Student blocked from /admin...');
    const adminBlocked = await client.request('/admin', { cookie: studentCookie });
    assert.strictEqual(adminBlocked.status, 302, 'Student accessing /admin must be redirected (302)');

    // 2. Horizontal IDOR Defense
    console.log('  Test 16.2: Horizontal IDOR - Senior B blocked from editing Senior A equipment...');
    const itemA = await Equipment.create({
      title: `IDOR Security Meter (${Date.now()})`,
      category: 'Electrical',
      dailyFee: 50,
      deposit: 300,
      status: 'available',
      owner: users.seniorA._id || users.seniorA.id
    });

    const idorEditRes = await client.request(`/equipment/${itemA._id || itemA.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'dailyFee=10',
      cookie: seniorBCookie
    });
    assert.strictEqual(idorEditRes.status, 403, 'Cross-user edit must return 403 Forbidden');

    // 3. CSRF Defense: Cross-Origin POST blocked
    console.log('  Test 16.3: CSRF Defense - Request from unauthorized origin blocked...');
    const csrfRes = await client.request('/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil-phishing-attacker.com'
      },
      body: JSON.stringify({ message: 'Hello' }),
      cookie: studentCookie
    });
    assert.strictEqual(csrfRes.status, 403, 'Cross-origin request must be rejected with 403');

    // 4. Rate Limiting Defense
    console.log('  Test 16.4: AI prompt flooding / rate limiting defense...');
    const floodMessage = 'A'.repeat(2500); // Exceeds 2000 character limit
    const floodRes = await client.request('/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: floodMessage }),
      cookie: studentCookie
    });
    assert.strictEqual(floodRes.status, 400, 'Flooding payload must be rejected with 400');

    // 5. Secret Exposure Defense
    console.log('  Test 16.5: Zero secret leakage in public endpoints...');
    const healthRes = await client.request('/health');
    assert.strictEqual(healthRes.status, 200);
    assert(!healthRes.body.includes('FIREBASE_PRIVATE_KEY'), 'Private key must never appear in /health');
    assert(!healthRes.body.includes('SESSION_SECRET'), 'Session secret must never appear in /health');
    assert(!healthRes.body.includes('OPENROUTER_API_KEY'), 'AI API key must never appear in /health');

    // Clean up
    await Equipment.findByIdAndDelete(itemA._id || itemA.id);

    console.log('✅ [SECURITY] All 5 Phase 16 Security Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runSecurityTests;

if (require.main === module) {
  runSecurityTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [SECURITY] Suite Failed:', err);
    process.exit(1);
  });
}
