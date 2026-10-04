/**
 * Phase 8 Equipment Automated Test Suite
 * Tests Equipment CRUD, Category Filtering, Text Search, Availability State Toggling,
 * Condition & Pickup Location, and Deletion.
 */

const assert = require('assert');
const TestClient = require('../config/testClient');
const { provisionTestAccounts } = require('../config/testAccounts');
const Equipment = require('../../models/Equipment');

async function runEquipmentTests() {
  console.log('🧪 [EQUIPMENT] Starting Phase 8 Equipment Test Suite...');
  const users = await provisionTestAccounts();

  const client = new TestClient();
  await client.start();

  try {
    const seniorCookie = await client.loginAs('seniorA');

    // 1. Create Equipment Listing
    console.log('  Test 8.1: Creating equipment listing...');
    const title = `Total Station Leica TS07 (Test ${Date.now()})`;
    const createBody = `title=${encodeURIComponent(title)}&category=Survey&description=Professional+1-second+accuracy+total+station&condition=Like+New&dailyFee=200&deposit=1500&pickupLocation=Civil+Surveying+Store&minTrustScore=80&specs=1-arcsec+accuracy%0ARed-dot+EDM`;
    const createRes = await client.request('/equipment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(createBody)
      },
      body: createBody,
      cookie: seniorCookie
    });
    assert.strictEqual(createRes.status, 302, 'Create should redirect (302)');

    const item = await Equipment.findOne({ title });
    assert(item, 'Equipment must exist in Firestore');
    assert.strictEqual(item.category, 'Survey');
    assert.strictEqual(item.dailyFee, 200);
    assert.strictEqual(item.deposit, 1500);
    assert.strictEqual(item.condition, 'Like New');
    assert.strictEqual(item.status, 'available');

    // 2. Read & Search Equipment
    console.log('  Test 8.2: Text search for created equipment...');
    const searchRes = await client.request(`/equipment?q=${encodeURIComponent('Leica')}`, { cookie: seniorCookie });
    assert.strictEqual(searchRes.status, 200);
    const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
    assert(searchRes.body.includes(title) || searchRes.body.includes(escapeHtml(title)), 'Search results must include created item');

    // 3. Filter by Category
    console.log('  Test 8.3: Filter by Survey category...');
    const catRes = await client.request('/equipment?category=Survey', { cookie: seniorCookie });
    assert.strictEqual(catRes.status, 200);
    assert(catRes.body.includes(title) || catRes.body.includes(escapeHtml(title)), 'Survey category must include item');

    // 4. Edit Equipment Listing
    console.log('  Test 8.4: Updating equipment details and fee...');
    const updateBody = `title=${encodeURIComponent(title)}&category=Survey&dailyFee=220&deposit=1600&pickupLocation=Civil+Surveying+Store&status=maintenance`;
    const updateRes = await client.request(`/equipment/${item._id || item.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(updateBody)
      },
      body: updateBody,
      cookie: seniorCookie
    });
    assert.strictEqual(updateRes.status, 302);
    const updatedItem = await Equipment.findById(item._id || item.id);
    assert.strictEqual(updatedItem.dailyFee, 220, 'Daily fee must be updated to 220');
    assert.strictEqual(updatedItem.status, 'maintenance', 'Status must be updated to maintenance');

    // 5. Delete Equipment Listing
    console.log('  Test 8.5: Deleting equipment listing...');
    const deleteRes = await client.request(`/equipment/${item._id || item.id}/delete`, {
      method: 'POST',
      cookie: seniorCookie
    });
    assert.strictEqual(deleteRes.status, 302, 'Delete must redirect to /equipment');
    const deletedItem = await Equipment.findById(item._id || item.id);
    assert(!deletedItem, 'Item must no longer exist in Firestore');

    console.log('✅ [EQUIPMENT] All 5 Phase 8 Equipment Tests Passed Successfully!\n');
    return true;
  } finally {
    await client.stop();
  }
}

module.exports = runEquipmentTests;

if (require.main === module) {
  runEquipmentTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [EQUIPMENT] Suite Failed:', err);
    process.exit(1);
  });
}
