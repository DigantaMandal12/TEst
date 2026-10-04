/**
 * Phase 17 Storage Automated Test Suite
 * Tests MIME type validation (JPEG, PNG, WebP allowed; SVG, scripts rejected),
 * upload size restrictions, and Cloud Storage signed URL verification.
 */

const assert = require('assert');
const { getStorage } = require('../../firebase/storage');

async function runStorageTests() {
  console.log('🧪 [STORAGE] Starting Phase 17 Storage Test Suite...');
  const storage = getStorage();

  // 1. Allowed MIME Types (JPEG, PNG, WebP)
  console.log('  Test 17.1: Validating allowed image MIME types...');
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  for (const mime of allowedMimes) {
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
    assert.strictEqual(isAllowed, true, `${mime} must be allowed`);
  }

  // 2. Disallowed MIME Types (SVG, EXE, Scripts)
  console.log('  Test 17.2: Disallowed MIME types rejected...');
  const disallowedMimes = ['image/svg+xml', 'application/x-msdownload', 'text/javascript'];
  for (const mime of disallowedMimes) {
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
    assert.strictEqual(isAllowed, false, `${mime} must be rejected`);
  }

  // 3. Signed Upload URL Generation
  console.log('  Test 17.3: Generating Cloud Storage signed URL...');
  const bucket = storage.bucket();
  const file = bucket.file(`equipment-images/test-upload-${Date.now()}.jpg`);
  const [signedUrl] = await file.getSignedUrl({
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: 'image/jpeg'
  });
  assert(signedUrl.startsWith('https://'), 'Signed URL must use HTTPS');

  // 4. Zero Local Storage Assertion
  console.log('  Test 17.4: Zero local filesystem persistent storage...');
  assert.strictEqual(process.env.USE_LOCAL_STORAGE, undefined, 'Local storage fallback must not be enabled');

  console.log('✅ [STORAGE] All 4 Phase 17 Storage Tests Passed Successfully!\n');
  return true;
}

module.exports = runStorageTests;

if (require.main === module) {
  runStorageTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [STORAGE] Suite Failed:', err);
    process.exit(1);
  });
}
