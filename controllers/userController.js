const User = require('../models/User');
const BorrowRequest = require('../models/BorrowRequest');
const Review = require('../models/Review');

async function profile(req, res, next) {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user._id) : null;
    let user = await User.findById(userId);
    if (!user) {
      user = req.session.user;
    }

    const borrowHistory = await BorrowRequest.find({
      borrower: userId,
      status: 'returned'
    }).populate('equipment');

    const reviewsReceived = await Review.find({
      reviewee: userId
    }).populate('reviewer').populate('equipment');

    res.render('users/profile', {
      pageTitle: `${user.name} — Student Profile & Trust Score`,
      user,
      borrowHistory,
      reviewsReceived
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  profile
};
