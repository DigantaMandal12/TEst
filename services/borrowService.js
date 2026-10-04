/**
 * Borrow Service
 * Implements business operations for reservation intake, Sunday restrictions,
 * collision prevention, senior approval, equipment pickup, and return verification.
 */

const borrowRepository = require('../repositories/borrowRepository');
const equipmentRepository = require('../repositories/equipmentRepository');
const userRepository = require('../repositories/userRepository');
const notificationRepository = require('../repositories/notificationRepository');
const { 
  CAMPUS_PICKUP_LOCATIONS, 
  STANDARD_PICKUP_SLOTS, 
  getAvailablePickupDates, 
  generateOrderNumber, 
  getSellerOrderNotification, 
  getBuyerReadyNotification,
  isSlotAvailable
} = require('../config/pickupConfig');

class BorrowService {
  async getRequestFormData(equipmentId, currentUser) {
    const equipment = await equipmentRepository.findById(equipmentId);
    if (!equipment) throw new Error('Equipment not found.');
    if (equipment.status !== 'available') throw new Error('This equipment is currently not available for borrowing.');

    // Trust Score Gatekeeper
    const userTrustScore = (currentUser && currentUser.trustScore) || 85;
    if (userTrustScore < (equipment.minTrustScore || 60)) {
      throw new Error(`Minimum Trust Score of ${equipment.minTrustScore} required. Your current score is ${userTrustScore}.`);
    }

    const availableDates = getAvailablePickupDates(7);
    const existingRequests = await borrowRepository.find({
      equipment: equipmentId,
      status: { $in: ['pending', 'approved', 'active'] }
    });

    return {
      equipment,
      availableDates,
      pickupSlots: STANDARD_PICKUP_SLOTS,
      locations: CAMPUS_PICKUP_LOCATIONS,
      existingRequests
    };
  }

  async submitBorrowRequest(body, currentUser) {
    const { equipmentId, pickupDate, pickupSlotId, pickupLocation, returnDate, purpose } = body;
    const equipment = await equipmentRepository.findById(equipmentId);
    if (!equipment) throw new Error('Equipment not found.');

    // Sunday restriction
    const checkDate = new Date(pickupDate);
    if (checkDate.getDay() === 0) {
      throw new Error('Sundays are closed for campus equipment pickup.');
    }

    const slotInfo = STANDARD_PICKUP_SLOTS.find(s => s.id === pickupSlotId) || { label: '2:00 PM – 2:30 PM' };
    const orderNumber = generateOrderNumber();
    const borrowerId = currentUser ? (currentUser.uid || currentUser.id || currentUser._id) : 'usr_default';
    const borrowerName = currentUser ? currentUser.name : 'Student';
    const lenderId = equipment.ownerId || 'usr_default';

    const formattedPickupDate = new Date(pickupDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Use atomic Firestore transactional reservation to prevent concurrent slot collision
    const requestData = {
      orderNumber,
      equipment: equipmentId,
      equipmentId,
      equipmentTitle: equipment.title,
      borrower: borrowerId,
      borrowerId,
      borrowerName,
      lender: lenderId,
      lenderId,
      pickupDate,
      pickupDateStr: formattedPickupDate,
      pickupSlotId,
      pickupTime: slotInfo.label,
      pickupLocation: pickupLocation || equipment.pickupLocation,
      returnDate: returnDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      purpose: purpose || 'Academic coursework',
      paymentStatus: 'PAID',
      depositAmount: equipment.deposit || 0,
      depositRefunded: false
    };

    const newRequest = await borrowRepository.reserveSlotAtomic(requestData);

    // Notify lender / senior custodian
    const sellerNotifMsg = getSellerOrderNotification({
      borrower: { name: borrowerName },
      orderNumber,
      equipment: { title: equipment.title },
      pickupLocation: requestData.pickupLocation,
      pickupDateStr: formattedPickupDate,
      pickupTime: slotInfo.label
    });

    await notificationRepository.create({
      user: lenderId,
      userId: lenderId,
      title: '🔔 NEW ORDER',
      message: sellerNotifMsg,
      link: '/borrow/lender',
      read: false,
      category: 'order'
    });

    return newRequest;
  }

  async approveRequest(orderId, seniorUser) {
    const borrowReq = await borrowRepository.findById(orderId);
    if (!borrowReq) throw new Error('Borrow request not found.');

    await borrowRepository.update(orderId, { status: 'approved' });

    // Mark equipment reserved
    if (borrowReq.equipmentId) {
      await equipmentRepository.update(borrowReq.equipmentId, { status: 'reserved' });
    }

    // Generate Buyer Ready Notification
    const buyerReadyMsg = getBuyerReadyNotification({
      borrower: { name: borrowReq.borrowerName || 'Student' },
      orderNumber: borrowReq.orderNumber,
      equipment: { title: borrowReq.equipmentTitle || 'Equipment' },
      pickupLocation: borrowReq.pickupLocation,
      pickupDateStr: borrowReq.pickupDateStr,
      pickupTime: borrowReq.pickupTime
    });

    await notificationRepository.create({
      user: borrowReq.borrowerId,
      userId: borrowReq.borrowerId,
      title: '🔔 YOUR PRODUCT IS READY',
      message: buyerReadyMsg,
      link: '/borrow/my-loans',
      read: false,
      category: 'order'
    });

    return borrowReq;
  }

  async verifyReturn(orderId, inspectorUser, conditionNote = 'Clean and working') {
    const borrowReq = await borrowRepository.findById(orderId);
    if (!borrowReq) throw new Error('Borrow request not found.');

    await borrowRepository.update(orderId, {
      status: 'returned',
      depositRefunded: true,
      conditionAtReturn: conditionNote,
      actualReturnDate: new Date().toISOString()
    });

    // Make equipment available again
    if (borrowReq.equipmentId) {
      await equipmentRepository.update(borrowReq.equipmentId, { status: 'available' });
    }

    // Boost borrower Trust Score (+2 points)
    if (borrowReq.borrowerId) {
      const studentUser = await userRepository.findById(borrowReq.borrowerId);
      if (studentUser) {
        const curScore = studentUser.trustScore || 85;
        const newScore = Math.min(100, curScore + 2);
        const trustTier = newScore >= 90 ? 'Gold' : (newScore >= 75 ? 'Silver' : (newScore >= 60 ? 'Bronze' : 'New Member'));
        await userRepository.update(borrowReq.borrowerId, {
          trustScore: newScore,
          trustTier,
          totalBorrowed: (studentUser.totalBorrowed || 0) + 1
        });
      }
    }

    return borrowReq;
  }
}

module.exports = new BorrowService();
