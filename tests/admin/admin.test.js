/**
 * Phase 7 Admin Automated Test Suite
 * Tests Admin Login, Administrator Dashboard, Operational Metrics Access,
 * and Negative RBAC Boundaries (Student -> Admin blocked, Senior -> Admin blocked).
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');

async function runAdminTests() {
  console.log('🧪 [ADMIN] Starting Phase 7 Admin Test Suite...');
  await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const adminCookie = await client.loginAs('adminA');
    const studentCookie = await client.loginAs('studentA');
    const seniorCookie = await client.loginAs('seniorA');

    // 1. Admin Login & Dashboard View
    console.log('  Test 7.1: Campus Administrator Dashboard access...');
    const adminDash = await client.request('/admin', { cookie: adminCookie });
    assert.strictEqual(adminDash.status, 200, 'Admin dashboard returns 200');
    assert(adminDash.body.includes('Campus Administrator Dashboard') || adminDash.body.includes('Campus Administration'), 'Must render admin dashboard');

    // 2. Negative RBAC: Student blocked from Admin Portal
    console.log('  Test 7.2: Negative RBAC: Student blocked from /admin...');
    const studentBlockedRes = await client.request('/admin', { cookie: studentCookie });
    assert.strictEqual(studentBlockedRes.status, 302, 'Student accessing /admin must be redirected (302)');

    // 3. Negative RBAC: Senior blocked from Admin Portal
    console.log('  Test 7.3: Negative RBAC: Senior blocked from /admin...');
    const seniorBlockedRes = await client.request('/admin', { cookie: seniorCookie });
    assert.strictEqual(seniorBlockedRes.status, 302, 'Senior accessing /admin must be redirected (302)');

    // 4. Authenticated Operational Metrics Endpoint
    console.log('  Test 7.4: Operational Metrics API access control...');
    // Unauthenticated access
    const unauthMetrics = await client.request('/admin/api/metrics');
    assert.strictEqual(unauthMetrics.status, 302, 'Unauthenticated user redirected from /admin/api/metrics');

    // Student access
    const studentMetrics = await client.request('/admin/api/metrics', { cookie: studentCookie });
    assert.strictEqual(studentMetrics.status, 302, 'Student redirected from /admin/api/metrics');

    // Admin access
    const adminMetrics = await client.request('/admin/api/metrics', { cookie: adminCookie });
    assert.strictEqual(adminMetrics.status, 200, 'Admin receives 200 from /admin/api/metrics');
    assert(adminMetrics.json.requests && typeof adminMetrics.json.requests.total === 'number', 'Metrics must report requests.total');
    assert(adminMetrics.json.latencyMs, 'Metrics must include latency percentiles');

    console.log('✅ [ADMIN] All 4 Phase 7 Admin Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runAdminTests;

if (require.main === module) {
  runAdminTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [ADMIN] Suite Failed:', err);
    process.exit(1);
  });
}
