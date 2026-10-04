const BorrowRequest = require('../models/BorrowRequest');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { 
  CAMPUS_PICKUP_LOCATIONS, 
  STANDARD_PICKUP_SLOTS, 
  getAvailablePickupDates, 
  generateOrderNumber, 
  getSellerOrderNotification, 
  getBuyerReadyNotification,
  isSlotAvailable
} = require('../config/pickupConfig');

async function requestForm(req, res, next) {
  try {
    const equipment = await Equipment.findById(req.params.equipmentId);
    if (!equipment) {
      if (req.session) req.session.flash = { error: 'Equipment not found.' };
      return res.redirect('/equipment');
    }

    if (equipment.status !== 'available') {
      if (req.session) req.session.flash = { error: 'This equipment is currently not available for borrowing.' };
      return res.redirect(`/equipment/${equipment._id || equipment.id}`);
    }

    // Zero-Trust: Verify Trust Score from database, not untrusted client session
    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    let userTrustScore = 80;
    if (currentUserId) {
      const userInDb = await User.findById(currentUserId);
      if (userInDb && typeof userInDb.trustScore === 'number') {
        userTrustScore = userInDb.trustScore;
      }
    }

    if (userTrustScore < (equipment.minTrustScore || 60)) {
      if (req.session) {
        req.session.flash = { 
          error: `Minimum Trust Score of ${equipment.minTrustScore} required. Your current score is ${userTrustScore}.` 
        };
      }
      return res.redirect(`/equipment/${equipment._id || equipment.id}`);
    }

    const availableDates = getAvailablePickupDates(7);
    const existingRequests = await BorrowRequest.find({
      equipment: equipment._id || equipment.id,
      status: { $in: ['pending', 'approved', 'active'] }
    });

    res.render('borrow/request', {
      pageTitle: `Borrow ${equipment.title}`,
      equipment,
      availableDates,
      pickupSlots: STANDARD_PICKUP_SLOTS,
      locations: CAMPUS_PICKUP_LOCATIONS,
      existingRequests
    });
  } catch (err) {
    next(err);
  }
}

async function submitRequest(req, res, next) {
  try {
    const { equipmentId, pickupDate, pickupSlotId, pickupLocation, returnDate, purpose } = req.body;
    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) {
      if (req.session) req.session.flash = { error: 'Equipment not found.' };
      return res.redirect('/equipment');
    }

    const borrowerId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const lenderId = equipment.owner || null;

    // Self-Borrowing Prevention
    if (lenderId && borrowerId && String(lenderId) === String(borrowerId)) {
      if (req.session) req.session.flash = { error: 'You cannot borrow equipment that you personally listed.' };
      return res.redirect(`/equipment/${equipmentId}`);
    }

    // Zero-Trust Trust Score Verification from authoritative database
    if (borrowerId) {
      const borrowerUser = await User.findById(borrowerId);
      const actualScore = (borrowerUser && borrowerUser.trustScore) || 80;
      if (actualScore < (equipment.minTrustScore || 60)) {
        if (req.session) req.session.flash = { error: `Insufficient Trust Score (${actualScore}). Minimum ${equipment.minTrustScore} required.` };
        return res.redirect(`/equipment/${equipmentId}`);
      }
    }

    // Sunday validation check
    const checkDate = new Date(pickupDate);
    if (checkDate.getDay() === 0) {
      if (req.session) req.session.flash = { error: 'Sundays are closed for campus equipment pickup.' };
      return res.redirect(`/borrow/request/${equipmentId}`);
    }

    // Slot collision verification
    const bookedOnDate = await BorrowRequest.find({
      pickupDate,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    if (!isSlotAvailable(pickupDate, pickupSlotId, bookedOnDate)) {
      if (req.session) req.session.flash = { error: 'Selected pickup slot was just booked. Please pick another time slot.' };
      return res.redirect(`/borrow/request/${equipmentId}`);
    }

    const slotInfo = STANDARD_PICKUP_SLOTS.find(s => s.id === pickupSlotId) || { label: '2:00 PM – 2:30 PM' };
    const orderNumber = generateOrderNumber();

    const formattedPickupDate = new Date(pickupDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Zero-Trust: Deposit amount is strictly populated from the database equipment document
    const borrowRequest = await BorrowRequest.create({
      orderNumber,
      equipment: equipment._id || equipment.id,
      borrower: borrowerId,
      lender: lenderId,
      pickupDate,
      pickupDateStr: formattedPickupDate,
      pickupSlotId,
      pickupTime: slotInfo.label,
      pickupLocation: pickupLocation || equipment.pickupLocation,
      returnDate,
      purpose: purpose || 'Academic coursework',
      status: 'pending',
      paymentStatus: 'PAID',
      depositAmount: equipment.deposit || 0
    });

    // Mark equipment as reserved
    await Equipment.findByIdAndUpdate(equipment._id || equipment.id, { status: 'reserved' });

    // Generate Seller/Lender Notification
    if (lenderId) {
      const sellerNotif = getSellerOrderNotification({
        orderNumber,
        equipment: { title: equipment.title },
        borrower: { name: (req.session.user && req.session.user.name) || 'Student' },
        pickupLocation: borrowRequest.pickupLocation,
        pickupDateStr: formattedPickupDate,
        pickupTime: slotInfo.label
      });

      await Notification.create({
        user: lenderId,
        title: sellerNotif.title,
        message: sellerNotif.message,
        link: '/borrow/lender',
        category: 'order'
      });
    }

    // Confirmation for borrower
    await Notification.create({
      user: borrowerId,
      title: '📦 Borrow Request Submitted',
      message: `Your request #${orderNumber} for "${equipment.title}" was submitted. Awaiting Senior approval.`,
      link: '/borrow/my-loans',
      category: 'order'
    });

    if (req.session) {
      req.session.flash = { 
        success: `Order #${orderNumber} submitted successfully! The senior owner has been notified for approval.` 
      };
    }

    res.redirect('/borrow/my-loans');
  } catch (err) {
    next(err);
  }
}

async function borrowerDashboard(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;

    const activeLoans = await BorrowRequest.find({
      borrower: userId,
      status: { $in: ['pending', 'approved', 'active'] }
    }).populate('equipment');

    const pastLoans = await BorrowRequest.find({
      borrower: userId,
      status: { $in: ['returned', 'declined', 'cancelled'] }
    }).populate('equipment');

    res.render('dashboard/borrower', {
      pageTitle: 'My Active Loans & Requests',
      activeLoans,
      pastLoans
    });
  } catch (err) {
    next(err);
  }
}

async function lenderDashboard(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';

    const lenderFilter = userRole === 'admin' ? {} : { lender: userId };

    const pendingRequests = await BorrowRequest.find({
      ...lenderFilter,
      status: 'pending'
    }).populate('equipment').populate('borrower');

    const activeLent = await BorrowRequest.find({
      ...lenderFilter,
      status: { $in: ['approved', 'active'] }
    }).populate('equipment').populate('borrower');

    const completedLoans = await BorrowRequest.find({
      ...lenderFilter,
      status: 'returned'
    }).populate('equipment').populate('borrower');

    res.render('dashboard/lender', {
      pageTitle: 'Senior Lender Dashboard',
      pendingRequests,
      activeLent,
      completedLoans
    });
  } catch (err) {
    next(err);
  }
}

async function approveRequest(req, res, next) {
  try {
    const request = await BorrowRequest.findById(req.params.id).populate('equipment').populate('borrower');
    if (!request) {
      if (req.session) req.session.flash = { error: 'Request not found.' };
      return res.redirect('/borrow/lender');
    }

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const borrowerId = request.borrowerId || (request.borrower && (request.borrower._id || request.borrower.id)) || request.borrower;
    const lenderId = request.lenderId || (request.lender && (request.lender._id || request.lender.id)) || request.lender;

    // Self-Approval Defense: Borrower CANNOT approve their own borrow request
    if (borrowerId && currentUserId && String(borrowerId) === String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: You cannot approve your own borrow request.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You cannot approve your own borrow request.</p>');
    }

    // Horizontal Privilege Defense: Non-admin seniors can only approve requests for their own items
    if (userRole !== 'admin' && lenderId && currentUserId && String(lenderId) !== String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to approve requests for equipment owned by another peer.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to approve requests for equipment owned by another peer.</p>');
    }

    await BorrowRequest.findByIdAndUpdate(request._id || request.id, { status: 'approved' });

    // Send Buyer Ready Notification
    const buyerNotif = getBuyerReadyNotification({
      orderNumber: request.orderNumber,
      equipment: { title: (request.equipment && request.equipment.title) || 'Equipment' },
      pickupLocation: request.pickupLocation,
      pickupDateStr: request.pickupDateStr,
      pickupTime: request.pickupTime
    });

    await Notification.create({
      user: borrowerId,
      title: buyerNotif.title,
      message: buyerNotif.message,
      link: '/borrow/my-loans',
      category: 'approval'
    });

    if (req.session) {
      req.session.flash = { 
        success: `Order #${request.orderNumber} approved! Ready notification sent to student.` 
      };
    }
    res.redirect('/borrow/lender');
  } catch (err) {
    next(err);
  }
}

async function declineRequest(req, res, next) {
  try {
    const request = await BorrowRequest.findById(req.params.id).populate('equipment');
    if (!request) {
      if (req.session) req.session.flash = { error: 'Request not found.' };
      return res.redirect('/borrow/lender');
    }

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const borrowerId = request.borrowerId || (request.borrower && (request.borrower._id || request.borrower.id)) || request.borrower;
    const lenderId = request.lenderId || (request.lender && (request.lender._id || request.lender.id)) || request.lender;

    // Self-Action Defense
    if (borrowerId && currentUserId && String(borrowerId) === String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: Borrowers cannot decline requests via the senior approval portal.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: Borrowers cannot decline requests via the senior approval portal.</p>');
    }

    // Horizontal Privilege Defense: Non-admin seniors can only decline requests for their own items
    if (userRole !== 'admin' && lenderId && currentUserId && String(lenderId) !== String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to decline requests for another peer.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to decline requests for another peer.</p>');
    }

    await BorrowRequest.findByIdAndUpdate(request._id || request.id, { status: 'declined' });
    if (request.equipment) {
      await Equipment.findByIdAndUpdate(request.equipment._id || request.equipment.id, { status: 'available' });
    }
    await Notification.create({
      user: borrowerId,
      title: '⚠️ Request Declined',
      message: `Your borrow request #${request.orderNumber} could not be approved at this time.`,
      link: '/borrow/my-loans',
      category: 'alert'
    });

    if (req.session) req.session.flash = { success: 'Request declined.' };
    res.redirect('/borrow/lender');
  } catch (err) {
    next(err);
  }
}

async function confirmPickup(req, res, next) {
  try {
    const request = await BorrowRequest.findById(req.params.id);
    if (!request) {
      if (req.session) req.session.flash = { error: 'Request not found.' };
      return res.redirect('/borrow/my-loans');
    }

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const borrowerId = request.borrowerId || (request.borrower && (request.borrower._id || request.borrower.id)) || request.borrower;

    // IDOR Defense: Only the actual borrower (or admin) can confirm pickup
    if (userRole !== 'admin' && borrowerId && currentUserId && String(borrowerId) !== String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: Only the designated student borrower can confirm equipment collection.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: Only the designated student borrower can confirm equipment collection.</p>');
    }

    // State machine check: Request must be approved
    if (request.status !== 'approved') {
      if (req.session) req.session.flash = { error: 'Equipment cannot be collected until the request is approved.' };
      return res.redirect('/borrow/my-loans');
    }

    await BorrowRequest.findByIdAndUpdate(request._id || request.id, { status: 'active' });
    await Equipment.findByIdAndUpdate(request.equipmentId || request.equipment, { status: 'borrowed' });

    if (req.session) req.session.flash = { success: 'Equipment marked as collected and in-use.' };
    res.redirect(req.get('Referrer') || '/borrow/my-loans');
  } catch (err) {
    next(err);
  }
}

async function returnEquipment(req, res, next) {
  try {
    const request = await BorrowRequest.findById(req.params.id).populate('equipment');
    if (!request) return res.redirect('/borrow/my-loans');

    const currentUserId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';
    const borrowerId = request.borrowerId || (request.borrower && (request.borrower._id || request.borrower.id)) || request.borrower;
    const lenderId = request.lenderId || (request.lender && (request.lender._id || request.lender.id)) || request.lender;

    // IDOR Defense: Only the lender, borrower, or admin can interact with return verification
    if (userRole !== 'admin' && String(lenderId) !== String(currentUserId) && String(borrowerId) !== String(currentUserId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: You are not authorized to process returns for this order.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You are not authorized to process returns for this order.</p>');
    }

    // State machine check: Must be in active status to be returned
    if (request.status !== 'active') {
      if (req.session) req.session.flash = { error: 'Only actively borrowed equipment can be returned.' };
      return res.redirect('/borrow/my-loans');
    }

    await BorrowRequest.findByIdAndUpdate(request._id || request.id, { 
      status: 'returned',
      actualReturnDate: new Date(),
      depositRefunded: true
    });

    const eqId = request.equipment ? (request.equipment._id || request.equipment.id) : request.equipmentId;
    if (eqId) {
      await Equipment.findByIdAndUpdate(eqId, { 
        status: 'available' 
      });
    }

    if (req.session) {
      req.session.flash = { 
        success: `Equipment return verified! Security deposit of ₹${request.depositAmount || 0} marked as refunded. Please leave a rating!` 
      };
    }

    res.redirect(`/reviews/new?requestId=${request._id || request.id}&equipmentId=${eqId || ''}`);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestForm,
  submitRequest,
  borrowerDashboard,
  lenderDashboard,
  approveRequest,
  declineRequest,
  confirmPickup,
  returnEquipment
};
