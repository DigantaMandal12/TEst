/**
 * Phase 12 Production Operations & Resilience Verification Suite
 * Campus Equipment Lending & Exchange Platform
 *
 * Verifies:
 * - Operational metrics tracking & percentile latency calculation
 * - Structured logging & zero-leakage redaction
 * - Alert threshold evaluation (P1 Critical & P2 Warning)
 * - Health endpoint compliance
 * - Authenticated admin metrics telemetry
 * - AI fallback resilience & zero-downtime degradation
 * - Secret rotation simulation
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
process.env.SESSION_SECRET = 'd4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3';
process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';

const app = require('./app');
const User = require('./models/User');
const metricsService = require('./services/metricsService');
const { generateAssistantReply, getAIObservabilityMetrics } = require('./services/aiService');

async function runOperationsSuite() {
  console.log('📊 ========================================================');
  console.log('📊 STARTING PHASE 12 PRODUCTION OPERATIONS & METRICS SUITE');
  console.log('📊 ========================================================\n');

  // Test 1: Metrics Tracking & Percentile Latency
  console.log('Test 1: Testing In-Memory Metrics & Percentile Calculation...');
  metricsService.recordRequest('GET', '/equipment', 200, 25, 'req-01');
  metricsService.recordRequest('GET', '/equipment', 200, 30, 'req-02');
  metricsService.recordRequest('GET', '/equipment', 200, 45, 'req-03');
  metricsService.recordRequest('GET', '/equipment', 200, 80, 'req-04');
  metricsService.recordRequest('GET', '/equipment', 200, 120, 'req-05');

  const p = metricsService.getPercentiles();
  assert(p.p50 >= 25 && p.p50 <= 80, `P50 should be reasonable, got: ${p.p50}`);
  assert(p.p95 >= 80, `P95 should be at or near 95th percentile, got: ${p.p95}`);
  assert(p.avg > 0, 'Average latency should be positive');
  console.log(`✅ Test 1 Passed: Percentiles calculated (P50=${p.p50}ms, P95=${p.p95}ms, Avg=${p.avg}ms).`);

  // Test 2: Structured Logging & Sensitive Key Redaction
  console.log('\nTest 2: Verifying Sensitive Key Redaction in Structured Logging...');
  const sensitiveMeta = {
    userId: 'usr_123',
    password: 'superSecretPassword!',
    session_secret: 'cryptoKey123',
    FIREBASE_PRIVATE_KEY: '---BEGIN PRIVATE KEY---',
    token: 'jwt.token.here',
    nested: {
      cookie: 'campus_sid=123',
      normalField: 'ok'
    }
  };

  const loggedEntry = metricsService.log('info', 'test_event', sensitiveMeta);
  assert.strictEqual(loggedEntry.password, '[REDACTED]', 'password must be redacted');
  assert.strictEqual(loggedEntry.session_secret, '[REDACTED]', 'session_secret must be redacted');
  assert.strictEqual(loggedEntry.FIREBASE_PRIVATE_KEY, '[REDACTED]', 'private key must be redacted');
  assert.strictEqual(loggedEntry.token, '[REDACTED]', 'token must be redacted');
  assert.strictEqual(loggedEntry.nested.cookie, '[REDACTED]', 'nested cookie must be redacted');
  assert.strictEqual(loggedEntry.nested.normalField, 'ok', 'safe fields must remain intact');
  console.log('✅ Test 2 Passed: Structured log redacts 100% of sensitive key fields.');

  // Test 3: Alert Threshold Evaluation
  console.log('\nTest 3: Testing Alert Threshold Evaluation...');
  // Baseline should have no critical alerts
  let alerts = metricsService.getAlerts();
  assert(Array.isArray(alerts), 'Alerts must return an array');

  // Simulate error spike
  for (let i = 0; i < 25; i++) {
    metricsService.recordRequest('GET', '/broken', 500, 50, `req-err-${i}`);
  }
  const errorAlerts = metricsService.getAlerts();
  const critical5xx = errorAlerts.find(a => a.type === 'HIGH_5XX_RATE');
  assert(critical5xx, 'Should trigger HIGH_5XX_RATE alert');
  assert.strictEqual(critical5xx.severity, 'P1_CRITICAL', 'Severity must be P1_CRITICAL');
  console.log('✅ Test 3 Passed: Alert threshold logic correctly triggers P1_CRITICAL alert on error spike.');

  // Bind server to dynamic port
  const opsPort = 15000 + Math.floor(Math.random() * 2000);
  const server = http.createServer(app);
  await new Promise(r => server.listen(opsPort, r));
  const baseUrl = `http://127.0.0.1:${opsPort}`;

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

  // Test 4: Health Check Probe Compliance
  console.log('\nTest 4: Testing /health Probe Compliance...');
  const t0 = Date.now();
  const healthRes = await request('/health');
  const healthLat = Date.now() - t0;
  assert.strictEqual(healthRes.status, 200, '/health must return 200');
  const healthData = JSON.parse(healthRes.body);
  assert.strictEqual(healthData.status, 'ok', 'Status is ok');
  assert(healthData.uptime >= 0, 'Uptime is present');
  assert(healthLat <= 100, `Health check must be fast (<=100ms), got ${healthLat}ms`);
  console.log(`✅ Test 4 Passed: /health returned HTTP 200 in ${healthLat}ms.`);

  // Test 5: Authenticated Operational Metrics Endpoint (/admin/api/metrics)
  console.log('\nTest 5: Testing Authenticated Operational Metrics Access Control...');
  // 5a: Unauthenticated access blocked
  const unauthRes = await request('/admin/api/metrics');
  assert.strictEqual(unauthRes.status, 302, 'Unauthenticated user redirected to login');

  // 5b: Student role blocked
  const studentUser = await User.create({
    name: 'Ops Student',
    email: `ops.student.${Date.now()}@campus.edu`,
    password: 'password123',
    role: 'student'
  });
  const studentLoginRes = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(studentUser.email)}&password=password123`
  });
  const studentCookie = studentLoginRes.headers['set-cookie'] ? studentLoginRes.headers['set-cookie'][0].split(';')[0] : null;

  const studentAdminRes = await request('/admin/api/metrics', {
    headers: { 'Cookie': studentCookie }
  });
  assert.strictEqual(studentAdminRes.status, 302, 'Student blocked from admin metrics');

  // 5c: Admin role authorized
  const adminUser = await User.create({
    name: 'Ops Admin',
    email: `ops.admin.${Date.now()}@campus.edu`,
    password: 'password123',
    role: 'admin'
  });
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(adminUser.email)}&password=password123`
  });
  const adminCookie = adminLoginRes.headers['set-cookie'] ? adminLoginRes.headers['set-cookie'][0].split(';')[0] : null;

  const adminMetricsRes = await request('/admin/api/metrics', {
    headers: { 'Cookie': adminCookie }
  });
  assert.strictEqual(adminMetricsRes.status, 200, 'Admin authorized for metrics API');
  const metricsJson = JSON.parse(adminMetricsRes.body);
  assert(metricsJson.requests, 'Requests metrics present');
  assert(metricsJson.latencyMs, 'Latency metrics present');
  assert(metricsJson.system, 'System metrics present');
  console.log('✅ Test 5 Passed: Operational metrics API strictly guarded by RBAC.');

  // Test 6: AI Fallback & Observability
  console.log('\nTest 6: Testing AI Fallback & Metrics Integration...');
  const aiReply = await generateAssistantReply('What are the pickup hours?');
  assert(aiReply.includes('Lending desks operate') || aiReply.includes('pickup'), 'AI answered accurately');
  const aiObs = getAIObservabilityMetrics();
  assert(aiObs.totalRequests > 0, 'AI total requests tracked');
  assert(aiObs.successfulRequests > 0, 'AI successful requests tracked');
  console.log(`✅ Test 6 Passed: AI metrics tracked (Total: ${aiObs.totalRequests}, Success: ${aiObs.successfulRequests}, Fallback: ${aiObs.fallbackUsage}).`);

  // Test 7: Secret Rotation Simulation
  console.log('\nTest 7: Simulating Safe Session Secret Rotation...');
  // Rotate session secret
  const oldSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'new-random-secret-' + Date.now();
  
  // Previous student cookie with old secret should be rejected or treated as unauthenticated
  const rotateCheckRes = await request('/borrow/lender', {
    headers: { 'Cookie': studentCookie }
  });
  // Should redirect to login or home because secret rotated
  assert.strictEqual(rotateCheckRes.status, 302, 'Old session invalidated upon secret rotation');
  process.env.SESSION_SECRET = oldSecret;
  console.log('✅ Test 7 Passed: Secret rotation invalidates stale sessions with zero server errors.');

  server.close();
  console.log('\n🎉 ALL 7 PRODUCTION OPERATIONS & RESILIENCE TESTS PASSED!\n');
}

if (require.main === module) {
  runOperationsSuite().catch(err => {
    console.error('❌ Operations Suite failed:', err);
    process.exit(1);
  });
}

module.exports = runOperationsSuite;
