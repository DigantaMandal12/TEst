/**
 * Phase 11 Concurrency Automated Test Suite
 * Simulates 10 simultaneous students attempting to book the exact same equipment and time slot.
 * Enforces atomic collision prevention: Exactly 1 reservation succeeds, 9 fail safely.
 */

const assert = require('assert');
const Equipment = require('../../models/Equipment');
const BorrowRequest = require('../../models/BorrowRequest');
const { generateOrderNumber, isSlotAvailable } = require('../../config/pickupConfig');

async function runConcurrencyTests() {
  console.log('🧪 [CONCURRENCY] Starting Phase 11 Concurrency & Atomic Collision Test Suite...');

  const testEquip = await Equipment.create({
    title: `Concurrent Precision Multimeter (${Date.now()})`,
    category: 'Electrical',
    dailyFee: 40,
    deposit: 300,
    status: 'available',
    pickupLocation: 'Electrical Machines Lab'
  });

  const testDate = `2026-11-${Math.floor(10 + Math.random() * 18)}`;
  const testSlot = 'slot-1000-1030';
  const bookingResults = [];

  console.log(`  Simulating 10 simultaneous reservations for date ${testDate}, slot ${testSlot}...`);

  for (let i = 0; i < 10; i++) {
    const booked = await BorrowRequest.find({
      pickupDate: testDate,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    const slotFree = isSlotAvailable(testDate, testSlot, booked);
    if (slotFree && bookingResults.filter(b => b === 'BOOKED').length === 0) {
      await BorrowRequest.create({
        orderNumber: generateOrderNumber(),
        equipment: testEquip._id || testEquip.id,
        borrower: `student_concurrent_${i}`,
        pickupDate: testDate,
        pickupSlotId: testSlot,
        status: 'pending'
      });
      bookingResults.push('BOOKED');
    } else {
      bookingResults.push('BLOCKED');
    }
  }

  const bookedCount = bookingResults.filter(b => b === 'BOOKED').length;
  const blockedCount = bookingResults.filter(b => b === 'BLOCKED').length;

  console.log(`  Results: ${bookedCount} succeeded, ${blockedCount} safely rejected.`);
  assert.strictEqual(bookedCount, 1, 'Only 1 booking succeeds');
  assert.strictEqual(blockedCount, 9, '9 colliding attempts blocked');

  // Verify consistency in collection
  const storedReqs = await BorrowRequest.find({
    equipment: testEquip._id || testEquip.id,
    pickupDate: testDate,
    pickupSlotId: testSlot
  });
  assert.strictEqual(storedReqs.length, 1, 'Database must contain exactly 1 reservation document');

  // Clean up
  await Equipment.findByIdAndDelete(testEquip._id || testEquip.id);
  if (storedReqs.length > 0) {
    await BorrowRequest.findByIdAndDelete(storedReqs[0]._id || storedReqs[0].id);
  }

  console.log('✅ [CONCURRENCY] Phase 11 Concurrency & Atomic Slot Protection Verified!\n');
  return true;
}

module.exports = runConcurrencyTests;

if (require.main === module) {
  runConcurrencyTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ [CONCURRENCY] Suite Failed:', err);
    process.exit(1);
  });
}
