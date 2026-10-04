/**
 * Master Automated Test Runner
 * Orchestrates all 17 automated test suites across Phases 1 to 30.
 * Guarantees zero credential leakage and verifies production readiness.
 */

const { provisionTestAccounts, cleanupTestAccounts } = require('./config/testAccounts');

const runAuthTests = require('./auth/auth.test');
const runOAuthTests = require('./oauth/oauth.test');
const runStudentTests = require('./student/student.test');
const runSeniorTests = require('./senior/senior.test');
const runAdminTests = require('./admin/admin.test');
const runEquipmentTests = require('./equipment/equipment.test');
const runBorrowingTests = require('./borrowing/borrowing.test');
const runConcurrencyTests = require('./concurrency/concurrency.test');
const runReturnTests = require('./return/return.test');
const runTrustTests = require('./trust/trust.test');
const runReviewsTests = require('./reviews/reviews.test');
const runFirebaseTests = require('./firebase/firebase.test');
const runSecurityTests = require('./security/security.test');
const runStorageTests = require('./storage/storage.test');
const runAITests = require('./ai/ai.test');
const runDeploymentTests = require('./deployment/deployment.test');
const runE2ETests = require('./e2e/e2e.test');

async function runAll() {
  console.log('================================================================');
  console.log('🧪 CAMPUS EQUIPMENT LENDING EXCHANGE — MASTER AUTOMATED TEST SUITE');
  console.log('================================================================\n');

  const startTime = Date.now();
  const results = [];

  const suites = [
    { name: 'Phase 3: Authentication Suite', fn: runAuthTests },
    { name: 'Phase 4: Social OAuth & Linking Suite', fn: runOAuthTests },
    { name: 'Phase 5: Student Experience Suite', fn: runStudentTests },
    { name: 'Phase 6: Senior/Faculty/Lender Suite', fn: runSeniorTests },
    { name: 'Phase 7: Administrator & Metrics Suite', fn: runAdminTests },
    { name: 'Phase 8: Equipment Catalog & CRUD Suite', fn: runEquipmentTests },
    { name: 'Phase 9 & 10: Borrowing Lifecycle & Edge Cases', fn: runBorrowingTests },
    { name: 'Phase 11: Concurrency & Atomic Slot Collision', fn: runConcurrencyTests },
    { name: 'Phase 12: Return System & Deposit Refund', fn: runReturnTests },
    { name: 'Phase 13: Trust Score & Tier Calibration', fn: runTrustTests },
    { name: 'Phase 14: Review & Rating System', fn: runReviewsTests },
    { name: 'Phase 15: Firebase Rules & Functions', fn: runFirebaseTests },
    { name: 'Phase 16: Security, RBAC, IDOR & CSRF', fn: runSecurityTests },
    { name: 'Phase 17: Storage & File Constraints', fn: runStorageTests },
    { name: 'Phase 18: AI Assistant & Grounding Suite', fn: runAITests },
    { name: 'Phase 19 & 20: Vercel & Production Resilience', fn: runDeploymentTests },
    { name: 'Phase 29: Final End-to-End Workflow', fn: runE2ETests }
  ];

  try {
    console.log('🔧 Provisioning clean test accounts...');
    await provisionTestAccounts();

    for (const suite of suites) {
      const suiteStart = Date.now();
      try {
        await suite.fn();
        const duration = Date.now() - suiteStart;
        results.push({ name: suite.name, status: 'PASS', duration });
      } catch (err) {
        const duration = Date.now() - suiteStart;
        results.push({ name: suite.name, status: 'FAIL', duration, error: err.message });
        console.error(`❌ Suite Failed: ${suite.name} (${err.message})`);
        throw err;
      }
    }

    console.log('🧹 Cleaning up test accounts...');
    await cleanupTestAccounts();

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log(`🎉 ALL ${suites.length} TEST SUITES PASSED IN ${totalDuration}s!`);
    console.log('================================================================\n');

    for (const r of results) {
      console.log(`  ✓ ${r.name.padEnd(50)} [${r.status}] (${r.duration}ms)`);
    }

    return true;
  } catch (err) {
    console.error('\n❌ MASTER TEST RUNNER ABORTED ON FAILURE:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runAll().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = runAll;
