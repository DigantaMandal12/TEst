/**
 * Controlled AI Application Tools (Least Privilege Firestore Integration)
 * Phase 7 Production Standard & Phase 8 Zero-Trust Hardening
 * 
 * Strict Zero-Trust Guardrails:
 * 1. Only query allowed collections (equipment, borrowRequests, official campus policies).
 * 2. Never expose passwords, private keys, admin tokens, or other users' personal info.
 * 3. Enforce authenticated user boundary on user-specific tools.
 * 4. Zero hallucination: only return real data from Cloud Firestore.
 */

const equipmentRepository = require('../repositories/equipmentRepository');
const borrowRepository = require('../repositories/borrowRepository');
const { CAMPUS_PICKUP_LOCATIONS, STANDARD_PICKUP_SLOTS } = require('../config/pickupConfig');

/**
 * 1. Search equipment inventory by keyword, category, or specifications
 */
async function searchEquipment(params = {}) {
  const query = typeof params === 'string' ? params : (params.q || params.query || '');
  const category = params.category || null;

  const filters = {};
  if (category && category !== 'All') filters.category = category;

  let items = await equipmentRepository.find(filters);

  if (query && query.trim()) {
    const qLower = query.toLowerCase().trim();
    items = items.filter(i => 
      (i.title && i.title.toLowerCase().includes(qLower)) ||
      (i.category && i.category.toLowerCase().includes(qLower)) ||
      (i.description && i.description.toLowerCase().includes(qLower)) ||
      (Array.isArray(i.specs) && i.specs.some(s => s.toLowerCase().includes(qLower)))
    );
  }

  // Return only sanitized public fields
  return items.map(item => ({
    id: item._id || item.id,
    title: item.title,
    category: item.category,
    department: item.department,
    condition: item.condition,
    dailyFee: item.dailyFee,
    deposit: item.deposit,
    status: item.status,
    pickupLocation: item.pickupLocation,
    minTrustScore: item.minTrustScore,
    maxBorrowDays: item.maxBorrowDays
  }));
}

/**
 * 2. Get specific equipment details by ID
 */
async function getEquipmentDetails(equipmentId) {
  if (!equipmentId || typeof equipmentId !== 'string') return null;
  const item = await equipmentRepository.findById(equipmentId.trim());
  if (!item) return null;

  return {
    id: item._id || item.id,
    title: item.title,
    category: item.category,
    department: item.department,
    description: item.description,
    specs: item.specs || [],
    condition: item.condition,
    dailyFee: item.dailyFee,
    deposit: item.deposit,
    status: item.status,
    pickupLocation: item.pickupLocation,
    minTrustScore: item.minTrustScore,
    maxBorrowDays: item.maxBorrowDays,
    custodianName: item.ownerName || 'Department Lab Store'
  };
}

/**
 * 3. Find only available equipment ready for immediate borrowing
 */
async function findAvailableEquipment(params = {}) {
  const all = await searchEquipment(params);
  return all.filter(item => item.status === 'available');
}

/**
 * 4. Get campus pickup stations
 */
function getPickupStations() {
  return [...CAMPUS_PICKUP_LOCATIONS];
}

/**
 * 5. Get campus pickup operating rules & schedule
 */
function getPickupRules() {
  return {
    operatingHours: 'Monday through Saturday, 10:00 AM – 4:30 PM',
    sundayPolicy: 'STRICTLY CLOSED on Sundays. No station pickup or returns are conducted on Sundays.',
    timeSlots: STANDARD_PICKUP_SLOTS.map(s => s.label),
    requirements: [
      'Valid student or faculty College ID card must be presented for verification.',
      'Deposit must be paid in advance via campus digital wallet.',
      '30-minute arrival window must be strictly observed.'
    ]
  };
}

/**
 * 6. Get campus borrowing, deposit, and Trust Score rules
 */
function getBorrowingRules() {
  return {
    depositRefund: 'Security deposits are held in campus escrow and 100% refunded immediately upon equipment return inspection.',
    trustTiers: {
      gold: 'Trust Score 90+: Zero-deposit checkout privilege, priority request queue.',
      silver: 'Trust Score 75-89: Standard deposit, up to 3 concurrent loans.',
      bronze: 'Trust Score 60-74: Standard deposit, 1 concurrent loan.',
      restricted: 'Trust Score < 60: Requires senior faculty co-signature.'
    },
    loanDuration: 'Standard maximum duration is 7 to 14 days depending on instrument class. Returns after the due date reduce Trust Score by -5 points/day.'
  };
}

/**
 * 7. Get user's current active borrowing status
 * Strictly enforces user ownership: user can only query their own records.
 */
async function getUserBorrowStatus(userId, requestingUser) {
  if (!userId) return null;
  
  // Zero-Trust Authorization check: Must be authenticated and either own user or admin
  if (!requestingUser) {
    throw new Error('UNAUTHORIZED_ACCESS: Authentication required to query borrowing records.');
  }

  const reqId = requestingUser.userId || requestingUser.id || requestingUser._id;
  if (requestingUser.role !== 'admin' && String(reqId) !== String(userId)) {
    throw new Error('UNAUTHORIZED_ACCESS: You may only query your own borrowing records.');
  }

  const activeRequests = await borrowRepository.find({
    borrower: userId,
    status: { $in: ['pending', 'approved', 'active'] }
  });

  return activeRequests.map(r => {
    let nextAction = 'Awaiting senior custodian review.';
    if (r.status === 'approved') {
      nextAction = `Approved! Collect at ${r.pickupLocation} on ${r.pickupDateStr || r.pickupDate} (${r.pickupTime}).`;
    } else if (r.status === 'active') {
      nextAction = `Currently in use. Scheduled return date is ${r.returnDate}.`;
    }

    return {
      orderNumber: r.orderNumber,
      equipmentId: r.equipmentId,
      equipmentTitle: r.equipment ? (typeof r.equipment === 'object' ? r.equipment.title : 'Equipment') : 'Equipment',
      status: r.status,
      pickupDate: r.pickupDateStr || r.pickupDate,
      pickupTime: r.pickupTime,
      pickupLocation: r.pickupLocation,
      returnDate: r.returnDate,
      depositAmount: r.depositAmount,
      nextAction
    };
  });
}

/**
 * 8. Get user's completed loan history
 */
async function getUserBorrowHistory(userId, requestingUser) {
  if (!userId) return [];
  
  if (!requestingUser) {
    throw new Error('UNAUTHORIZED_ACCESS: Authentication required to query borrowing records.');
  }

  const reqId = requestingUser.userId || requestingUser.id || requestingUser._id;
  if (requestingUser.role !== 'admin' && String(reqId) !== String(userId)) {
    throw new Error('UNAUTHORIZED_ACCESS: You may only query your own borrowing records.');
  }

  const completed = await borrowRepository.find({
    borrower: userId,
    status: 'returned'
  });

  return completed.map(r => ({
    orderNumber: r.orderNumber,
    equipmentTitle: r.equipment ? (typeof r.equipment === 'object' ? r.equipment.title : 'Equipment') : 'Equipment',
    returnDate: r.returnDate,
    depositRefunded: r.depositRefunded || true
  }));
}

/**
 * 9. Smart Equipment Recommendations
 * Matches student practical project needs with real available inventory in Firestore.
 */
async function recommendEquipment(needQuery, userContext = {}) {
  const queryLower = (needQuery || '').toLowerCase();
  const available = await findAvailableEquipment();

  // Branch matching heuristics
  let targetCategories = [];
  if (queryLower.includes('circuit') || queryLower.includes('voltage') || queryLower.includes('electronics') || queryLower.includes('signal') || queryLower.includes('resistor')) {
    targetCategories.push('Electrical');
  }
  if (queryLower.includes('drawing') || queryLower.includes('drafter') || queryLower.includes('dimension') || queryLower.includes('gear') || queryLower.includes('machine') || queryLower.includes('cad')) {
    targetCategories.push('Mechanical');
  }
  if (queryLower.includes('survey') || queryLower.includes('theodolite') || queryLower.includes('level') || queryLower.includes('ground') || queryLower.includes('elevation') || queryLower.includes('compass')) {
    targetCategories.push('Survey');
  }
  if (queryLower.includes('concrete') || queryLower.includes('slump') || queryLower.includes('structure') || queryLower.includes('soil')) {
    targetCategories.push('Civil');
  }
  if (queryLower.includes('arduino') || queryLower.includes('iot') || queryLower.includes('sensor') || queryLower.includes('calculator') || queryLower.includes('code') || queryLower.includes('embedded')) {
    targetCategories.push('Other Engineering Equipment');
  }

  let recommendations = available.filter(item => {
    // If specific categories detected, prioritize them
    if (targetCategories.length > 0 && targetCategories.includes(item.category)) {
      return true;
    }
    // Keyword match on title or specs
    return item.title.toLowerCase().includes(queryLower) ||
      (Array.isArray(item.specs) && item.specs.some(s => s.toLowerCase().includes(queryLower)));
  });

  // If no specific match, fallback to highest rated available tools
  if (recommendations.length === 0) {
    recommendations = available.slice(0, 3);
  } else {
    recommendations = recommendations.slice(0, 3);
  }

  return recommendations.map(item => ({
    id: item.id,
    title: item.title,
    category: item.category,
    condition: item.condition,
    deposit: item.deposit,
    pickupLocation: item.pickupLocation,
    url: `/equipment/${item.id}`,
    action: 'Borrow Now'
  }));
}

module.exports = {
  searchEquipment,
  getEquipmentDetails,
  findAvailableEquipment,
  getPickupStations,
  getPickupRules,
  getBorrowingRules,
  getUserBorrowStatus,
  getUserBorrowHistory,
  recommendEquipment
};
