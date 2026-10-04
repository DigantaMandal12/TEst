const Review = require('../models/Review');
const Equipment = require('../models/Equipment');
const BorrowRequest = require('../models/BorrowRequest');
const User = require('../models/User');

async function newForm(req, res, next) {
  try {
    const { requestId, equipmentId } = req.query;
    let equipment = null;
    let request = null;

    if (requestId) {
      request = await BorrowRequest.findById(requestId).populate('equipment');
    }
    if (equipmentId) {
      equipment = await Equipment.findById(equipmentId);
    }
    if (!equipment && request && request.equipment) {
      equipment = request.equipment;
    }

    res.render('reviews/new', {
      pageTitle: 'Rate & Review Equipment',
      equipment,
      request
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { equipmentId, requestId, rating, punctualityRating, conditionRating, comment } = req.body;
    const reviewerId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    const userRole = req.session.user ? req.session.user.role : '';

    if (!requestId) {
      if (req.session) req.session.flash = { error: 'A valid completed borrow request ID is required to submit a review.' };
      return res.status(400).send('<h1>400 Bad Request</h1><p>A valid completed borrow request ID is required.</p>');
    }

    const borrowRequest = await BorrowRequest.findById(requestId);
    if (!borrowRequest) {
      if (req.session) req.session.flash = { error: 'Borrow record not found.' };
      return res.status(404).send('<h1>404 Not Found</h1><p>Borrow record not found.</p>');
    }

    const borrowerId = borrowRequest.borrowerId || (borrowRequest.borrower && (borrowRequest.borrower._id || borrowRequest.borrower.id)) || borrowRequest.borrower;

    // IDOR Defense: User can only review equipment they personally borrowed
    if (userRole !== 'admin' && String(borrowerId) !== String(reviewerId)) {
      if (req.session) req.session.flash = { error: 'Access Denied: You can only submit reviews for equipment you personally borrowed.' };
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access Denied: You can only submit reviews for equipment you personally borrowed.</p>');
    }

    // State machine check: Request must be returned before review
    if (borrowRequest.status !== 'returned') {
      if (req.session) req.session.flash = { error: 'Reviews may only be submitted after equipment return has been verified.' };
      return res.status(400).send('<h1>400 Bad Request</h1><p>Reviews may only be submitted after equipment return has been verified.</p>');
    }

    // Trust Score Manipulation Defense: Check for duplicate review submission
    const existingReview = await Review.findOne({ borrowRequest: requestId });
    if (existingReview) {
      if (req.session) req.session.flash = { error: 'A review has already been submitted for this borrow order.' };
      return res.status(400).send('<h1>400 Bad Request</h1><p>A review has already been submitted for this borrow order.</p>');
    }

    // Input Validation: Clamp ratings between 1 and 5
    const cleanRating = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));
    const cleanPunctuality = Math.min(5, Math.max(1, parseInt(punctualityRating, 10) || 5));
    const cleanCondition = Math.min(5, Math.max(1, parseInt(conditionRating, 10) || 5));

    await Review.create({
      equipment: equipmentId || borrowRequest.equipment,
      borrowRequest: requestId,
      reviewer: reviewerId,
      rating: cleanRating,
      punctualityRating: cleanPunctuality,
      conditionRating: cleanCondition,
      comment: comment ? comment.trim() : 'Great condition, very helpful for practical coursework.'
    });

    // Award +3 Trust Score points for legitimate on-time return & review
    if (reviewerId) {
      const user = await User.findById(reviewerId);
      if (user) {
        user.trustScore = Math.min(100, (user.trustScore || 85) + 3);
        user.totalBorrowed = (user.totalBorrowed || 0) + 1;
        await user.save();
        if (req.session.user) {
          req.session.user.trustScore = user.trustScore;
        }
      }
    }

    if (req.session) {
      req.session.flash = { 
        success: 'Thank you! Your rating was submitted. Your Trust Score increased by +3 points!' 
      };
    }
    res.redirect('/borrow/my-loans');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  newForm,
  create
};
